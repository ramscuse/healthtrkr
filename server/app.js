import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import { fileURLToPath } from 'url';
import path from 'path';

import { authMiddleware, requireAdmin } from './middleware/auth.js';
import { errorHandler } from './middleware/errorHandler.js';

import authRouter from './routes/auth.js';
import accountRouter from './routes/account.js';
import goalsRouter from './routes/goals.js';
import mealsRouter from './routes/meals.js';
import workoutsRouter, { workoutsTemplateHandler } from './routes/workouts.js';
import healthRouter from './routes/health.js';
import progressRouter from './routes/progress.js';
import waterRouter from './routes/water.js';
import adminRouter from './routes/admin.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

// Trust the first hop of X-Forwarded-* headers (Vercel edge, Render/Proxmox reverse proxies).
// Without this, req.secure is false behind HTTPS-terminating proxies and the rate limiter
// sees every request from the same proxy IP.
app.set('trust proxy', 1);

app.use(cors({ origin: process.env.CORS_ORIGIN || 'http://localhost:5173', credentials: true }));
app.use(express.json({ limit: '100kb' }));
app.use(cookieParser());

// Rate limit auth endpoints — 20 requests per 15 minutes per IP
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
});

// Rate limit health sync — 60 requests per minute (Apple Watch syncs frequently)
const syncLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Sync rate limit exceeded.' },
});

app.use('/api/auth', authLimiter, authRouter);
app.use('/api/account', authMiddleware, accountRouter);
app.use('/api/goals', authMiddleware, goalsRouter);
app.use('/api/meals', authMiddleware, mealsRouter);
app.get('/api/workouts/template', workoutsTemplateHandler);
app.use('/api/workouts', authMiddleware, workoutsRouter);
app.use('/api/health/sync', syncLimiter);
app.use('/api/health', healthRouter);
app.use('/api/progress', authMiddleware, progressRouter);
app.use('/api/water', authMiddleware, waterRouter);
app.use('/api/admin', authMiddleware, requireAdmin, adminRouter);

if (process.env.NODE_ENV === 'production') {
  // Docker/Proxmox path only — on Vercel, static files are served before this
  // function is invoked (per vercel.json rewrites), so this branch never runs there.
  const distPath = path.join(__dirname, '..', 'src', 'dist');
  app.use(express.static(distPath));
  // Exclude /api/* from the SPA fallback so API typos return 404, not index.html
  app.get(/^(?!\/api\/).*/, (req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

app.use(errorHandler);

export default app;
