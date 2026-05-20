import { Router } from 'express';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import prisma from '../../lib/prisma.js';
import { sendPasswordResetEmail } from '../../lib/email.js';
import { authMiddleware, JWT_SIGN_OPTIONS } from '../middleware/auth.js';
import { validatePassword } from '../lib/passwordPolicy.js';
import { passwordChangeLimiter } from '../middleware/limits.js';

const router = Router();
const SALT_ROUNDS = 12;
const IS_PROD = process.env.NODE_ENV === 'production';

const TOKEN_COOKIE_OPTS = {
  httpOnly: true,
  // sameSite=strict on the token cookie blocks any cross-site request from
  // carrying it — closes the practical CSRF surface for our cookie-authed
  // mutations. The token cookie is only ever read by same-origin XHR, so
  // strict has no UX cost. sessionHint stays 'lax' so a top-level navigation
  // back into the app still detects the existing session.
  sameSite: IS_PROD ? 'strict' : 'lax',
  secure: IS_PROD,
  path: '/',
};

const HINT_COOKIE_OPTS = {
  httpOnly: false,
  sameSite: 'lax',
  secure: IS_PROD,
  path: '/',
};

const COOKIE_MAX_AGE_MS = 10 * 365 * 24 * 60 * 60 * 1000;

function signToken(user) {
  return jwt.sign(
    { userId: user.id, tokenVersion: user.tokenVersion },
    process.env.JWT_SECRET,
    JWT_SIGN_OPTIONS,
  );
}

function setAuthCookies(res, token) {
  res.cookie('token', token, { ...TOKEN_COOKIE_OPTS, maxAge: COOKIE_MAX_AGE_MS });
  res.cookie('sessionHint', '1', { ...HINT_COOKIE_OPTS, maxAge: COOKIE_MAX_AGE_MS });
}

function clearAuthCookies(res) {
  // clearCookie must use the same attributes as the original set, or browsers
  // ignore it. We need two variants: token (sameSite=strict|lax, secure in prod)
  // and sessionHint (sameSite=lax, secure in prod).
  res.clearCookie('token', {
    path: '/',
    sameSite: TOKEN_COOKIE_OPTS.sameSite,
    secure: TOKEN_COOKIE_OPTS.secure,
  });
  res.clearCookie('sessionHint', {
    path: '/',
    sameSite: HINT_COOKIE_OPTS.sameSite,
    secure: HINT_COOKIE_OPTS.secure,
  });
}

router.post('/register', async (req, res, next) => {
  try {
    const { email, password, name } = req.body;

    if (!email || !password || !name) {
      return res.status(400).json({ error: 'email, password, and name are required' });
    }
    const passwordError = validatePassword(password);
    if (passwordError) return res.status(400).json({ error: passwordError });

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      // Burn the same bcrypt time the success path pays so registration
      // response time doesn't reveal whether the email is taken — the body
      // is already constant, but the timing channel is the real oracle.
      await bcrypt.hash(password, SALT_ROUNDS);
      return res.status(201).json({ user: null });
    }

    const hashed = await bcrypt.hash(password, SALT_ROUNDS);
    const user = await prisma.user.create({
      data: { email, password: hashed, name },
    });

    const token = signToken(user);
    setAuthCookies(res, token);
    res.status(201).json({ user: { id: user.id, email: user.email, name: user.name } });
  } catch (err) {
    next(err);
  }
});

router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;

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

    const token = signToken(user);
    setAuthCookies(res, token);
    res.json({ user: { id: user.id, email: user.email, name: user.name } });
  } catch (err) {
    next(err);
  }
});

// PUT /api/auth/password — protected; authMiddleware enforces a single
// 401-shape contract and runs the revocation check before we ever touch the
// password. passwordChangeLimiter caps at 5/hour keyed on userId.
router.put('/password', authMiddleware, passwordChangeLimiter, async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'currentPassword and newPassword are required' });
    }
    const passwordError = validatePassword(newPassword);
    if (passwordError) return res.status(400).json({ error: passwordError });

    const user = await prisma.user.findUnique({ where: { id: req.user.userId } });
    if (!user) return res.status(404).json({ error: 'User not found' });

    const match = await bcrypt.compare(currentPassword, user.password);
    if (!match) return res.status(401).json({ error: 'Current password is incorrect' });

    const hashed = await bcrypt.hash(newPassword, SALT_ROUNDS);
    // Bump tokenVersion so every other active session is killed on the next
    // request — the changing user gets a fresh cookie below.
    const updated = await prisma.user.update({
      where: { id: user.id },
      data: { password: hashed, tokenVersion: { increment: 1 } },
    });
    setAuthCookies(res, signToken(updated));

    res.json({ message: 'Password updated successfully' });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/forgot-password — generate & email a 6-digit reset code
router.post('/forgot-password', async (req, res, next) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'email is required' });

    // Reap expired and used tokens lazily — keeps the table from growing forever
    // without needing a separate cron job. Cheap at single-tenant scale.
    await prisma.passwordResetToken.deleteMany({
      where: { OR: [{ used: true }, { expiresAt: { lt: new Date() } }] },
    });

    // Always respond 200 so we don't leak whether the email exists
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return res.json({ message: 'If that email exists, a code has been sent.' });

    // Invalidate any existing tokens for this user
    await prisma.passwordResetToken.updateMany({
      where: { userId: user.id, used: false },
      data: { used: true },
    });

    // Generate a 6-digit code
    const code = String(crypto.randomInt(100000, 999999));
    const hashed = await bcrypt.hash(code, SALT_ROUNDS);
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 min

    await prisma.passwordResetToken.create({
      data: { userId: user.id, token: hashed, expiresAt },
    });

    await sendPasswordResetEmail(email, code);

    res.json({ message: 'If that email exists, a code has been sent.' });
  } catch (err) {
    next(err);
  }
});

const MAX_RESET_ATTEMPTS = 5;

// POST /api/auth/reset-password — verify code and set new password
router.post('/reset-password', async (req, res, next) => {
  try {
    const { email, code, newPassword } = req.body;
    if (!email || !code || !newPassword) {
      return res.status(400).json({ error: 'email, code, and newPassword are required' });
    }
    const passwordError = validatePassword(newPassword);
    if (passwordError) return res.status(400).json({ error: passwordError });

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return res.status(400).json({ error: 'Invalid or expired code' });

    // Find the most recent valid token
    const resetToken = await prisma.passwordResetToken.findFirst({
      where: { userId: user.id, used: false, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    });
    if (!resetToken) return res.status(400).json({ error: 'Invalid or expired code' });

    const match = await bcrypt.compare(code, resetToken.token);
    if (!match) {
      // Increment-then-conditionally-lock. Using the post-increment value
      // (rather than the stale read) makes the lockout boundary race-safe:
      // two concurrent wrong-code POSTs near the threshold both observe the
      // canonical post-increment count and one of them will see `>= MAX` and
      // lock the row.
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
      return res.status(400).json({ error: 'Invalid or expired code' });
    }

    // Mark token used, update password, bump tokenVersion to invalidate any
    // other active sessions for this user.
    const hashed = await bcrypt.hash(newPassword, SALT_ROUNDS);
    await prisma.$transaction([
      prisma.passwordResetToken.update({ where: { id: resetToken.id }, data: { used: true } }),
      prisma.user.update({
        where: { id: user.id },
        data: { password: hashed, tokenVersion: { increment: 1 } },
      }),
    ]);

    res.json({ message: 'Password reset successfully.' });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/logout — protected; mounting behind authMiddleware blocks
// session-bump DoS where someone with a captured-but-revoked token could
// hammer this endpoint to keep killing the legitimate user's live sessions.
router.post('/logout', authMiddleware, async (req, res, next) => {
  try {
    await prisma.user.update({
      where: { id: req.user.userId },
      data: { tokenVersion: { increment: 1 } },
    });
    clearAuthCookies(res);
    res.json({ message: 'Logged out' });
  } catch (err) {
    next(err);
  }
});

export default router;
