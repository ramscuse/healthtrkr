import { Router } from "express";
import prisma from "../../lib/prisma.js";

const router = Router();

// PUT /api/health/active-calories — manually set active calories for a date
router.put("/active-calories", async (req, res, next) => {
  try {
    const { userId } = req.user;
    const { date, calories } = req.body;

    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ error: "date (YYYY-MM-DD) is required" });
    }
    const parsed = new Date(date);
    if (
      isNaN(parsed.getTime()) ||
      parsed.getUTCFullYear() !== parseInt(date.slice(0, 4), 10) ||
      parsed.getUTCMonth() + 1 !== parseInt(date.slice(5, 7), 10) ||
      parsed.getUTCDate() !== parseInt(date.slice(8, 10), 10)
    ) {
      return res.status(400).json({ error: "date (YYYY-MM-DD) is required" });
    }
    if (typeof calories !== "number" || !isFinite(calories) || calories < 0) {
      return res.status(400).json({ error: "calories must be a non-negative number" });
    }

    const d = parsed;
    d.setUTCHours(0, 0, 0, 0);

    const record = await prisma.healthData.upsert({
      where: { userId_date: { userId, date: d } },
      update: { activeCalories: calories, source: "manual" },
      create: { userId, date: d, activeCalories: calories, source: "manual" },
    });

    res.json(record);
  } catch (err) {
    next(err);
  }
});

// GET /api/health/today — protected
router.get("/today", async (req, res, next) => {
  try {
    const { userId } = req.user;
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    const record = await prisma.healthData.findUnique({
      where: { userId_date: { userId, date: today } },
    });

    res.json(record ?? null);
  } catch (err) {
    next(err);
  }
});

// GET /api/health/week — protected
router.get("/week", async (req, res, next) => {
  try {
    const { userId } = req.user;
    const end = new Date();
    end.setUTCHours(23, 59, 59, 999);
    const start = new Date();
    start.setUTCDate(start.getUTCDate() - 6);
    start.setUTCHours(0, 0, 0, 0);

    const records = await prisma.healthData.findMany({
      where: { userId, date: { gte: start, lte: end } },
      orderBy: { date: "asc" },
    });

    res.json(records);
  } catch (err) {
    next(err);
  }
});

export default router;
