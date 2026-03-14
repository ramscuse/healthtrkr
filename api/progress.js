import { Router } from 'express';
import prisma from '../lib/prisma.js';

const router = Router();

async function buildDaySummary(userId, dateStr) {
  const start = new Date(dateStr);
  start.setUTCHours(0, 0, 0, 0);
  const end = new Date(dateStr);
  end.setUTCHours(23, 59, 59, 999);

  const [goals, meals, health, workout, waterEntries] = await Promise.all([
    prisma.goals.findUnique({ where: { userId } }),
    prisma.mealEntry.findMany({ where: { userId, date: { gte: start, lte: end } } }),
    prisma.healthData.findUnique({ where: { userId_date: { userId, date: start } } }),
    prisma.workoutSession.findFirst({ where: { userId, date: { gte: start, lte: end } } }),
    prisma.waterEntry.findMany({ where: { userId, date: { gte: start, lte: end } } }),
  ]);

  const consumed = meals.reduce(
    (acc, m) => ({
      calories: acc.calories + m.calories,
      protein: acc.protein + m.protein,
      carbs: acc.carbs + m.carbs,
      fat: acc.fat + m.fat,
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 }
  );

  const burned = {
    active: health?.activeCalories ?? 0,
    resting: health?.restingCalories ?? 0,
    total: (health?.activeCalories ?? 0) + (health?.restingCalories ?? 0),
  };

  const water = waterEntries.reduce((sum, e) => sum + e.amount, 0);
  const net = consumed.calories - burned.active;
  const deficit = (goals?.calorieMax ?? 0) - net;

  return {
    date: dateStr,
    goals: goals ? {
      calorieMin: goals.calorieMin,
      calorieMax: goals.calorieMax,
      proteinMin: goals.proteinMin,
      proteinMax: goals.proteinMax,
      carbsGoal: goals.carbsGoal,
      fatGoal: goals.fatGoal,
      waterGoal: goals.waterGoal,
    } : null,
    consumed,
    burned,
    water,
    net,
    deficit,
    workoutLogged: !!workout,
  };
}

// GET /api/progress/summary?date=YYYY-MM-DD
router.get('/summary', async (req, res, next) => {
  try {
    const { userId } = req.user;
    const date = req.query.date || new Date().toISOString().slice(0, 10);
    const summary = await buildDaySummary(userId, date);
    res.json(summary);
  } catch (err) {
    next(err);
  }
});

// GET /api/progress/weekly?startDate=YYYY-MM-DD
router.get('/weekly', async (req, res, next) => {
  try {
    const { userId } = req.user;
    const startDate = req.query.startDate || new Date().toISOString().slice(0, 10);
    const start = new Date(startDate);

    const days = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(start);
      d.setUTCDate(d.getUTCDate() + i);
      days.push(d.toISOString().slice(0, 10));
    }

    const summaries = await Promise.all(days.map((d) => buildDaySummary(userId, d)));
    res.json(summaries);
  } catch (err) {
    next(err);
  }
});

// GET /api/progress/range?startDate=YYYY-MM-DD&numDays=N
router.get('/range', async (req, res, next) => {
  try {
    const { userId } = req.user;
    const startDate = req.query.startDate || new Date().toISOString().slice(0, 10);
    const numDays = Math.min(parseInt(req.query.numDays) || 7, 31);
    const start = new Date(startDate);

    const days = [];
    for (let i = 0; i < numDays; i++) {
      const d = new Date(start);
      d.setUTCDate(d.getUTCDate() + i);
      days.push(d.toISOString().slice(0, 10));
    }

    const summaries = await Promise.all(days.map(d => buildDaySummary(userId, d)));
    res.json(summaries);
  } catch (err) {
    next(err);
  }
});

export default router;
