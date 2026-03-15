import { Router } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import prisma from '../lib/prisma.js';
import { sendPasswordResetEmail } from '../lib/email.js';

const router = Router();
const SALT_ROUNDS = 12;

const BASE_COOKIE_OPTS = {
  httpOnly: true,
  sameSite: 'lax',
  path: '/',
  ...(process.env.NODE_ENV === 'production' && { secure: true }),
};

function setAuthCookie(res, token, rememberMe) {
  const maxAge = rememberMe === true ? 30 * 24 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000;
  res.cookie('token', token, { ...BASE_COOKIE_OPTS, maxAge });
}

router.post('/register', async (req, res, next) => {
  try {
    const { email, password, name } = req.body;

    if (!email || !password || !name) {
      return res.status(400).json({ error: 'email, password, and name are required' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return res.status(400).json({ error: 'An account with that email already exists' });
    }

    const hashed = await bcrypt.hash(password, SALT_ROUNDS);
    const user = await prisma.user.create({
      data: { email, password: hashed, name },
    });

    const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET, { expiresIn: '1d' });

    setAuthCookie(res, token, false);
    res.status(201).json({ token, user: { id: user.id, email: user.email, name: user.name } });
  } catch (err) {
    next(err);
  }
});

router.post('/login', async (req, res, next) => {
  try {
    const { email, password, rememberMe } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'email and password are required' });
    }

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const expiresIn = rememberMe === true ? '30d' : '24h';
    const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET, { expiresIn });

    setAuthCookie(res, token, rememberMe === true);
    res.json({ token, user: { id: user.id, email: user.email, name: user.name } });
  } catch (err) {
    next(err);
  }
});

// PUT /api/auth/password — protected, requires current password
router.put('/password', async (req, res, next) => {
  try {
    const header = req.headers.authorization;
    const token = (header?.startsWith('Bearer ') ? header.slice(7) : null) ?? req.cookies?.token;
    if (!token) {
      return res.status(401).json({ error: 'Missing or invalid authorization header' });
    }

    let payload;
    try {
      payload = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
    } catch {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'currentPassword and newPassword are required' });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'New password must be at least 6 characters' });
    }

    const user = await prisma.user.findUnique({ where: { id: payload.userId } });
    if (!user) return res.status(404).json({ error: 'User not found' });

    const match = await bcrypt.compare(currentPassword, user.password);
    if (!match) return res.status(401).json({ error: 'Current password is incorrect' });

    const hashed = await bcrypt.hash(newPassword, SALT_ROUNDS);
    await prisma.user.update({ where: { id: user.id }, data: { password: hashed } });

    res.json({ message: 'Password updated successfully' });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/forgot-password — generate & email a 6-digit reset code
router.post('/forgot-password', async (req, res, next) => {
  try {
    const { email } = req.body
    if (!email) return res.status(400).json({ error: 'email is required' })

    // Always respond 200 so we don't leak whether the email exists
    const user = await prisma.user.findUnique({ where: { email } })
    if (!user) return res.json({ message: 'If that email exists, a code has been sent.' })

    // Invalidate any existing tokens for this user
    await prisma.passwordResetToken.updateMany({
      where: { userId: user.id, used: false },
      data: { used: true },
    })

    // Generate a 6-digit code
    const code = String(crypto.randomInt(100000, 999999))
    const hashed = await bcrypt.hash(code, SALT_ROUNDS)
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000) // 15 min

    await prisma.passwordResetToken.create({
      data: { userId: user.id, token: hashed, expiresAt },
    })

    await sendPasswordResetEmail(email, code)

    res.json({ message: 'If that email exists, a code has been sent.' })
  } catch (err) {
    next(err)
  }
})

// POST /api/auth/reset-password — verify code and set new password
router.post('/reset-password', async (req, res, next) => {
  try {
    const { email, code, newPassword } = req.body
    if (!email || !code || !newPassword) {
      return res.status(400).json({ error: 'email, code, and newPassword are required' })
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' })
    }

    const user = await prisma.user.findUnique({ where: { email } })
    if (!user) return res.status(400).json({ error: 'Invalid or expired code' })

    // Find the most recent valid token
    const resetToken = await prisma.passwordResetToken.findFirst({
      where: { userId: user.id, used: false, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    })
    if (!resetToken) return res.status(400).json({ error: 'Invalid or expired code' })

    const match = await bcrypt.compare(code, resetToken.token)
    if (!match) return res.status(400).json({ error: 'Invalid or expired code' })

    // Mark token used and update password in a transaction
    const hashed = await bcrypt.hash(newPassword, SALT_ROUNDS)
    await prisma.$transaction([
      prisma.passwordResetToken.update({ where: { id: resetToken.id }, data: { used: true } }),
      prisma.user.update({ where: { id: user.id }, data: { password: hashed } }),
    ])

    res.json({ message: 'Password reset successfully.' })
  } catch (err) {
    next(err)
  }
})

router.post('/logout', (req, res) => {
  res.clearCookie('token', BASE_COOKIE_OPTS);
  res.json({ message: 'Logged out' });
});

export default router;
