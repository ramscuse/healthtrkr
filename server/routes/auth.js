import { Router } from "express";
import bcrypt from "bcrypt";
import crypto from "crypto";
import prisma from "../../lib/prisma.js";
import { sendPasswordResetEmail } from "../../lib/email.js";
import { authMiddleware, signToken } from "../middleware/auth.js";
import { validatePassword, SALT_ROUNDS } from "../lib/passwordPolicy.js";
import { passwordChangeLimiter } from "../middleware/limits.js";

const router = Router();
const IS_PROD = process.env.NODE_ENV === "production";

const TOKEN_COOKIE_OPTS = {
  httpOnly: true,
  // strict = no cross-site request carries the JWT (our CSRF defence); it's
  // only sent by same-origin XHR so there's no UX cost. sessionHint stays lax
  // so a top-level navigation back into the app still sees the session.
  sameSite: IS_PROD ? "strict" : "lax",
  secure: IS_PROD,
  path: "/",
};

const HINT_COOKIE_OPTS = {
  httpOnly: false,
  sameSite: "lax",
  secure: IS_PROD,
  path: "/",
};

const COOKIE_MAX_AGE_MS = 10 * 365 * 24 * 60 * 60 * 1000;

function setAuthCookies(res, user) {
  res.cookie("token", signToken(user), { ...TOKEN_COOKIE_OPTS, maxAge: COOKIE_MAX_AGE_MS });
  res.cookie("sessionHint", "1", { ...HINT_COOKIE_OPTS, maxAge: COOKIE_MAX_AGE_MS });
}

// Clear with the same attributes they were set with, or browsers keep them.
function clearAuthCookies(res) {
  res.clearCookie("token", TOKEN_COOKIE_OPTS);
  res.clearCookie("sessionHint", HINT_COOKIE_OPTS);
}

router.post("/register", async (req, res, next) => {
  try {
    const { email, password, name } = req.body;

    if (!email || !password || !name) {
      return res.status(400).json({ error: "email, password, and name are required" });
    }
    const passwordError = validatePassword(password);
    if (passwordError) return res.status(400).json({ error: passwordError });

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      // Pay the same bcrypt cost as the success path so timing doesn't
      // reveal that the email is taken (the body is already identical).
      await bcrypt.hash(password, SALT_ROUNDS);
      return res.status(201).json({ user: null });
    }

    const hashed = await bcrypt.hash(password, SALT_ROUNDS);
    const user = await prisma.user.create({
      data: { email, password: hashed, name, darkMode: true },
    });

    setAuthCookies(res, user);
    res.status(201).json({ user: { id: user.id, email: user.email, name: user.name } });
  } catch (err) {
    next(err);
  }
});

router.post("/login", async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: "email and password are required" });
    }

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    setAuthCookies(res, user);
    res.json({ user: { id: user.id, email: user.email, name: user.name } });
  } catch (err) {
    next(err);
  }
});

// PUT /api/auth/password — authMiddleware (revocation check) runs before the
// 5/hour per-user passwordChangeLimiter.
router.put("/password", authMiddleware, passwordChangeLimiter, async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: "currentPassword and newPassword are required" });
    }
    const passwordError = validatePassword(newPassword);
    if (passwordError) return res.status(400).json({ error: passwordError });

    const user = await prisma.user.findUnique({ where: { id: req.user.userId } });
    if (!user) return res.status(404).json({ error: "User not found" });

    const match = await bcrypt.compare(currentPassword, user.password);
    if (!match) return res.status(401).json({ error: "Current password is incorrect" });

    const hashed = await bcrypt.hash(newPassword, SALT_ROUNDS);
    // Bump tokenVersion so every other active session is killed on the next
    // request — the changing user gets a fresh cookie below.
    const updated = await prisma.user.update({
      where: { id: user.id },
      data: { password: hashed, tokenVersion: { increment: 1 } },
    });
    setAuthCookies(res, updated);

    res.json({ message: "Password updated successfully" });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/forgot-password — generate & email a 6-digit reset code
router.post("/forgot-password", async (req, res, next) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: "email is required" });

    // Lazily reap used/expired tokens (no cron) alongside the user lookup.
    const [, user] = await Promise.all([
      prisma.passwordResetToken.deleteMany({
        where: { OR: [{ used: true }, { expiresAt: { lt: new Date() } }] },
      }),
      prisma.user.findUnique({ where: { email } }),
    ]);
    // Same 200 either way so the response doesn't reveal whether the email exists.
    if (!user) return res.json({ message: "If that email exists, a code has been sent." });

    // Only the newest code is ever valid.
    await prisma.passwordResetToken.updateMany({
      where: { userId: user.id, used: false },
      data: { used: true },
    });

    const code = String(crypto.randomInt(100000, 999999));
    const hashed = await bcrypt.hash(code, SALT_ROUNDS);
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

    await prisma.passwordResetToken.create({
      data: { userId: user.id, token: hashed, expiresAt },
    });

    await sendPasswordResetEmail(email, code);

    res.json({ message: "If that email exists, a code has been sent." });
  } catch (err) {
    next(err);
  }
});

const MAX_RESET_ATTEMPTS = 5;

// POST /api/auth/reset-password — verify code and set new password
router.post("/reset-password", async (req, res, next) => {
  try {
    const { email, code, newPassword } = req.body;
    if (!email || !code || !newPassword) {
      return res.status(400).json({ error: "email, code, and newPassword are required" });
    }
    const passwordError = validatePassword(newPassword);
    if (passwordError) return res.status(400).json({ error: passwordError });

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return res.status(400).json({ error: "Invalid or expired code" });

    const resetToken = await prisma.passwordResetToken.findFirst({
      where: { userId: user.id, used: false, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: "desc" },
    });
    if (!resetToken) return res.status(400).json({ error: "Invalid or expired code" });

    const match = await bcrypt.compare(code, resetToken.token);
    if (!match) {
      // Lock on the post-increment value, not the stale read, so concurrent
      // wrong guesses near the threshold can't all slip under it.
      const after = await prisma.passwordResetToken.update({
        where: { id: resetToken.id },
        data: { attempts: { increment: 1 } },
        select: { attempts: true },
      });
      if (after.attempts >= MAX_RESET_ATTEMPTS) {
        await prisma.passwordResetToken.update({
          where: { id: resetToken.id },
          data: { used: true },
        });
      }
      return res.status(400).json({ error: "Invalid or expired code" });
    }

    // Claim the token conditionally (still unused + unexpired) so two
    // concurrent requests that both passed bcrypt can't both spend it; only
    // the winner rewrites the password and bumps tokenVersion.
    const hashed = await bcrypt.hash(newPassword, SALT_ROUNDS);
    const claimed = await prisma.$transaction(async (tx) => {
      const result = await tx.passwordResetToken.updateMany({
        where: { id: resetToken.id, used: false, expiresAt: { gt: new Date() } },
        data: { used: true },
      });
      if (result.count !== 1) return false;
      await tx.user.update({
        where: { id: user.id },
        data: { password: hashed, tokenVersion: { increment: 1 } },
      });
      return true;
    });

    if (!claimed) {
      return res.status(400).json({ error: "Invalid or expired code" });
    }

    res.json({ message: "Password reset successfully." });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/logout — behind authMiddleware so a revoked token can't keep
// bumping tokenVersion to kill the real user's live sessions.
router.post("/logout", authMiddleware, async (req, res, next) => {
  try {
    await prisma.user.update({
      where: { id: req.user.userId },
      data: { tokenVersion: { increment: 1 } },
    });
    clearAuthCookies(res);
    res.json({ message: "Logged out" });
  } catch (err) {
    next(err);
  }
});

export default router;
