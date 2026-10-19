import jwt from "jsonwebtoken";
import prisma from "../../lib/prisma.js";

const JWT_CLAIMS = { issuer: "healthtrkr", audience: "healthtrkr-web" };

// No `exp`: revocation is server-side via User.tokenVersion (see authMiddleware).
export function signToken(user) {
  return jwt.sign({ userId: user.id, tokenVersion: user.tokenVersion }, process.env.JWT_SECRET, {
    algorithm: "HS256",
    ...JWT_CLAIMS,
  });
}

export async function authMiddleware(req, res, next) {
  const header = req.headers.authorization;
  const token = (header?.startsWith("Bearer ") ? header.slice(7) : null) ?? req.cookies?.token;

  if (!token) {
    return res.status(401).json({ error: "Missing or invalid authorization header" });
  }

  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ["HS256"], ...JWT_CLAIMS });
  } catch {
    return res.status(401).json({ error: "Invalid or expired token" });
  }

  // Reject signature-valid but malformed payloads before they reach Prisma
  // (an undefined userId would surface as a 500, not a 401).
  if (
    typeof payload.userId !== "string" ||
    !Number.isInteger(payload.tokenVersion) ||
    !Number.isInteger(payload.iat)
  ) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }

  // Revocation check: logout, password change/reset and admin-set-password
  // bump User.tokenVersion, killing every token minted before.
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

// Role is looked up per request, not carried in the JWT, so a demotion takes
// effect immediately.
export async function requireAdmin(req, res, next) {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.userId },
      select: { role: true },
    });
    if (user?.role !== "admin") {
      return res.status(403).json({ error: "Admin access required" });
    }
    next();
  } catch (err) {
    next(err);
  }
}
