import { Router } from "express";
import prisma from "../../lib/prisma.js";
import { parseDate, dayRange } from "../lib/dates.js";

const router = Router();

const VALID_CATEGORIES = ["Upper Body Push", "Upper Body Pull", "Lower Body", "Core", "Cardio"];

const MAX_EXERCISES = 50;
const MAX_EXERCISE_NAME_LEN = 200;
const MAX_SETS_PER_EXERCISE = 30;
const MAX_NOTES_LEN = 2000;

// Shape sanity + size caps for one exercises[] entry (frontend sends
// { id, name, category, muscles, sets? }). Returns an error string or null.
function validateExercise(ex, idx) {
  if (!ex || typeof ex !== "object" || Array.isArray(ex)) {
    return `exercises[${idx}] must be an object`;
  }
  if (typeof ex.name !== "string" || !ex.name.trim()) {
    return `exercises[${idx}].name must be a non-empty string`;
  }
  if (ex.name.length > MAX_EXERCISE_NAME_LEN) {
    return `exercises[${idx}].name must be ${MAX_EXERCISE_NAME_LEN} chars or less`;
  }
  if (ex.muscles !== undefined && !Array.isArray(ex.muscles)) {
    return `exercises[${idx}].muscles must be an array if provided`;
  }
  // Cap nested sets[] too, or one exercise could carry thousands of sets
  // under the 100KB body limit. `sets: null` is rejected: absent or array only.
  if (ex.sets !== undefined) {
    if (!Array.isArray(ex.sets)) {
      return `exercises[${idx}].sets must be an array if provided`;
    }
    if (ex.sets.length > MAX_SETS_PER_EXERCISE) {
      return `exercises[${idx}].sets must have ${MAX_SETS_PER_EXERCISE} or fewer entries`;
    }
  }
  return null;
}

// Optional fields shared by POST and PUT. Returns an error string or null.
function validateWorkoutPayload({ splitDay, exercises, durationMin, notes }) {
  if (splitDay !== undefined && !isValidSplitDay(splitDay)) {
    return `splitDay must be "custom" or "+"-joined values from: ${[...SPLIT_PARTS].join(", ")}`;
  }
  if (durationMin !== undefined && (!Number.isInteger(durationMin) || durationMin < 0)) {
    return "durationMin must be a non-negative integer";
  }
  if (exercises !== undefined) {
    if (!Array.isArray(exercises)) return "exercises must be an array";
    if (exercises.length > MAX_EXERCISES) {
      return `exercises must have ${MAX_EXERCISES} or fewer entries`;
    }
    for (let i = 0; i < exercises.length; i++) {
      const err = validateExercise(exercises[i], i);
      if (err) return err;
    }
  }
  if (notes !== undefined && notes !== null) {
    if (typeof notes !== "string") return "notes must be a string";
    if (notes.length > MAX_NOTES_LEN) {
      return `notes must be ${MAX_NOTES_LEN} chars or less`;
    }
  }
  return null;
}

function validatePreset({ name, exercises }) {
  if (typeof name !== "string" || !name.trim()) return "name is required";
  if (!Array.isArray(exercises)) return "exercises must be an array";
  return null;
}

const TEMPLATE = {
  split: [
    {
      key: "upper_push",
      label: "Upper Push",
      suggestedDay: "Monday",
      exercises: [
        { name: "Barbell Bench Press", defaultSets: 4, defaultReps: 8 },
        { name: "Overhead Press", defaultSets: 3, defaultReps: 10 },
        { name: "Incline Dumbbell Press", defaultSets: 3, defaultReps: 10 },
        { name: "Tricep Pushdowns", defaultSets: 3, defaultReps: 12 },
        { name: "Lateral Raises", defaultSets: 3, defaultReps: 15 },
      ],
    },
    {
      key: "lower_core",
      label: "Lower + Core",
      suggestedDay: "Tuesday",
      exercises: [
        { name: "Barbell Squat", defaultSets: 4, defaultReps: 6 },
        { name: "Romanian Deadlift", defaultSets: 3, defaultReps: 10 },
        { name: "Leg Press", defaultSets: 3, defaultReps: 12 },
        { name: "Leg Curl", defaultSets: 3, defaultReps: 12 },
        { name: "Plank", defaultSets: 3, defaultReps: 60 },
        { name: "Cable Crunch", defaultSets: 3, defaultReps: 15 },
      ],
    },
    {
      key: "upper_pull",
      label: "Upper Pull",
      suggestedDay: "Thursday",
      exercises: [
        { name: "Barbell Row", defaultSets: 4, defaultReps: 8 },
        { name: "Lat Pulldown", defaultSets: 3, defaultReps: 10 },
        { name: "Seated Cable Row", defaultSets: 3, defaultReps: 12 },
        { name: "Face Pulls", defaultSets: 3, defaultReps: 15 },
        { name: "Barbell Curl", defaultSets: 3, defaultReps: 10 },
        { name: "Hammer Curls", defaultSets: 3, defaultReps: 12 },
      ],
    },
    {
      key: "lower",
      label: "Lower",
      suggestedDay: "Friday",
      exercises: [
        { name: "Conventional Deadlift", defaultSets: 4, defaultReps: 5 },
        { name: "Bulgarian Split Squat", defaultSets: 3, defaultReps: 10 },
        { name: "Leg Extension", defaultSets: 3, defaultReps: 12 },
        { name: "Standing Calf Raise", defaultSets: 4, defaultReps: 15 },
      ],
    },
    {
      key: "cardio",
      label: "Cardio",
      suggestedDay: "Saturday",
      exercises: [
        { name: "Steady-State Cardio", defaultSets: 1, defaultReps: 40 },
        { name: "HIIT Intervals", defaultSets: 8, defaultReps: 30 },
      ],
    },
  ],
};

// Legacy template keys + the category slugs the client sends: one slug, "custom"
// (multi-category plan), or "+"-joined slugs (quick log).
const SPLIT_PARTS = new Set([
  ...TEMPLATE.split.map((s) => s.key),
  ...VALID_CATEGORIES.map((c) => c.toLowerCase().replace(/ /g, "_")),
]);
const isValidSplitDay = (s) =>
  typeof s === "string" &&
  s.length <= 200 &&
  (s === "custom" || s.split("+").every((part) => SPLIT_PARTS.has(part)));

// Mounted publicly in app.js, ahead of the authed workouts router.
export function workoutsTemplateHandler(req, res) {
  res.json(TEMPLATE);
}

router.get("/custom-exercises", async (req, res, next) => {
  try {
    const { userId } = req.user;
    const exercises = await prisma.customExercise.findMany({
      where: { userId },
      orderBy: { createdAt: "asc" },
    });
    res.json(exercises);
  } catch (err) {
    next(err);
  }
});

router.post("/custom-exercises", async (req, res, next) => {
  try {
    const { userId } = req.user;
    const { name, category, muscles } = req.body;
    if (typeof name !== "string" || !name.trim())
      return res.status(400).json({ error: "name is required" });
    if (!VALID_CATEGORIES.includes(category))
      return res.status(400).json({ error: "invalid category" });
    if (!Array.isArray(muscles)) return res.status(400).json({ error: "muscles must be an array" });
    const ex = await prisma.customExercise.create({
      data: { userId, name: name.trim(), category, muscles },
    });
    res.status(201).json(ex);
  } catch (err) {
    if (err.code === "P2002")
      return res.status(409).json({ error: "An exercise with this name already exists" });
    next(err);
  }
});

router.delete("/custom-exercises/:id", async (req, res, next) => {
  try {
    const { userId } = req.user;
    const ex = await prisma.customExercise.findUnique({ where: { id: req.params.id } });
    if (!ex) return res.status(404).json({ error: "Not found" });
    if (ex.userId !== userId) return res.status(403).json({ error: "Not authorized" });
    await prisma.customExercise.delete({ where: { id: req.params.id } });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

router.get("/presets", async (req, res, next) => {
  try {
    const { userId } = req.user;
    const presets = await prisma.workoutPreset.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
    });
    res.json(presets);
  } catch (err) {
    next(err);
  }
});

router.post("/presets", async (req, res, next) => {
  try {
    const { userId } = req.user;
    const { name, exercises } = req.body;
    const presetError = validatePreset(req.body);
    if (presetError) return res.status(400).json({ error: presetError });
    const preset = await prisma.workoutPreset.create({
      data: { userId, name: name.trim(), exercises },
    });
    res.status(201).json(preset);
  } catch (err) {
    if (err.code === "P2002")
      return res.status(409).json({ error: "A preset with this name already exists" });
    next(err);
  }
});

router.put("/presets/:id", async (req, res, next) => {
  try {
    const { userId } = req.user;
    const { name, exercises } = req.body;
    const existing = await prisma.workoutPreset.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: "Not found" });
    if (existing.userId !== userId) return res.status(403).json({ error: "Not authorized" });
    const presetError = validatePreset(req.body);
    if (presetError) return res.status(400).json({ error: presetError });
    const preset = await prisma.workoutPreset.update({
      where: { id: req.params.id },
      data: { name: name.trim(), exercises },
    });
    res.json(preset);
  } catch (err) {
    if (err.code === "P2002")
      return res.status(409).json({ error: "A preset with this name already exists" });
    next(err);
  }
});

router.delete("/presets/:id", async (req, res, next) => {
  try {
    const { userId } = req.user;
    const existing = await prisma.workoutPreset.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: "Not found" });
    if (existing.userId !== userId) return res.status(403).json({ error: "Not authorized" });
    await prisma.workoutPreset.delete({ where: { id: req.params.id } });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

router.get("/history", async (req, res, next) => {
  try {
    const { userId } = req.user;
    const limit = Math.min(parseInt(req.query.limit) || 30, 100);

    const sessions = await prisma.workoutSession.findMany({
      where: { userId },
      orderBy: { date: "desc" },
      take: limit,
    });

    res.json(sessions);
  } catch (err) {
    next(err);
  }
});

router.get("/", async (req, res, next) => {
  try {
    const { userId } = req.user;
    const { date } = req.query;

    if (!date) return res.status(400).json({ error: "date query parameter is required" });
    const parsedDate = parseDate(date);
    if (!parsedDate) return res.status(400).json({ error: "date must be in YYYY-MM-DD format" });

    const sessions = await prisma.workoutSession.findMany({
      where: { userId, date: dayRange(parsedDate) },
    });

    res.json(sessions);
  } catch (err) {
    next(err);
  }
});

router.post("/", async (req, res, next) => {
  try {
    const { userId } = req.user;
    const { date, splitDay, exercises, durationMin, notes } = req.body;

    if (!date || !splitDay || !exercises) {
      return res.status(400).json({ error: "date, splitDay, and exercises are required" });
    }
    const parsedDate = parseDate(date);
    if (!parsedDate) return res.status(400).json({ error: "date must be in YYYY-MM-DD format" });
    const payloadError = validateWorkoutPayload({ splitDay, exercises, durationMin, notes });
    if (payloadError) return res.status(400).json({ error: payloadError });

    const session = await prisma.workoutSession.create({
      data: { userId, date: parsedDate, splitDay, exercises, durationMin, notes },
    });

    res.status(201).json(session);
  } catch (err) {
    next(err);
  }
});

router.put("/:id", async (req, res, next) => {
  try {
    const { userId } = req.user;
    const { id } = req.params;

    const existing = await prisma.workoutSession.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ error: "Workout session not found" });
    if (existing.userId !== userId) return res.status(403).json({ error: "Not authorized" });

    const { splitDay, exercises, durationMin, notes } = req.body;
    const payloadError = validateWorkoutPayload({ splitDay, exercises, durationMin, notes });
    if (payloadError) return res.status(400).json({ error: payloadError });

    const session = await prisma.workoutSession.update({
      where: { id },
      data: { splitDay, exercises, durationMin, notes },
    });

    res.json(session);
  } catch (err) {
    next(err);
  }
});

router.delete("/:id", async (req, res, next) => {
  try {
    const { userId } = req.user;
    const { id } = req.params;
    const existing = await prisma.workoutSession.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ error: "Workout session not found" });
    if (existing.userId !== userId) return res.status(403).json({ error: "Not authorized" });
    await prisma.workoutSession.delete({ where: { id } });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

export default router;
