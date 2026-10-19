import { Router } from "express";
import prisma from "../../lib/prisma.js";

const router = Router();

const GOAL_FIELDS = [
  "calorieMin",
  "calorieMax",
  "proteinMin",
  "proteinMax",
  "carbsGoal",
  "fatGoal",
  "waterGoal",
  "startWeight",
];

// Lazily creates the row (schema defaults) on first read.
router.get("/", async (req, res, next) => {
  try {
    const { userId } = req.user;
    const goals = await prisma.goals.upsert({
      where: { userId },
      update: {},
      create: { userId },
    });
    res.json(goals);
  } catch (err) {
    next(err);
  }
});

router.put("/", async (req, res, next) => {
  try {
    const { userId } = req.user;
    const data = {};
    for (const key of GOAL_FIELDS) {
      const val = req.body[key];
      if (val === undefined) continue;
      if (typeof val !== "number" || !isFinite(val) || val < 0) {
        return res.status(400).json({ error: `${key} must be a non-negative finite number` });
      }
      data[key] = val;
    }

    const { calorieMin, calorieMax, proteinMin, proteinMax } = data;
    if (calorieMin !== undefined && calorieMax !== undefined && calorieMin > calorieMax) {
      return res.status(400).json({ error: "calorieMin must not exceed calorieMax" });
    }
    if (proteinMin !== undefined && proteinMax !== undefined && proteinMin > proteinMax) {
      return res.status(400).json({ error: "proteinMin must not exceed proteinMax" });
    }

    const goals = await prisma.goals.upsert({
      where: { userId },
      update: data,
      create: { userId, ...data },
    });
    res.json(goals);
  } catch (err) {
    next(err);
  }
});

export default router;
