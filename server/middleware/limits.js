import rateLimit, { ipKeyGenerator } from "express-rate-limit";

// Keyed on userId when authenticated (so NAT neighbours don't share a bucket),
// else IP. ipKeyGenerator collapses IPv6 to its /64 so rotating addresses
// within one allocation doesn't dodge the limit.
function userOrIp(req) {
  if (req.user?.userId) return `u:${req.user.userId}`;
  return `ip:${ipKeyGenerator(req.ip)}`;
}

const COMMON = { standardHeaders: true, legacyHeaders: false };
const TOO_MANY = { error: "Too many requests, please try again later." };

// Whole /api/auth router, IP-keyed (no req.user yet): slows credential stuffing.
export const authLimiter = rateLimit({
  ...COMMON,
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: TOO_MANY,
});

// Every authenticated API router.
export const apiLimiter = rateLimit({
  ...COMMON,
  windowMs: 15 * 60 * 1000,
  max: 200,
  keyGenerator: userOrIp,
  message: TOO_MANY,
});

// PUT /api/auth/password, mounted after authMiddleware so it keys on userId.
export const passwordChangeLimiter = rateLimit({
  ...COMMON,
  windowMs: 60 * 60 * 1000,
  max: 5,
  keyGenerator: userOrIp,
  message: { error: "Too many password change attempts. Try again later." },
});
