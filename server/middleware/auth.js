import jwt from "jsonwebtoken";
import prisma from "../../lib/prisma.js";

export const JWT_VERIFY_OPTIONS = {
  algorithms: ["HS256"],
  issuer: "healthtrkr",
  audience: "healthtrkr-web",
};

export const JWT_SIGN_OPTIONS = {
  algorithm: "HS256",
  issuer: "healthtrkr",
  audience: "healthtrkr-web",
};

export async function authMiddleware(req, res, next) {
  const header = req.headers.authorization;
  const token = (header?.startsWith("Bearer ") ? header.slice(7) : null) ?? req.cookies?.token;

  if (!token) {
    return res.status(401).json({ error: "Missing or invalid authorization header" });
  }

  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET, JWT_VERIFY_OPTIONS);
  } catch {
    return res.status(401).json({ error: "Invalid or expired token" });
  }

  // Reject malformed-but-signature-valid payloads (e.g. tokens minted by an
  // adjacent service sharing the secret). Guarding the types up front means
  // a missing userId doesn't blow up `findUnique({ where: { id: undefined } })`
  // into a Prisma validation error / 500.
  if (
    typeof payload.userId !== "string" ||
    !Number.isInteger(payload.tokenVersion) ||
    !Number.isInteger(payload.iat)
  ) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }

  // Revocation check: every mutating action (logout, password change, reset,
  // admin-set-password) bumps User.tokenVersion. A token whose version no
  // longer matches the user's current version is dead, regardless of `exp`.
  try {
    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: { tokenVersion: true },
    });
    if (!user || user.tokenVersion !== payload.tokenVersion) {
      return res.status(401).json({ error: "Invalid or expired token" });
    }
    req.user = payload;
    next();
  } catch (err) {
    next(err);
  }
}

// Per-request role lookup. The JWT intentionally does NOT carry role — a
// demoted admin would otherwise keep admin powers until their token expires.
export async function requireAdmin(req, res, next) {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.userId },
      select: { role: true },
    });
    if (!user || user.role !== "admin") {
      return res.status(403).json({ error: "Admin access required" });
    }
    req.user.role = user.role;
    next();
  } catch (err) {
    next(err);
  }
}
