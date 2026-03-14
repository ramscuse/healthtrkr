import 'dotenv/config';
import express from 'express';
import cors from 'cors';
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

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

app.use(cors({ origin: process.env.CORS_ORIGIN || 'http://localhost:5173' }));
app.use(express.json());

app.use('/api/auth', authRouter);
app.use('/api/account', authMiddleware, accountRouter);
app.use('/api/goals', authMiddleware, goalsRouter);
app.use('/api/meals', authMiddleware, mealsRouter);
app.get('/api/workouts/template', workoutsTemplateHandler);
app.use('/api/workouts', authMiddleware, workoutsRouter);
app.use('/api/health', healthRouter);
app.use('/api/progress', authMiddleware, progressRouter);
app.use('/api/water', authMiddleware, waterRouter);

if (process.env.NODE_ENV === 'production') {
  const distPath = path.join(__dirname, '..', 'src', 'dist');
  app.use(express.static(distPath));
  app.get('*', (req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

app.use(errorHandler);

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`healthtrkr server running on port ${PORT}`);
});
