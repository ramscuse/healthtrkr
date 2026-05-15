import { Router } from 'express';
import prisma from '../lib/prisma.js';
import { searchFoods, fetchFoodById, materializeFood } from '../server/fatSecret.js';

const router = Router();

const VALID_MEAL_TYPES = ['breakfast', 'lunch', 'dinner', 'snack'];
const BARCODE_RE = /^\d{8,14}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function parseDate(dateStr) {
  if (!DATE_RE.test(dateStr)) return null;
  const d = new Date(dateStr);
  return isNaN(d.getTime()) ? null : d;
}

function isFiniteNumber(v) {
  return typeof v === 'number' && Number.isFinite(v);
}

function isPositiveInt(v) {
  return typeof v === 'number' && Number.isInteger(v) && v > 0;
}

function isNullableFinite(v) {
  return v === null || v === undefined || isFiniteNumber(v);
}

// Compute snapshot macros = serving.macro * quantity. Required macros default
// to 0 to avoid writing NaN into NOT NULL columns if a serving somehow has a
// missing required nutrient; optional ones stay null when absent.
function snapshot(serving, quantity, displayName, displayDesc, brandName = null) {
  const req = n => (Number.isFinite(n) ? n : 0) * quantity;
  const opt = n => (n == null ? null : n * quantity);
  return {
    quantity,
    foodNameSnapshot: displayName,
    brandNameSnapshot: brandName,
    servingDescSnapshot: displayDesc,
    caloriesSnapshot: req(serving.calories),
    proteinSnapshot:  req(serving.protein),
    carbsSnapshot:    req(serving.carbs),
    fatSnapshot:      req(serving.fat),
    fiberSnapshot:        opt(serving.fiber),
    sugarSnapshot:        opt(serving.sugar),
    sodiumSnapshot:       opt(serving.sodium),
    saturatedFatSnapshot: opt(serving.saturatedFat),
    addedSugarsSnapshot:  opt(serving.addedSugars),
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
    servings: (f.servings || []).map(serializeServing),
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
    protein:  e.proteinSnapshot,
    carbs:    e.carbsSnapshot,
    fat:      e.fatSnapshot,
    fiber:    e.fiberSnapshot,
    sugar:    e.sugarSnapshot,
    sodium:   e.sodiumSnapshot,
    saturatedFat: e.saturatedFatSnapshot,
    addedSugars:  e.addedSugarsSnapshot,
    servingId: e.servingId,
  };
}

// GET /api/meals/search?q=...
// Returns lightweight food hits. Each hit has a default-serving preview parsed
// from the food_description string. Full servings are fetched lazily via
// GET /foods/:foodId when the user picks a result.
router.get('/search', async (req, res, next) => {
  try {
    const q = (req.query.q || '').trim();
    if (q.length < 2) return res.json({ foods: [] });

    const foods = await searchFoods(q, 10);
    res.json({ foods });
  } catch (err) {
    next(err);
  }
});

// GET /api/meals/foods/:foodId — fetch full FatSecret food + servings.
router.get('/foods/:foodId', async (req, res, next) => {
  try {
    const id = Number(req.params.foodId);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: 'foodId must be a positive integer' });
    }
    const food = await fetchFoodById(id);
    if (!food) return res.status(404).json({ error: 'Food not found' });
    res.json(food);
  } catch (err) {
    next(err);
  }
});

// GET /api/meals/barcode/:barcode
// Returns a v5-shaped payload: one food with a single synthetic 100g serving.
router.get('/barcode/:barcode', async (req, res, next) => {
  try {
    const { barcode } = req.params;
    if (!BARCODE_RE.test(barcode)) {
      return res.status(400).json({ error: 'Invalid barcode format' });
    }

    let data;
    try {
      const response = await fetch(`https://world.openfoodfacts.org/api/v0/product/${encodeURIComponent(barcode)}.json`);
      data = await response.json();
    } catch {
      return res.status(404).json({ error: 'Product not found' });
    }

    if (data.status !== 1) return res.status(404).json({ error: 'Product not found' });

    const p = data.product;
    const calories = Number(p.nutriments?.['energy-kcal_100g'] ?? 0);
    const protein  = Number(p.nutriments?.proteins_100g ?? 0);
    const carbs    = Number(p.nutriments?.carbohydrates_100g ?? 0);
    const fat      = Number(p.nutriments?.fat_100g ?? 0);

    if (!isFinite(calories) || !isFinite(protein) || !isFinite(carbs) || !isFinite(fat) ||
        calories < 0 || protein < 0 || carbs < 0 || fat < 0 ||
        protein + carbs + fat > 100 || calories > 900) {
      return res.status(404).json({ error: 'Product nutrition data is unavailable' });
    }

    res.json({
      barcode,
      food: {
        source: 'barcode',
        name: p.product_name || '',
        brandName: p.brands || null,
        foodType: 'Brand',
        servings: [{
          description: '100 g',
          metricAmount: 100,
          metricUnit: 'g',
          isDefault: true,
          calories, protein, carbs, fat,
        }],
      },
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/meals?date=YYYY-MM-DD
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

    const entries = await prisma.mealEntry.findMany({
      where: { userId, date: { gte: start, lte: end } },
      orderBy: { createdAt: 'asc' },
    });

    const grouped = { breakfast: [], lunch: [], dinner: [], snack: [] };
    const totals = { calories: 0, protein: 0, carbs: 0, fat: 0 };

    for (const entry of entries) {
      const e = serializeEntry(entry);
      grouped[entry.mealType]?.push(e);
      totals.calories += e.calories || 0;
      totals.protein  += e.protein  || 0;
      totals.carbs    += e.carbs    || 0;
      totals.fat      += e.fat      || 0;
    }

    res.json({ ...grouped, totals });
  } catch (err) {
    next(err);
  }
});

// POST /api/meals
// body: { date, mealType, quantity, food, serving }
//   food:    { source:'fatsecret', fatSecretFoodId, foodName, brandName, foodType, foodUrl, servings:[...] }
//         |  { source:'custom' }
//   serving: { source:'fatsecret', fatSecretServingId, ...full inline payload }
//         |  { source:'custom', servingId }
router.post('/', async (req, res, next) => {
  try {
    const { userId } = req.user;
    const { date, mealType, quantity, food, serving } = req.body || {};

    if (!date || !mealType || !food || !serving) {
      return res.status(400).json({ error: 'date, mealType, food and serving are required' });
    }
    if (!VALID_MEAL_TYPES.includes(mealType)) {
      return res.status(400).json({ error: `mealType must be one of: ${VALID_MEAL_TYPES.join(', ')}` });
    }
    const parsedDate = parseDate(date);
    if (!parsedDate) return res.status(400).json({ error: 'date must be in YYYY-MM-DD format' });
    if (!isFiniteNumber(quantity) || quantity <= 0) {
      return res.status(400).json({ error: 'quantity must be a positive finite number' });
    }

    let resolvedServing;
    let resolvedFood;

    if (food.source === 'fatsecret') {
      // The client only identifies which FS food + serving they want to log.
      // The actual nutrition data is fetched server-side so a malicious client
      // can't poison the shared FS food row (userId=null) with bogus macros.
      if (!isPositiveInt(food.fatSecretFoodId)) {
        return res.status(400).json({ error: 'food.fatSecretFoodId must be a positive integer' });
      }
      if (serving.source !== 'fatsecret' || !isPositiveInt(serving.fatSecretServingId)) {
        return res.status(400).json({ error: 'serving.fatSecretServingId must be a positive integer' });
      }
      const fsFood = await fetchFoodById(food.fatSecretFoodId);
      if (!fsFood) return res.status(404).json({ error: 'FatSecret food not found' });

      const { food: storedFood, servings } = await materializeFood(prisma, fsFood);
      resolvedFood = storedFood;
      resolvedServing = servings.find(s => s.fatSecretServingId === serving.fatSecretServingId);
      if (!resolvedServing) return res.status(400).json({ error: 'serving not found on food' });

    } else if (food.source === 'custom') {
      if (typeof serving.servingId !== 'string' || !serving.servingId) {
        return res.status(400).json({ error: 'serving.servingId is required for custom foods' });
      }
      const dbServing = await prisma.foodServing.findUnique({
        where: { id: serving.servingId },
        include: { food: true },
      });
      if (!dbServing) return res.status(404).json({ error: 'serving not found' });
      if (dbServing.food.source !== 'custom' || dbServing.food.userId !== userId) {
        return res.status(403).json({ error: 'Not authorized to use that serving' });
      }
      resolvedServing = dbServing;
      resolvedFood = dbServing.food;

    } else {
      return res.status(400).json({ error: 'food.source must be "fatsecret" or "custom"' });
    }

    const snap = snapshot(
      resolvedServing,
      quantity,
      resolvedFood.name,
      resolvedServing.description,
      resolvedFood.brandName,
    );

    const entry = await prisma.mealEntry.create({
      data: {
        userId,
        date: parsedDate,
        mealType,
        servingId: resolvedServing.id,
        ...snap,
      },
    });

    res.status(201).json(serializeEntry(entry));
  } catch (err) {
    next(err);
  }
});

// DELETE /api/meals/:id
router.delete('/:id', async (req, res, next) => {
  try {
    const { userId } = req.user;
    const { id } = req.params;

    const entry = await prisma.mealEntry.findUnique({ where: { id } });
    if (!entry) return res.status(404).json({ error: 'Meal entry not found' });
    if (entry.userId !== userId) return res.status(403).json({ error: 'Not authorized' });

    await prisma.mealEntry.delete({ where: { id } });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

// ─── Custom foods ──────────────────────────────────────────────────────────

function validateCustomServingsPayload(servings) {
  if (!Array.isArray(servings) || servings.length === 0) {
    return 'servings must be a non-empty array';
  }
  let defaultCount = 0;
  for (const [i, s] of servings.entries()) {
    if (!s || typeof s !== 'object') return `servings[${i}] must be an object`;
    if (typeof s.description !== 'string' || !s.description.trim()) {
      return `servings[${i}].description is required`;
    }
    for (const field of ['calories', 'protein', 'carbs', 'fat']) {
      if (!isFiniteNumber(s[field]) || s[field] < 0) {
        return `servings[${i}].${field} must be a finite non-negative number`;
      }
    }
    for (const field of ['fiber', 'sugar', 'sodium', 'saturatedFat', 'addedSugars', 'metricAmount', 'numberOfUnits']) {
      if (!isNullableFinite(s[field])) {
        return `servings[${i}].${field} must be null or a finite number`;
      }
    }
    if (s.isDefault === true) defaultCount += 1;
  }
  if (defaultCount > 1) return 'at most one serving may be marked isDefault';
  return null;
}

function mapCustomServings(servings) {
  return servings.map(s => ({
    description: s.description.trim(),
    metricAmount: s.metricAmount ?? null,
    metricUnit: s.metricUnit?.trim() || null,
    measurementDescription: s.measurementDescription?.trim() || null,
    numberOfUnits: s.numberOfUnits ?? null,
    isDefault: s.isDefault === true,
    calories: s.calories,
    protein:  s.protein,
    carbs:    s.carbs,
    fat:      s.fat,
    fiber:        s.fiber        ?? null,
    sugar:        s.sugar        ?? null,
    sodium:       s.sodium       ?? null,
    saturatedFat: s.saturatedFat ?? null,
    addedSugars:  s.addedSugars  ?? null,
  }));
}

// GET /api/meals/custom-foods
router.get('/custom-foods', async (req, res, next) => {
  try {
    const foods = await prisma.food.findMany({
      where: { userId: req.user.userId, source: 'custom' },
      include: { servings: { orderBy: { createdAt: 'asc' } } },
      orderBy: { createdAt: 'desc' },
    });
    res.json(foods.map(serializeFood));
  } catch (err) { next(err); }
});

// POST /api/meals/custom-foods
router.post('/custom-foods', async (req, res, next) => {
  try {
    const { userId } = req.user;
    const { name, brandName, servings } = req.body || {};

    if (typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ error: 'name is required' });
    }
    const servingsErr = validateCustomServingsPayload(servings);
    if (servingsErr) return res.status(400).json({ error: servingsErr });

    const food = await prisma.food.create({
      data: {
        source: 'custom',
        userId,
        name: name.trim(),
        brandName: brandName?.trim() || null,
        foodType: 'Custom',
        servings: { create: mapCustomServings(servings) },
      },
      include: { servings: { orderBy: { createdAt: 'asc' } } },
    });
    res.status(201).json(serializeFood(food));
  } catch (err) {
    if (err.code === 'P2002') return res.status(409).json({ error: 'A custom food with that name already exists' });
    next(err);
  }
});

// PUT /api/meals/custom-foods/:id
router.put('/custom-foods/:id', async (req, res, next) => {
  try {
    const { userId } = req.user;
    const { name, brandName, servings } = req.body || {};
    const { id } = req.params;

    if (typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ error: 'name is required' });
    }
    const servingsErr = validateCustomServingsPayload(servings);
    if (servingsErr) return res.status(400).json({ error: servingsErr });

    const existing = await prisma.food.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ error: 'Custom food not found' });
    if (existing.source !== 'custom' || existing.userId !== userId) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    const updated = await prisma.$transaction(async (tx) => {
      await tx.foodServing.deleteMany({ where: { foodId: id } });
      return tx.food.update({
        where: { id },
        data: {
          name: name.trim(),
          brandName: brandName?.trim() || null,
          servings: { create: mapCustomServings(servings) },
        },
        include: { servings: { orderBy: { createdAt: 'asc' } } },
      });
    });
    res.json(serializeFood(updated));
  } catch (err) {
    if (err.code === 'P2002') return res.status(409).json({ error: 'A custom food with that name already exists' });
    next(err);
  }
});

// DELETE /api/meals/custom-foods/:id
router.delete('/custom-foods/:id', async (req, res, next) => {
  try {
    const { userId } = req.user;
    const { id } = req.params;
    const food = await prisma.food.findUnique({ where: { id } });
    if (!food) return res.status(404).json({ error: 'Custom food not found' });
    if (food.source !== 'custom' || food.userId !== userId) {
      return res.status(403).json({ error: 'Not authorized' });
    }
    await prisma.food.delete({ where: { id } });
    res.status(204).send();
  } catch (err) {
    // P2003: serving still referenced by a preset (Restrict).
    if (err.code === 'P2003') return res.status(409).json({ error: 'This food is used by a preset — remove it from the preset first.' });
    next(err);
  }
});

// ─── Presets ───────────────────────────────────────────────────────────────

async function resolvePresetItems(items, userId) {
  if (!Array.isArray(items) || items.length === 0) {
    return { error: 'at least one item is required' };
  }
  const servingIds = [];
  for (const [i, item] of items.entries()) {
    if (!item || typeof item !== 'object') return { error: `items[${i}] must be an object` };
    if (typeof item.servingId !== 'string' || !item.servingId) return { error: `items[${i}].servingId is required` };
    if (!isFiniteNumber(item.quantity) || item.quantity <= 0) return { error: `items[${i}].quantity must be a positive number` };
    servingIds.push(item.servingId);
  }
  const servings = await prisma.foodServing.findMany({
    where: { id: { in: servingIds } },
    include: { food: true },
  });
  const byId = new Map(servings.map(s => [s.id, s]));
  const resolved = [];
  for (const [i, item] of items.entries()) {
    const s = byId.get(item.servingId);
    if (!s) return { error: `items[${i}].servingId not found` };
    if (s.food.source === 'custom' && s.food.userId !== userId) {
      return { error: `items[${i}] references a serving you don't own` };
    }
    resolved.push({
      servingId: s.id,
      quantity: item.quantity,
      foodNameSnapshot: s.food.name,
      servingDescSnapshot: s.description,
      _serving: s,
      _food: s.food,
    });
  }
  return { resolved };
}

function serializePresetItem(item) {
  return {
    id: item.id,
    servingId: item.servingId,
    quantity: item.quantity,
    foodName: item.foodNameSnapshot,
    servingDesc: item.servingDescSnapshot,
    serving: item.serving ? serializeServing(item.serving) : null,
    food: item.serving?.food ? {
      id: item.serving.food.id,
      source: item.serving.food.source,
      name: item.serving.food.name,
      brandName: item.serving.food.brandName,
    } : null,
  };
}

// GET /api/meals/presets
router.get('/presets', async (req, res, next) => {
  try {
    const presets = await prisma.mealPreset.findMany({
      where: { userId: req.user.userId },
      include: {
        items: {
          include: { serving: { include: { food: true } } },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json(presets.map(p => ({
      id: p.id,
      name: p.name,
      createdAt: p.createdAt,
      items: p.items.map(serializePresetItem),
    })));
  } catch (err) { next(err); }
});

// POST /api/meals/presets
router.post('/presets', async (req, res, next) => {
  try {
    const { userId } = req.user;
    const { name, items } = req.body || {};
    if (typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ error: 'name is required' });
    }
    const { error, resolved } = await resolvePresetItems(items, userId);
    if (error) return res.status(400).json({ error });

    const preset = await prisma.mealPreset.create({
      data: {
        userId,
        name: name.trim(),
        items: {
          create: resolved.map(r => ({
            servingId: r.servingId,
            quantity: r.quantity,
            foodNameSnapshot: r.foodNameSnapshot,
            servingDescSnapshot: r.servingDescSnapshot,
          })),
        },
      },
      include: { items: { include: { serving: { include: { food: true } } } } },
    });
    res.status(201).json({
      id: preset.id,
      name: preset.name,
      createdAt: preset.createdAt,
      items: preset.items.map(serializePresetItem),
    });
  } catch (err) {
    if (err.code === 'P2002') return res.status(409).json({ error: 'A preset with that name already exists' });
    next(err);
  }
});

// PUT /api/meals/presets/:id
router.put('/presets/:id', async (req, res, next) => {
  try {
    const { userId } = req.user;
    const { name, items } = req.body || {};
    const { id } = req.params;

    if (typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ error: 'name is required' });
    }
    const existing = await prisma.mealPreset.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ error: 'Preset not found' });
    if (existing.userId !== userId) return res.status(403).json({ error: 'Not authorized' });

    const { error, resolved } = await resolvePresetItems(items, userId);
    if (error) return res.status(400).json({ error });

    const updated = await prisma.$transaction(async (tx) => {
      await tx.mealPresetItem.deleteMany({ where: { presetId: id } });
      return tx.mealPreset.update({
        where: { id },
        data: {
          name: name.trim(),
          items: {
            create: resolved.map(r => ({
              servingId: r.servingId,
              quantity: r.quantity,
              foodNameSnapshot: r.foodNameSnapshot,
              servingDescSnapshot: r.servingDescSnapshot,
            })),
          },
        },
        include: { items: { include: { serving: { include: { food: true } } } } },
      });
    });
    res.json({
      id: updated.id,
      name: updated.name,
      createdAt: updated.createdAt,
      items: updated.items.map(serializePresetItem),
    });
  } catch (err) {
    if (err.code === 'P2002') return res.status(409).json({ error: 'A preset with that name already exists' });
    next(err);
  }
});

// DELETE /api/meals/presets/:id
router.delete('/presets/:id', async (req, res, next) => {
  try {
    const { userId } = req.user;
    const preset = await prisma.mealPreset.findUnique({ where: { id: req.params.id } });
    if (!preset) return res.status(404).json({ error: 'Preset not found' });
    if (preset.userId !== userId) return res.status(403).json({ error: 'Not authorized' });
    await prisma.mealPreset.delete({ where: { id: req.params.id } });
    res.status(204).send();
  } catch (err) { next(err); }
});

// POST /api/meals/presets/:id/log
router.post('/presets/:id/log', async (req, res, next) => {
  try {
    const { userId } = req.user;
    const { date, mealType } = req.body || {};
    if (!date || !mealType) return res.status(400).json({ error: 'date and mealType are required' });
    if (!VALID_MEAL_TYPES.includes(mealType)) return res.status(400).json({ error: 'Invalid mealType' });
    const parsedDate = parseDate(date);
    if (!parsedDate) return res.status(400).json({ error: 'date must be YYYY-MM-DD' });

    const preset = await prisma.mealPreset.findUnique({
      where: { id: req.params.id },
      include: { items: { include: { serving: { include: { food: true } } } } },
    });
    if (!preset) return res.status(404).json({ error: 'Preset not found' });
    if (preset.userId !== userId) return res.status(403).json({ error: 'Not authorized' });

    const entries = await prisma.$transaction(
      preset.items.map(item => {
        const snap = snapshot(
          item.serving,
          item.quantity,
          item.serving.food.name,
          item.serving.description,
          item.serving.food.brandName,
        );
        return prisma.mealEntry.create({
          data: {
            userId,
            date: parsedDate,
            mealType,
            servingId: item.servingId,
            ...snap,
          },
        });
      }),
    );
    res.status(201).json(entries.map(serializeEntry));
  } catch (err) { next(err); }
});

export default router;
