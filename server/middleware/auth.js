import jwt from 'jsonwebtoken';

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
