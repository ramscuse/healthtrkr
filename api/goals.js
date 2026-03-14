import { Router } from 'express';
import prisma from '../lib/prisma.js';

const router = Router();

router.get('/', async (req, res, next) => {
  try {
    const { userId } = req.user;

    let goals = await prisma.goals.findUnique({ where: { userId } });
    if (!goals) {
      goals = await prisma.goals.create({ data: { userId } });
    }

    res.json(goals);
  } catch (err) {
    next(err);
  }
});

router.put('/', async (req, res, next) => {
  try {
    const { userId } = req.user;
    const { calorieMin, calorieMax, proteinMin, proteinMax, carbsGoal, fatGoal, waterGoal, startWeight } = req.body;

    const numericFields = { calorieMin, calorieMax, proteinMin, proteinMax, carbsGoal, fatGoal, waterGoal, startWeight };
    for (const [key, val] of Object.entries(numericFields)) {
      if (val !== undefined && (typeof val !== 'number' || !isFinite(val) || val < 0)) {
        return res.status(400).json({ error: `${key} must be a non-negative finite number` });
      }
    }

    const goals = await prisma.goals.upsert({
      where: { userId },
      update: { calorieMin, calorieMax, proteinMin, proteinMax, carbsGoal, fatGoal, waterGoal, startWeight },
      create: { userId, calorieMin, calorieMax, proteinMin, proteinMax, carbsGoal, fatGoal, waterGoal, startWeight },
    });

    res.json(goals);
  } catch (err) {
    next(err);
  }
});

export default router;
