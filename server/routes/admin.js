import { Router } from "express";
import bcrypt from "bcrypt";
import prisma from "../../lib/prisma.js";
import { validatePassword, SALT_ROUNDS } from "../lib/passwordPolicy.js";

const router = Router();
const VALID_ROLES = ["user", "admin"];

// Thrown inside a transaction to roll it back; the route's catch turns it into a 4xx.
function httpError(status, message) {
  return Object.assign(new Error(message), { httpStatus: status });
}

const USER_SELECT = {
  id: true,
  email: true,
  name: true,
  role: true,
  darkMode: true,
  createdAt: true,
  _count: {
    select: {
      meals: true,
      workouts: true,
      waterEntries: true,
      healthData: true,
    },
  },
};

// GET /api/admin/users — list every user
router.get("/users", async (req, res, next) => {
  try {
    const users = await prisma.user.findMany({
      select: USER_SELECT,
      orderBy: { createdAt: "desc" },
    });
    res.json(users);
  } catch (err) {
    next(err);
  }
});

// GET /api/admin/users/:id — single user
router.get("/users/:id", async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.params.id },
      select: USER_SELECT,
    });
    if (!user) return res.status(404).json({ error: "User not found" });
    res.json(user);
  } catch (err) {
    next(err);
  }
});

// GET /api/admin/audit — paginated admin action log
router.get("/audit", async (req, res, next) => {
  try {
    const { targetUserId, adminId } = req.query;
    const rawLimit = parseInt(req.query.limit, 10);
    const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(rawLimit, 1), 200) : 50;

    const where = {};
    if (typeof targetUserId === "string") where.targetUserId = targetUserId;
    if (typeof adminId === "string") where.adminId = adminId;

    const entries = await prisma.adminAuditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
      include: {
        admin: { select: { id: true, email: true, name: true } },
        target: { select: { id: true, email: true, name: true } },
      },
    });
    res.json(entries);
  } catch (err) {
    next(err);
  }
});

// PUT /api/admin/users/:id — update name / role / darkMode
router.put("/users/:id", async (req, res, next) => {
  try {
    const { name, role, darkMode } = req.body;
    const data = {};

    if (name !== undefined) {
      if (typeof name !== "string") {
        return res.status(400).json({ error: "name must be a string" });
      }
      const trimmed = name.trim();
      if (trimmed.length === 0 || trimmed.length > 100) {
        return res.status(400).json({ error: "name must be between 1 and 100 characters" });
      }
      data.name = trimmed;
    }

    if (role !== undefined) {
      if (!VALID_ROLES.includes(role)) {
        return res.status(400).json({ error: `role must be one of: ${VALID_ROLES.join(", ")}` });
      }
      data.role = role;
    }

    if (darkMode !== undefined) {
      if (typeof darkMode !== "boolean") {
        return res.status(400).json({ error: "darkMode must be a boolean" });
      }
      data.darkMode = darkMode;
    }

    if (Object.keys(data).length === 0) {
      return res.status(400).json({ error: "No editable fields provided" });
    }

    const actorId = req.user.userId;

    // Target is read inside the Serializable transaction so the last-admin
    // guard and the update see the same snapshot.
    const updated = await prisma.$transaction(
      async (tx) => {
        const target = await tx.user.findUnique({
          where: { id: req.params.id },
          select: { id: true, email: true, name: true, role: true, darkMode: true },
        });
        if (!target) throw httpError(404, "User not found");

        if (target.role === "admin" && data.role === "user") {
          const adminCount = await tx.user.count({ where: { role: "admin" } });
          if (adminCount <= 1) throw httpError(400, "Cannot demote the last admin");
        }

        // Snapshot the actor before the update so a self-edit logs the old name.
        const actor =
          actorId === target.id
            ? { email: target.email, name: target.name }
            : await tx.user.findUnique({
                where: { id: actorId },
                select: { email: true, name: true },
              });

        const updatedUser = await tx.user.update({
          where: { id: target.id },
          data,
          select: USER_SELECT,
        });

        // Log only fields that actually changed, plus actor/target identity so
        // the row stays readable after a later delete nulls either FK.
        const before = {};
        const after = {};
        for (const key of Object.keys(data)) {
          if (target[key] !== data[key]) {
            before[key] = target[key];
            after[key] = data[key];
          }
        }
        if (Object.keys(after).length > 0) {
          await tx.adminAuditLog.create({
            data: {
              adminId: actorId,
              targetUserId: target.id,
              action: "role" in after ? "ROLE_CHANGE" : "PROFILE_UPDATE",
              before: {
                ...before,
                actor,
                target: { email: target.email, name: target.name, role: target.role },
              },
              after,
            },
          });
        }

        return updatedUser;
      },
      { isolationLevel: "Serializable" }
    );
    res.json(updated);
  } catch (err) {
    if (err.httpStatus) return res.status(err.httpStatus).json({ error: err.message });
    next(err);
  }
});

// PUT /api/admin/users/:id/password — admin sets a new password directly
router.put("/users/:id/password", async (req, res, next) => {
  try {
    const { newPassword } = req.body;
    const passwordError = validatePassword(newPassword);
    if (passwordError) return res.status(400).json({ error: passwordError });

    const actorId = req.user.userId;
    const [target, actor] = await Promise.all([
      prisma.user.findUnique({
        where: { id: req.params.id },
        select: { id: true, email: true, name: true },
      }),
      prisma.user.findUnique({ where: { id: actorId }, select: { email: true, name: true } }),
    ]);
    if (!target) return res.status(404).json({ error: "User not found" });

    const hashed = await bcrypt.hash(newPassword, SALT_ROUNDS);

    // Atomically: rotate password, bump tokenVersion (kills target's sessions),
    // void outstanding self-serve reset codes, and write the audit row.
    await prisma.$transaction([
      prisma.user.update({
        where: { id: target.id },
        data: { password: hashed, tokenVersion: { increment: 1 } },
      }),
      prisma.passwordResetToken.updateMany({
        where: { userId: target.id, used: false },
        data: { used: true },
      }),
      prisma.adminAuditLog.create({
        data: {
          adminId: actorId,
          targetUserId: target.id,
          action: "PASSWORD_RESET",
          before: { actor, target: { email: target.email, name: target.name } },
        },
      }),
    ]);

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/admin/users/:id — delete user (cascades to all related rows)
router.delete("/users/:id", async (req, res, next) => {
  try {
    if (req.user.userId === req.params.id) {
      return res.status(400).json({ error: "Admins cannot delete their own account" });
    }

    const actorId = req.user.userId;

    // Same-snapshot last-admin guard as PUT (a concurrent demote + delete
    // could otherwise empty the admin set).
    await prisma.$transaction(
      async (tx) => {
        const target = await tx.user.findUnique({
          where: { id: req.params.id },
          select: { id: true, email: true, name: true, role: true },
        });
        if (!target) throw httpError(404, "User not found");
        if (target.role === "admin") {
          const adminCount = await tx.user.count({ where: { role: "admin" } });
          if (adminCount <= 1) throw httpError(400, "Cannot delete the last admin");
        }
        // Identity snapshot keeps the row readable once the delete nulls targetUserId.
        const actor = await tx.user.findUnique({
          where: { id: actorId },
          select: { email: true, name: true },
        });
        await tx.adminAuditLog.create({
          data: {
            adminId: actorId,
            targetUserId: target.id,
            action: "DELETE",
            before: {
              actor,
              target: { email: target.email, name: target.name, role: target.role },
            },
          },
        });
        await tx.user.delete({ where: { id: target.id } });
      },
      { isolationLevel: "Serializable" }
    );
    res.status(204).end();
  } catch (err) {
    if (err.httpStatus) return res.status(err.httpStatus).json({ error: err.message });
    next(err);
  }
});

export default router;
