import rateLimit, { ipKeyGenerator } from "express-rate-limit";

// Keyed on the authenticated userId when available, falling back to IP. This
// stops one user behind a NAT from being throttled by a noisy neighbour while
// still capping anonymous traffic. ipKeyGenerator normalises IPv6 addresses
// (takes the /64 prefix) so attackers can't trivially bypass the IP-fallback
// bucket by rotating within their allocation. Signature is `(ip, subnet?)` in
// express-rate-limit v8.
function userOrIp(req) {
  if (req.user?.userId) return `u:${req.user.userId}`;
  return `ip:${ipKeyGenerator(req.ip)}`;
}

// Auth endpoints (login, register, reset-password): IP-keyed because there's
// no req.user yet. Tight cap to slow credential-stuffing.
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, please try again later." },
});

// General authenticated API limiter.
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: userOrIp,
  message: { error: "Too many requests, please try again later." },
});

// Stricter cap on the password-change endpoint specifically. The auth router
// is not behind authMiddleware (login/register need to stay open) — the
// handler verifies the JWT itself — so req.user isn't populated when this
// limiter runs. The IPv6-safe IP fallback kicks in in practice.
export const passwordChangeLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: userOrIp,
  message: { error: "Too many password change attempts. Try again later." },
});
