import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { fileURLToPath } from 'url';
import path from 'path';

import { authMiddleware } from './middleware/auth.js';
import { errorHandler } from './middleware/errorHandler.js';

import authRouter from '../api/auth.js'
import accountRouter from '../api/account.js';
import goalsRouter from '../api/goals.js';
import mealsRouter from '../api/meals.js';
import workoutsRouter, { workoutsTemplateHandler } from '../api/workouts.js';
import healthRouter from '../api/health.js';
import progressRouter from '../api/progress.js';
import waterRouter from '../api/water.js';
import prisma from '../lib/prisma.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

app.use(cors({ origin: process.env.CORS_ORIGIN || 'http://localhost:5173' }));
app.use(express.json({ limit: '100kb' }));

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

if (process.env.NODE_ENV === 'production') {
  const distPath = path.join(__dirname, '..', 'src', 'dist');
  app.use(express.static(distPath));
  // Exclude /api/* from the SPA fallback so API typos return 404, not index.html
  app.get(/^(?!\/api\/).*/, (req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

app.use(errorHandler);

const PORT = process.env.PORT || 3001;
const server = app.listen(PORT, () => {
  console.log(`healthtrkr server running on port ${PORT}`);
});

// Graceful shutdown: finish in-flight requests, then disconnect Prisma
process.on('SIGTERM', () => {
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
});
