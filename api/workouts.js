import { Router } from 'express';
import prisma from '../lib/prisma.js';

const router = Router();

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const VALID_CATEGORIES = ['Upper Body Push', 'Upper Body Pull', 'Lower Body', 'Core', 'Cardio'];

function parseDate(dateStr) {
  if (!DATE_RE.test(dateStr)) return null;
  const d = new Date(dateStr);
  return isNaN(d.getTime()) ? null : d;
}

const VALID_SPLIT_DAYS = ['upper_push', 'lower_core', 'upper_pull', 'lower', 'cardio'];

const TEMPLATE = {
  split: [
    {
      key: 'upper_push',
      label: 'Upper Push',
      suggestedDay: 'Monday',
      exercises: [
        { name: 'Barbell Bench Press', defaultSets: 4, defaultReps: 8 },
        { name: 'Overhead Press', defaultSets: 3, defaultReps: 10 },
        { name: 'Incline Dumbbell Press', defaultSets: 3, defaultReps: 10 },
        { name: 'Tricep Pushdowns', defaultSets: 3, defaultReps: 12 },
        { name: 'Lateral Raises', defaultSets: 3, defaultReps: 15 },
      ],
    },
    {
      key: 'lower_core',
      label: 'Lower + Core',
      suggestedDay: 'Tuesday',
      exercises: [
        { name: 'Barbell Squat', defaultSets: 4, defaultReps: 6 },
        { name: 'Romanian Deadlift', defaultSets: 3, defaultReps: 10 },
        { name: 'Leg Press', defaultSets: 3, defaultReps: 12 },
        { name: 'Leg Curl', defaultSets: 3, defaultReps: 12 },
        { name: 'Plank', defaultSets: 3, defaultReps: 60 },
        { name: 'Cable Crunch', defaultSets: 3, defaultReps: 15 },
      ],
    },
    {
      key: 'upper_pull',
      label: 'Upper Pull',
      suggestedDay: 'Thursday',
      exercises: [
        { name: 'Barbell Row', defaultSets: 4, defaultReps: 8 },
        { name: 'Lat Pulldown', defaultSets: 3, defaultReps: 10 },
        { name: 'Seated Cable Row', defaultSets: 3, defaultReps: 12 },
        { name: 'Face Pulls', defaultSets: 3, defaultReps: 15 },
        { name: 'Barbell Curl', defaultSets: 3, defaultReps: 10 },
        { name: 'Hammer Curls', defaultSets: 3, defaultReps: 12 },
      ],
    },
    {
      key: 'lower',
      label: 'Lower',
      suggestedDay: 'Friday',
      exercises: [
        { name: 'Conventional Deadlift', defaultSets: 4, defaultReps: 5 },
        { name: 'Bulgarian Split Squat', defaultSets: 3, defaultReps: 10 },
        { name: 'Leg Extension', defaultSets: 3, defaultReps: 12 },
        { name: 'Standing Calf Raise', defaultSets: 4, defaultReps: 15 },
      ],
    },
    {
      key: 'cardio',
      label: 'Cardio',
      suggestedDay: 'Saturday',
      exercises: [
        { name: 'Steady-State Cardio', defaultSets: 1, defaultReps: 40 },
        { name: 'HIIT Intervals', defaultSets: 8, defaultReps: 30 },
      ],
    },
  ],
};

export function workoutsTemplateHandler(req, res) {
  res.json(TEMPLATE);
}

router.get('/template', workoutsTemplateHandler);

router.get('/custom-exercises', async (req, res, next) => {
  try {
    const { userId } = req.user;
    const exercises = await prisma.customExercise.findMany({ where: { userId }, orderBy: { createdAt: 'asc' } });
    res.json(exercises);
  } catch (err) { next(err); }
});

router.post('/custom-exercises', async (req, res, next) => {
  try {
    const { userId } = req.user;
    const { name, category, muscles } = req.body;
    if (!name || typeof name !== 'string' || !name.trim()) return res.status(400).json({ error: 'name is required' });
    if (!VALID_CATEGORIES.includes(category)) return res.status(400).json({ error: 'invalid category' });
    if (!Array.isArray(muscles)) return res.status(400).json({ error: 'muscles must be an array' });
    const ex = await prisma.customExercise.create({ data: { userId, name: name.trim(), category, muscles } });
    res.status(201).json(ex);
  } catch (err) {
    if (err.code === 'P2002') return res.status(409).json({ error: 'An exercise with this name already exists' });
    next(err);
  }
});

router.delete('/custom-exercises/:id', async (req, res, next) => {
  try {
    const { userId } = req.user;
    const ex = await prisma.customExercise.findUnique({ where: { id: req.params.id } });
    if (!ex) return res.status(404).json({ error: 'Not found' });
    if (ex.userId !== userId) return res.status(403).json({ error: 'Not authorized' });
    await prisma.customExercise.delete({ where: { id: req.params.id } });
    res.status(204).end();
  } catch (err) { next(err); }
});

router.get('/presets', async (req, res, next) => {
  try {
    const { userId } = req.user;
    const presets = await prisma.workoutPreset.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } });
    res.json(presets);
  } catch (err) { next(err); }
});

router.post('/presets', async (req, res, next) => {
  try {
    const { userId } = req.user;
    const { name, exercises } = req.body;
    if (!name || typeof name !== 'string' || !name.trim()) return res.status(400).json({ error: 'name is required' });
    if (!Array.isArray(exercises)) return res.status(400).json({ error: 'exercises must be an array' });
    const preset = await prisma.workoutPreset.create({ data: { userId, name: name.trim(), exercises } });
    res.status(201).json(preset);
  } catch (err) {
    if (err.code === 'P2002') return res.status(409).json({ error: 'A preset with this name already exists' });
    next(err);
  }
});

router.put('/presets/:id', async (req, res, next) => {
  try {
    const { userId } = req.user;
    const { name, exercises } = req.body;
    const existing = await prisma.workoutPreset.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: 'Not found' });
    if (existing.userId !== userId) return res.status(403).json({ error: 'Not authorized' });
    if (!name || typeof name !== 'string' || !name.trim()) return res.status(400).json({ error: 'name is required' });
    if (!Array.isArray(exercises)) return res.status(400).json({ error: 'exercises must be an array' });
    const preset = await prisma.workoutPreset.update({ where: { id: req.params.id }, data: { name: name.trim(), exercises } });
    res.json(preset);
  } catch (err) {
    if (err.code === 'P2002') return res.status(409).json({ error: 'A preset with this name already exists' });
    next(err);
  }
});

router.delete('/presets/:id', async (req, res, next) => {
  try {
    const { userId } = req.user;
    const existing = await prisma.workoutPreset.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: 'Not found' });
    if (existing.userId !== userId) return res.status(403).json({ error: 'Not authorized' });
    await prisma.workoutPreset.delete({ where: { id: req.params.id } });
    res.status(204).end();
  } catch (err) { next(err); }
});

router.get('/history', async (req, res, next) => {
  try {
    const { userId } = req.user;
    const limit = Math.min(parseInt(req.query.limit) || 30, 100);

    const sessions = await prisma.workoutSession.findMany({
      where: { userId },
      orderBy: { date: 'desc' },
      take: limit,
    });

    res.json(sessions);
  } catch (err) {
    next(err);
  }
});

router.get('/', async (req, res, next) => {
  try {
    const { userId } = req.user;
    const { date } = req.query;

    if (!date) return res.status(400).json({ error: 'date query parameter is required' });
    const parsedDate = parseDate(date);
    if (!parsedDate) return res.status(400).json({ error: 'date must be in YYYY-MM-DD format' });

    const start = new Date(parsedDate);
    start.setUTCHours(0, 0, 0, 0);
    const end = new Date(parsedDate);
    end.setUTCHours(23, 59, 59, 999);

    const sessions = await prisma.workoutSession.findMany({
      where: { userId, date: { gte: start, lte: end } },
    });

    res.json(sessions);
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const { userId } = req.user;
    const { date, splitDay, exercises, durationMin, notes } = req.body;

    if (!date || !splitDay || !exercises) {
      return res.status(400).json({ error: 'date, splitDay, and exercises are required' });
    }
    if (!VALID_SPLIT_DAYS.includes(splitDay)) {
      return res.status(400).json({ error: `splitDay must be one of: ${VALID_SPLIT_DAYS.join(', ')}` });
    }
    if (!Array.isArray(exercises)) {
      return res.status(400).json({ error: 'exercises must be an array' });
    }
    const parsedDate = parseDate(date);
    if (!parsedDate) return res.status(400).json({ error: 'date must be in YYYY-MM-DD format' });
    if (durationMin !== undefined && (!Number.isInteger(durationMin) || durationMin < 0)) {
      return res.status(400).json({ error: 'durationMin must be a non-negative integer' });
    }

    const session = await prisma.workoutSession.create({
      data: { userId, date: parsedDate, splitDay, exercises, durationMin, notes },
    });

    res.status(201).json(session);
  } catch (err) {
    next(err);
  }
});

router.put('/:id', async (req, res, next) => {
  try {
    const { userId } = req.user;
    const { id } = req.params;

    const existing = await prisma.workoutSession.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ error: 'Workout session not found' });
    if (existing.userId !== userId) return res.status(403).json({ error: 'Not authorized' });

    const { splitDay, exercises, durationMin, notes } = req.body;

    if (splitDay !== undefined && !VALID_SPLIT_DAYS.includes(splitDay)) {
      return res.status(400).json({ error: `splitDay must be one of: ${VALID_SPLIT_DAYS.join(', ')}` });
    }
    if (exercises !== undefined && !Array.isArray(exercises)) {
      return res.status(400).json({ error: 'exercises must be an array' });
    }
    if (durationMin !== undefined && (!Number.isInteger(durationMin) || durationMin < 0)) {
      return res.status(400).json({ error: 'durationMin must be a non-negative integer' });
    }

    const session = await prisma.workoutSession.update({
      where: { id },
      data: { splitDay, exercises, durationMin, notes },
    });

    res.json(session);
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const { userId } = req.user;
    const { id } = req.params;
    const existing = await prisma.workoutSession.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ error: 'Workout session not found' });
    if (existing.userId !== userId) return res.status(403).json({ error: 'Not authorized' });
    await prisma.workoutSession.delete({ where: { id } });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

export default router;
