import jwt from 'jsonwebtoken';
import prisma from '../../lib/prisma.js';

export function authMiddleware(req, res, next) {
  const header = req.headers.authorization;
  const token = (header?.startsWith('Bearer ') ? header.slice(7) : null) ?? req.cookies?.token;

  if (!token) {
    return res.status(401).json({ error: 'Missing or invalid authorization header' });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
    req.user = payload;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
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
    if (!user || user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }
    req.user.role = user.role;
    next();
  } catch (err) {
    next(err);
  }
}
