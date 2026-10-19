import { Router } from "express";
import prisma from "../../lib/prisma.js";
import { searchFoods, fetchFoodById, materializeFood } from "../fatSecret.js";
import { parseDate, dayRange } from "../lib/dates.js";

const router = Router();

const VALID_MEAL_TYPES = ["breakfast", "lunch", "dinner", "snack"];
const BARCODE_RE = /^\d{8,14}$/;
const BARCODE_SERVING = {
  description: "100 g",
  metricAmount: 100,
  metricUnit: "g",
  isDefault: true,
};
const SERVINGS_ASC = { servings: { orderBy: { createdAt: "asc" } } };
const PRESET_INCLUDE = { items: { include: { serving: { include: { food: true } } } } };

function isFiniteNumber(v) {
  return typeof v === "number" && Number.isFinite(v);
}

function isNonNegFinite(v) {
  return isFiniteNumber(v) && v >= 0;
}

function isPositiveInt(v) {
  return Number.isInteger(v) && v > 0;
}

function isNullableString(v) {
  return v == null || typeof v === "string";
}

function trimOrNull(v) {
  return typeof v === "string" ? v.trim() || null : null;
}

// MealEntry data for `quantity` × `serving` of `food`. Macros are copied so the
// entry survives later edits/deletion of the food.
function entrySnapshot(serving, food, quantity) {
  const opt = (n) => (n == null ? null : n * quantity);
  return {
    servingId: serving.id,
    quantity,
    foodNameSnapshot: food.name,
    brandNameSnapshot: food.brandName,
    servingDescSnapshot: serving.description,
    caloriesSnapshot: serving.calories * quantity,
    proteinSnapshot: serving.protein * quantity,
    carbsSnapshot: serving.carbs * quantity,
    fatSnapshot: serving.fat * quantity,
    fiberSnapshot: opt(serving.fiber),
    sugarSnapshot: opt(serving.sugar),
    sodiumSnapshot: opt(serving.sodium),
    saturatedFatSnapshot: opt(serving.saturatedFat),
    addedSugarsSnapshot: opt(serving.addedSugars),
  };
}

function serializeServing(s) {
  return {
    id: s.id,
    fatSecretServingId: s.fatSecretServingId,
    description: s.description,
    metricAmount: s.metricAmount,
    metricUnit: s.metricUnit,
    measurementDescription: s.measurementDescription,
    numberOfUnits: s.numberOfUnits,
    isDefault: s.isDefault,
    calories: s.calories,
    protein: s.protein,
    carbs: s.carbs,
    fat: s.fat,
    saturatedFat: s.saturatedFat,
    sugar: s.sugar,
    addedSugars: s.addedSugars,
    fiber: s.fiber,
    sodium: s.sodium,
  };
}

function serializeFood(f) {
  return {
    id: f.id,
    source: f.source,
    fatSecretFoodId: f.fatSecretFoodId,
    name: f.name,
    brandName: f.brandName,
    foodType: f.foodType,
    foodUrl: f.foodUrl,
    servings: f.servings.map(serializeServing),
  };
}

function serializeEntry(e) {
  return {
    id: e.id,
    mealType: e.mealType,
    quantity: e.quantity,
    foodName: e.foodNameSnapshot,
    brandName: e.brandNameSnapshot,
    servingDesc: e.servingDescSnapshot,
    calories: e.caloriesSnapshot,
    protein: e.proteinSnapshot,
    carbs: e.carbsSnapshot,
    fat: e.fatSnapshot,
    fiber: e.fiberSnapshot,
    sugar: e.sugarSnapshot,
    sodium: e.sodiumSnapshot,
    saturatedFat: e.saturatedFatSnapshot,
    addedSugars: e.addedSugarsSnapshot,
    servingId: e.servingId,
  };
}

// GET /api/meals/search?q=...
// Returns lightweight food hits. Each hit has a default-serving preview parsed
// from the food_description string. Full servings are fetched lazily via
// GET /foods/:foodId when the user picks a result.
router.get("/search", async (req, res, next) => {
  try {
    // Express parses repeated `?q=` params as arrays, so guard before .trim().
    if (req.query.q != null && typeof req.query.q !== "string") {
      return res.status(400).json({ error: "q must be a string" });
    }
    const q = (req.query.q || "").trim();
    if (q.length < 2) return res.json({ foods: [] });

    res.json({ foods: await searchFoods(q) });
  } catch (err) {
    next(err);
  }
});

// GET /api/meals/foods/:foodId — fetch full FatSecret food + servings.
router.get("/foods/:foodId", async (req, res, next) => {
  try {
    const id = Number(req.params.foodId);
    if (!isPositiveInt(id)) {
      return res.status(400).json({ error: "foodId must be a positive integer" });
    }
    const food = await fetchFoodById(id);
    if (!food) return res.status(404).json({ error: "Food not found" });
    res.json(food);
  } catch (err) {
    next(err);
  }
});

// Fetch + validate a barcode from OpenFoodFacts (per-100 g nutrition).
// Returns { food: { name, brandName, calories, protein, carbs, fat } } on success,
// or { error, statusCode } on failure.
async function fetchBarcodeFood(barcode) {
  let response;
  try {
    response = await fetch(
      `https://world.openfoodfacts.org/api/v0/product/${encodeURIComponent(barcode)}.json`,
      { signal: AbortSignal.timeout(5000) }
    );
  } catch (err) {
    const timedOut = err.name === "TimeoutError";
    return {
      error: timedOut ? "Barcode lookup timed out" : "Barcode lookup unavailable",
      statusCode: timedOut ? 504 : 502,
    };
  }
  const data = await response.json().catch(() => undefined);
  if (data === undefined) return { error: "Barcode lookup returned invalid data", statusCode: 502 };
  if (data.status !== 1) return { error: "Product not found", statusCode: 404 };

  const p = data.product;
  const n = p.nutriments ?? {};
  const [calories, protein, carbs, fat] = [
    n["energy-kcal_100g"],
    n.proteins_100g,
    n.carbohydrates_100g,
    n.fat_100g,
  ].map((v) => (v == null ? NaN : Number(v)));
  if (
    ![calories, protein, carbs, fat].every(isNonNegFinite) ||
    protein + carbs + fat > 100 ||
    calories > 900
  ) {
    return { error: "Product nutrition data is unavailable", statusCode: 404 };
  }

  return {
    food: {
      name: p.product_name || "",
      brandName: p.brands || null,
      calories,
      protein,
      carbs,
      fat,
    },
  };
}

// Re-fetch a barcode server-side (so the client can't supply nutrition) and
// atomically upsert its Food + single 100 g serving. Returns { food, serving }
// or fetchBarcodeFood's { error, statusCode }. The non-empty `update` makes
// Prisma emit a native INSERT ... ON CONFLICT DO UPDATE (an empty one falls back
// to SELECT-then-INSERT); its row lock is held until commit, so a concurrent
// scan blocks before the serving findFirst, preventing duplicate 100 g rows.
async function materializeBarcodeFood(barcode) {
  const result = await fetchBarcodeFood(barcode);
  if (result.error) return result;
  const { name, brandName, ...macros } = result.food;

  return prisma.$transaction(async (tx) => {
    const food = await tx.food.upsert({
      where: { source_foodUrl: { source: "barcode", foodUrl: barcode } },
      create: { source: "barcode", name, brandName, foodType: "Brand", foodUrl: barcode },
      update: { name, brandName },
    });
    const serving =
      (await tx.foodServing.findFirst({ where: { foodId: food.id } })) ??
      (await tx.foodServing.create({ data: { foodId: food.id, ...BARCODE_SERVING, ...macros } }));
    return { food, serving };
  });
}

// GET /api/meals/barcode/:barcode
// Returns a v5-shaped payload: one food with a single synthetic 100g serving.
router.get("/barcode/:barcode", async (req, res, next) => {
  try {
    const { barcode } = req.params;
    if (!BARCODE_RE.test(barcode)) {
      return res.status(400).json({ error: "Invalid barcode format" });
    }

    const result = await fetchBarcodeFood(barcode);
    if (result.error) return res.status(result.statusCode).json({ error: result.error });

    const { name, brandName, ...macros } = result.food;
    res.json({
      barcode,
      food: {
        source: "barcode",
        name,
        brandName,
        foodType: "Brand",
        servings: [{ ...BARCODE_SERVING, ...macros }],
      },
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/meals?date=YYYY-MM-DD
router.get("/", async (req, res, next) => {
  try {
    const { userId } = req.user;
    const { date } = req.query;

    if (!date) return res.status(400).json({ error: "date query parameter is required" });
    const parsedDate = parseDate(date);
    if (!parsedDate) return res.status(400).json({ error: "date must be in YYYY-MM-DD format" });

    const entries = await prisma.mealEntry.findMany({
      where: { userId, date: dayRange(parsedDate) },
      orderBy: { createdAt: "asc" },
    });

    const grouped = { breakfast: [], lunch: [], dinner: [], snack: [] };
    const totals = { calories: 0, protein: 0, carbs: 0, fat: 0 };
    for (const entry of entries) {
      const e = serializeEntry(entry);
      grouped[e.mealType]?.push(e);
      for (const k in totals) totals[k] += e[k];
    }

    res.json({ ...grouped, totals });
  } catch (err) {
    next(err);
  }
});

// POST /api/meals
// body: { date, mealType, quantity, food, serving }
//   food:    { source:'fatsecret', fatSecretFoodId, ... }
//         |  { source:'custom' }
//         |  { source:'barcode', barcode:'<8-14 digits>' }
//   serving: { source:'fatsecret', fatSecretServingId, ... }
//         |  { source:'custom', servingId }
//         |  {} (ignored for barcode — the 100g serving is resolved server-side)
router.post("/", async (req, res, next) => {
  try {
    const { userId } = req.user;
    const { date, mealType, quantity, food, serving } = req.body || {};

    if (!date || !mealType || !food || !serving) {
      return res.status(400).json({ error: "date, mealType, food and serving are required" });
    }
    if (!VALID_MEAL_TYPES.includes(mealType)) {
      return res
        .status(400)
        .json({ error: `mealType must be one of: ${VALID_MEAL_TYPES.join(", ")}` });
    }
    const parsedDate = parseDate(date);
    if (!parsedDate) return res.status(400).json({ error: "date must be in YYYY-MM-DD format" });
    if (!isFiniteNumber(quantity) || quantity <= 0) {
      return res.status(400).json({ error: "quantity must be a positive finite number" });
    }

    let storedFood;
    let storedServing;

    if (food.source === "fatsecret") {
      // The client only identifies which FS food + serving they want to log.
      // The actual nutrition data is fetched server-side so a malicious client
      // can't poison the shared FS food row (userId=null) with bogus macros.
      if (!isPositiveInt(food.fatSecretFoodId)) {
        return res.status(400).json({ error: "food.fatSecretFoodId must be a positive integer" });
      }
      if (serving.source !== "fatsecret" || !isPositiveInt(serving.fatSecretServingId)) {
        return res
          .status(400)
          .json({ error: "serving.fatSecretServingId must be a positive integer" });
      }
      const stored = await materializeFood(food.fatSecretFoodId);
      if (!stored) return res.status(404).json({ error: "FatSecret food not found" });
      storedFood = stored.food;
      storedServing = stored.servings.find(
        (s) => s.fatSecretServingId === serving.fatSecretServingId
      );
      if (!storedServing) return res.status(400).json({ error: "serving not found on food" });
    } else if (food.source === "custom") {
      if (typeof serving.servingId !== "string" || !serving.servingId) {
        return res.status(400).json({ error: "serving.servingId is required for custom foods" });
      }
      storedServing = await prisma.foodServing.findUnique({
        where: { id: serving.servingId },
        include: { food: true },
      });
      if (!storedServing) return res.status(404).json({ error: "serving not found" });
      storedFood = storedServing.food;
      if (storedFood.source !== "custom" || storedFood.userId !== userId) {
        return res.status(403).json({ error: "Not authorized to use that serving" });
      }
    } else if (food.source === "barcode") {
      if (typeof food.barcode !== "string" || !BARCODE_RE.test(food.barcode)) {
        return res.status(400).json({ error: "food.barcode must be a valid 8–14 digit barcode" });
      }
      const result = await materializeBarcodeFood(food.barcode);
      if (result.error) return res.status(result.statusCode).json({ error: result.error });
      storedFood = result.food;
      storedServing = result.serving;
    } else {
      return res
        .status(400)
        .json({ error: 'food.source must be "fatsecret", "custom", or "barcode"' });
    }

    const entry = await prisma.mealEntry.create({
      data: {
        userId,
        date: parsedDate,
        mealType,
        ...entrySnapshot(storedServing, storedFood, quantity),
      },
    });

    res.status(201).json(serializeEntry(entry));
  } catch (err) {
    next(err);
  }
});

// DELETE /api/meals/:id
router.delete("/:id", async (req, res, next) => {
  try {
    const { userId } = req.user;
    const { id } = req.params;

    const entry = await prisma.mealEntry.findUnique({ where: { id } });
    if (!entry) return res.status(404).json({ error: "Meal entry not found" });
    if (entry.userId !== userId) return res.status(403).json({ error: "Not authorized" });

    await prisma.mealEntry.delete({ where: { id } });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

// ─── Custom foods ──────────────────────────────────────────────────────────

// Returns an error message for an invalid custom-food body, or null.
function validateCustomFood({ name, brandName, servings }) {
  if (typeof name !== "string" || !name.trim()) return "name is required";
  if (!isNullableString(brandName)) return "brandName must be a string";
  if (!Array.isArray(servings) || servings.length === 0) {
    return "servings must be a non-empty array";
  }
  for (const [i, s] of servings.entries()) {
    if (!s || typeof s !== "object") return `servings[${i}] must be an object`;
    if (typeof s.description !== "string" || !s.description.trim()) {
      return `servings[${i}].description is required`;
    }
    for (const field of ["metricUnit", "measurementDescription"]) {
      if (!isNullableString(s[field])) return `servings[${i}].${field} must be a string`;
    }
    for (const field of ["calories", "protein", "carbs", "fat"]) {
      if (!isNonNegFinite(s[field])) {
        return `servings[${i}].${field} must be a finite non-negative number`;
      }
    }
    for (const field of [
      "fiber",
      "sugar",
      "sodium",
      "saturatedFat",
      "addedSugars",
      "metricAmount",
      "numberOfUnits",
    ]) {
      if (s[field] != null && !isNonNegFinite(s[field])) {
        return `servings[${i}].${field} must be null or a finite non-negative number`;
      }
    }
    if (s.id != null && typeof s.id !== "string") {
      return `servings[${i}].id must be a string`;
    }
  }
  if (servings.filter((s) => s.isDefault === true).length > 1) {
    return "at most one serving may be marked isDefault";
  }
  return null;
}

function servingPayload(s) {
  return {
    description: s.description.trim(),
    metricAmount: s.metricAmount ?? null,
    metricUnit: trimOrNull(s.metricUnit),
    measurementDescription: trimOrNull(s.measurementDescription),
    numberOfUnits: s.numberOfUnits ?? null,
    isDefault: s.isDefault === true,
    calories: s.calories,
    protein: s.protein,
    carbs: s.carbs,
    fat: s.fat,
    fiber: s.fiber ?? null,
    sugar: s.sugar ?? null,
    sodium: s.sodium ?? null,
    saturatedFat: s.saturatedFat ?? null,
    addedSugars: s.addedSugars ?? null,
  };
}

// GET /api/meals/custom-foods
router.get("/custom-foods", async (req, res, next) => {
  try {
    const foods = await prisma.food.findMany({
      where: { userId: req.user.userId, source: "custom" },
      include: SERVINGS_ASC,
      orderBy: { createdAt: "desc" },
    });
    res.json(foods.map(serializeFood));
  } catch (err) {
    next(err);
  }
});

// POST /api/meals/custom-foods
router.post("/custom-foods", async (req, res, next) => {
  try {
    const { userId } = req.user;
    const { name, brandName, servings } = req.body || {};
    const invalid = validateCustomFood({ name, brandName, servings });
    if (invalid) return res.status(400).json({ error: invalid });

    const food = await prisma.food.create({
      data: {
        source: "custom",
        userId,
        name: name.trim(),
        brandName: trimOrNull(brandName),
        foodType: "Custom",
        servings: { create: servings.map(servingPayload) },
      },
      include: SERVINGS_ASC,
    });
    res.status(201).json(serializeFood(food));
  } catch (err) {
    if (err.code === "P2002")
      return res.status(409).json({ error: "A custom food with that name already exists" });
    next(err);
  }
});

// PUT /api/meals/custom-foods/:id
// Servings carry their own id when the client edits an existing one. We
// update by id so unchanged servings keep their primary key, preserving
// MealPresetItem references (which cascade-delete when a serving id goes
// away) and MealEntry.servingId pointers.
router.put("/custom-foods/:id", async (req, res, next) => {
  try {
    const { userId } = req.user;
    const { name, brandName, servings } = req.body || {};
    const { id } = req.params;
    const invalid = validateCustomFood({ name, brandName, servings });
    if (invalid) return res.status(400).json({ error: invalid });

    const existing = await prisma.food.findUnique({
      where: { id },
      include: { servings: true },
    });
    if (!existing) return res.status(404).json({ error: "Custom food not found" });
    if (existing.source !== "custom" || existing.userId !== userId) {
      return res.status(403).json({ error: "Not authorized" });
    }

    const existingIds = new Set(existing.servings.map((s) => s.id));
    const updated = await prisma.$transaction(async (tx) => {
      await tx.foodServing.deleteMany({
        where: { foodId: id, id: { notIn: servings.map((s) => s.id).filter(Boolean) } },
      });
      for (const s of servings) {
        const data = servingPayload(s);
        if (existingIds.has(s.id)) {
          await tx.foodServing.update({ where: { id: s.id }, data });
        } else {
          await tx.foodServing.create({ data: { ...data, foodId: id } });
        }
      }
      return tx.food.update({
        where: { id },
        data: { name: name.trim(), brandName: trimOrNull(brandName) },
        include: SERVINGS_ASC,
      });
    });
    res.json(serializeFood(updated));
  } catch (err) {
    if (err.code === "P2002")
      return res.status(409).json({ error: "A custom food with that name already exists" });
    next(err);
  }
});

// DELETE /api/meals/custom-foods/:id
router.delete("/custom-foods/:id", async (req, res, next) => {
  try {
    const { userId } = req.user;
    const { id } = req.params;
    const food = await prisma.food.findUnique({ where: { id } });
    if (!food) return res.status(404).json({ error: "Custom food not found" });
    if (food.source !== "custom" || food.userId !== userId) {
      return res.status(403).json({ error: "Not authorized" });
    }
    await prisma.food.delete({ where: { id } });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

// ─── Presets ───────────────────────────────────────────────────────────────

// Validates preset items and resolves them to MealPresetItem create rows.
// Returns { error } or { rows }.
async function resolvePresetItems(items, userId) {
  if (!Array.isArray(items) || items.length === 0) {
    return { error: "at least one item is required" };
  }
  for (const [i, item] of items.entries()) {
    if (!item || typeof item !== "object") return { error: `items[${i}] must be an object` };
    if (typeof item.servingId !== "string" || !item.servingId)
      return { error: `items[${i}].servingId is required` };
    if (!isFiniteNumber(item.quantity) || item.quantity <= 0)
      return { error: `items[${i}].quantity must be a positive number` };
  }
  const servings = await prisma.foodServing.findMany({
    where: { id: { in: items.map((item) => item.servingId) } },
    include: { food: true },
  });
  const byId = new Map(servings.map((s) => [s.id, s]));
  const rows = [];
  for (const [i, item] of items.entries()) {
    const s = byId.get(item.servingId);
    if (!s) return { error: `items[${i}].servingId not found` };
    if (s.food.source === "custom" && s.food.userId !== userId) {
      return { error: `items[${i}] references a serving you don't own` };
    }
    rows.push({
      servingId: s.id,
      quantity: item.quantity,
      foodNameSnapshot: s.food.name,
      servingDescSnapshot: s.description,
    });
  }
  return { rows };
}

function serializePreset(p) {
  return {
    id: p.id,
    name: p.name,
    createdAt: p.createdAt,
    items: p.items.map(({ serving, ...item }) => ({
      id: item.id,
      servingId: item.servingId,
      quantity: item.quantity,
      foodName: item.foodNameSnapshot,
      servingDesc: item.servingDescSnapshot,
      serving: serializeServing(serving),
      food: {
        id: serving.food.id,
        source: serving.food.source,
        name: serving.food.name,
        brandName: serving.food.brandName,
      },
    })),
  };
}

// GET /api/meals/presets
router.get("/presets", async (req, res, next) => {
  try {
    const presets = await prisma.mealPreset.findMany({
      where: { userId: req.user.userId },
      include: PRESET_INCLUDE,
      orderBy: { createdAt: "desc" },
    });
    res.json(presets.map(serializePreset));
  } catch (err) {
    next(err);
  }
});

// POST /api/meals/presets
router.post("/presets", async (req, res, next) => {
  try {
    const { userId } = req.user;
    const { name, items } = req.body || {};
    if (typeof name !== "string" || !name.trim()) {
      return res.status(400).json({ error: "name is required" });
    }
    const { error, rows } = await resolvePresetItems(items, userId);
    if (error) return res.status(400).json({ error });

    const preset = await prisma.mealPreset.create({
      data: { userId, name: name.trim(), items: { create: rows } },
      include: PRESET_INCLUDE,
    });
    res.status(201).json(serializePreset(preset));
  } catch (err) {
    if (err.code === "P2002")
      return res.status(409).json({ error: "A preset with that name already exists" });
    next(err);
  }
});

// PUT /api/meals/presets/:id
router.put("/presets/:id", async (req, res, next) => {
  try {
    const { userId } = req.user;
    const { name, items } = req.body || {};
    const { id } = req.params;

    if (typeof name !== "string" || !name.trim()) {
      return res.status(400).json({ error: "name is required" });
    }
    const existing = await prisma.mealPreset.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ error: "Preset not found" });
    if (existing.userId !== userId) return res.status(403).json({ error: "Not authorized" });

    const { error, rows } = await resolvePresetItems(items, userId);
    if (error) return res.status(400).json({ error });

    const updated = await prisma.$transaction(async (tx) => {
      await tx.mealPresetItem.deleteMany({ where: { presetId: id } });
      return tx.mealPreset.update({
        where: { id },
        data: { name: name.trim(), items: { create: rows } },
        include: PRESET_INCLUDE,
      });
    });
    res.json(serializePreset(updated));
  } catch (err) {
    if (err.code === "P2002")
      return res.status(409).json({ error: "A preset with that name already exists" });
    next(err);
  }
});

// DELETE /api/meals/presets/:id
router.delete("/presets/:id", async (req, res, next) => {
  try {
    const { userId } = req.user;
    const preset = await prisma.mealPreset.findUnique({ where: { id: req.params.id } });
    if (!preset) return res.status(404).json({ error: "Preset not found" });
    if (preset.userId !== userId) return res.status(403).json({ error: "Not authorized" });
    await prisma.mealPreset.delete({ where: { id: req.params.id } });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

// POST /api/meals/presets/:id/log
router.post("/presets/:id/log", async (req, res, next) => {
  try {
    const { userId } = req.user;
    const { date, mealType } = req.body || {};
    if (!date || !mealType)
      return res.status(400).json({ error: "date and mealType are required" });
    if (!VALID_MEAL_TYPES.includes(mealType))
      return res.status(400).json({ error: "Invalid mealType" });
    const parsedDate = parseDate(date);
    if (!parsedDate) return res.status(400).json({ error: "date must be YYYY-MM-DD" });

    const preset = await prisma.mealPreset.findUnique({
      where: { id: req.params.id },
      include: PRESET_INCLUDE,
    });
    if (!preset) return res.status(404).json({ error: "Preset not found" });
    if (preset.userId !== userId) return res.status(403).json({ error: "Not authorized" });

    const entries = await prisma.$transaction(
      preset.items.map(({ serving, quantity }) =>
        prisma.mealEntry.create({
          data: {
            userId,
            date: parsedDate,
            mealType,
            ...entrySnapshot(serving, serving.food, quantity),
          },
        })
      )
    );
    res.status(201).json(entries.map(serializeEntry));
  } catch (err) {
    next(err);
  }
});

// ─── Recent ────────────────────────────────────────────────────────────────
// GET /api/meals/recent?mealType=<breakfast|lunch|dinner|snack>
// Distinct foods the user has recently logged for this meal type, derived from
// MealEntry history (no separate table). Returned in serializeFood shape so the
// client can re-log them directly, like custom foods.
router.get("/recent", async (req, res, next) => {
  try {
    const { userId } = req.user;
    const { mealType } = req.query;
    if (!VALID_MEAL_TYPES.includes(mealType)) {
      return res.status(400).json({ error: "Invalid mealType" });
    }
    // Pull a recent window of entries (whose serving still exists) and dedupe by
    // food in JS — Prisma `distinct` only works on scalar columns of the queried
    // model, not the joined food.id.
    const entries = await prisma.mealEntry.findMany({
      where: { userId, mealType, servingId: { not: null } },
      orderBy: { createdAt: "desc" },
      take: 100,
      include: { serving: { include: { food: { include: SERVINGS_ASC } } } },
    });
    const foods = new Map();
    for (const { serving } of entries) {
      if (!serving) continue; // deleted between the entry and serving SELECTs
      if (!foods.has(serving.food.id)) foods.set(serving.food.id, serializeFood(serving.food));
      if (foods.size >= 15) break;
    }
    res.json([...foods.values()]);
  } catch (err) {
    next(err);
  }
});

// ─── Favorites ─────────────────────────────────────────────────────────────
// Per-user, per-meal-type favorite markers on a Food. Favorites reference the
// shared Food rows (a FatSecret/barcode row is owned by nobody), so the marker
// lives in its own FavoriteFood table rather than a boolean on Food.

// GET /api/meals/favorites?mealType=<breakfast|lunch|dinner|snack>
router.get("/favorites", async (req, res, next) => {
  try {
    const { userId } = req.user;
    const { mealType } = req.query;
    if (!VALID_MEAL_TYPES.includes(mealType)) {
      return res.status(400).json({ error: "Invalid mealType" });
    }
    const favorites = await prisma.favoriteFood.findMany({
      where: { userId, mealType },
      orderBy: { createdAt: "desc" },
      include: { food: { include: SERVINGS_ASC } },
    });
    res.json(favorites.map((f) => serializeFood(f.food)));
  } catch (err) {
    next(err);
  }
});

// POST /api/meals/favorites
// body: { mealType, ...foodRef } where foodRef is one of:
//   { foodId }                              — an already-stored Food
//   { source:'fatsecret', fatSecretFoodId } — a raw search hit; materialized here
//   { source:'barcode', barcode }           — a barcode; materialized here
router.post("/favorites", async (req, res, next) => {
  try {
    const { userId } = req.user;
    const { mealType, foodId, source, fatSecretFoodId, barcode } = req.body || {};

    if (!VALID_MEAL_TYPES.includes(mealType)) {
      return res.status(400).json({ error: "Invalid mealType" });
    }

    // Resolve the request to a stored Food id, materializing FatSecret/barcode
    // foods from the source of truth so a client can't supply bogus macros.
    let id;
    if (typeof foodId === "string" && foodId) {
      id = foodId;
    } else if (source === "fatsecret") {
      if (!isPositiveInt(fatSecretFoodId)) {
        return res.status(400).json({ error: "fatSecretFoodId must be a positive integer" });
      }
      const stored = await materializeFood(fatSecretFoodId);
      if (!stored) return res.status(404).json({ error: "FatSecret food not found" });
      id = stored.food.id;
    } else if (source === "barcode") {
      if (typeof barcode !== "string" || !BARCODE_RE.test(barcode)) {
        return res.status(400).json({ error: "barcode must be a valid 8–14 digit barcode" });
      }
      const result = await materializeBarcodeFood(barcode);
      if (result.error) return res.status(result.statusCode).json({ error: result.error });
      id = result.food.id;
    } else {
      return res
        .status(400)
        .json({ error: "foodId, or source 'fatsecret'/'barcode' with its id, is required" });
    }

    const food = await prisma.food.findUnique({ where: { id }, include: SERVINGS_ASC });
    if (!food) return res.status(404).json({ error: "Food not found" });
    // Custom foods are per-user; only the owner may favorite (and read) them.
    if (food.source === "custom" && food.userId !== userId) {
      return res.status(403).json({ error: "Not authorized to use that food" });
    }

    await prisma.favoriteFood.upsert({
      where: { userId_foodId_mealType: { userId, foodId: food.id, mealType } },
      create: { userId, foodId: food.id, mealType },
      update: {},
    });
    res.status(201).json(serializeFood(food));
  } catch (err) {
    next(err);
  }
});

// DELETE /api/meals/favorites/:foodId?mealType=<...>
router.delete("/favorites/:foodId", async (req, res, next) => {
  try {
    const { userId } = req.user;
    const { foodId } = req.params;
    const { mealType } = req.query;
    if (!VALID_MEAL_TYPES.includes(mealType)) {
      return res.status(400).json({ error: "Invalid mealType" });
    }
    await prisma.favoriteFood.deleteMany({ where: { userId, foodId, mealType } });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

export default router;
