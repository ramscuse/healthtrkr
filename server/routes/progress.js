import { Router } from "express";
import prisma from "../../lib/prisma.js";
import { parseDate, dayRange } from "../lib/dates.js";

const router = Router();

const isoDay = (d) => d.toISOString().slice(0, 10);

// `numDays` consecutive YYYY-MM-DD strings starting at `start` (a UTC-midnight Date).
function daysFrom(start, numDays) {
  const days = [];
  for (let i = 0; i < numDays; i++) {
    const d = new Date(start);
    d.setUTCDate(d.getUTCDate() + i);
    days.push(isoDay(d));
  }
  return days;
}

// One query per table over the whole span, bucketed by UTC day in memory.
async function buildSummaries(userId, days) {
  if (days.length === 0) return [];
  const date = { gte: dayRange(days[0]).gte, lte: dayRange(days.at(-1)).lte };

  const [goals, meals, health, workouts, waterEntries] = await Promise.all([
    prisma.goals.findUnique({ where: { userId } }),
    prisma.mealEntry.findMany({ where: { userId, date } }),
    prisma.healthData.findMany({ where: { userId, date: { in: days.map((d) => new Date(d)) } } }),
    prisma.workoutSession.findMany({ where: { userId, date }, select: { date: true } }),
    prisma.waterEntry.findMany({ where: { userId, date } }),
  ]);

  const workoutDays = new Set(workouts.map((w) => isoDay(w.date)));

  return days.map((day) => {
    const consumed = { calories: 0, protein: 0, carbs: 0, fat: 0 };
    for (const m of meals) {
      if (isoDay(m.date) !== day) continue;
      consumed.calories += m.caloriesSnapshot ?? 0;
      consumed.protein += m.proteinSnapshot ?? 0;
      consumed.carbs += m.carbsSnapshot ?? 0;
      consumed.fat += m.fatSnapshot ?? 0;
    }

    const h = health.find((r) => isoDay(r.date) === day);
    const burned = {
      active: h?.activeCalories ?? 0,
      resting: h?.restingCalories ?? 0,
      total: (h?.activeCalories ?? 0) + (h?.restingCalories ?? 0),
    };

    const water = waterEntries
      .filter((e) => isoDay(e.date) === day)
      .reduce((sum, e) => sum + e.amount, 0);
    const net = consumed.calories - burned.active;
    const deficit = (goals?.calorieMax ?? 0) - net;

    return {
      date: day,
      goals: goals
        ? {
            calorieMin: goals.calorieMin,
            calorieMax: goals.calorieMax,
            proteinMin: goals.proteinMin,
            proteinMax: goals.proteinMax,
            carbsGoal: goals.carbsGoal,
            fatGoal: goals.fatGoal,
            waterGoal: goals.waterGoal,
          }
        : null,
      consumed,
      burned,
      water,
      net,
      deficit,
      workoutLogged: workoutDays.has(day),
    };
  });
}

function startDateOrToday(raw) {
  return parseDate(raw || isoDay(new Date()));
}

// GET /api/progress/summary?date=YYYY-MM-DD
router.get("/summary", async (req, res, next) => {
  try {
    const date = startDateOrToday(req.query.date);
    if (!date) return res.status(400).json({ error: "date must be in YYYY-MM-DD format" });
    const [summary] = await buildSummaries(req.user.userId, [isoDay(date)]);
    res.json(summary);
  } catch (err) {
    next(err);
  }
});

async function sendSpan(req, res, next, numDays) {
  try {
    const start = startDateOrToday(req.query.startDate);
    if (!start) return res.status(400).json({ error: "startDate must be in YYYY-MM-DD format" });
    res.json(await buildSummaries(req.user.userId, daysFrom(start, numDays)));
  } catch (err) {
    next(err);
  }
}

// GET /api/progress/weekly?startDate=YYYY-MM-DD
router.get("/weekly", (req, res, next) => sendSpan(req, res, next, 7));

// GET /api/progress/range?startDate=YYYY-MM-DD&numDays=N
router.get("/range", (req, res, next) =>
  sendSpan(req, res, next, Math.min(parseInt(req.query.numDays) || 7, 31))
);

export default router;
