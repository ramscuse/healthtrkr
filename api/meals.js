import { Router } from 'express';
import prisma from '../lib/prisma.js';
import { searchFoods } from '../server/foodSearch.js';

const router = Router();

const VALID_MEAL_TYPES = ['breakfast', 'lunch', 'dinner', 'snack'];
const BARCODE_RE = /^\d{8,14}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function parseDate(dateStr) {
  if (!DATE_RE.test(dateStr)) return null;
  const d = new Date(dateStr);
  return isNaN(d.getTime()) ? null : d;
}

// GET /api/meals/search?q=...
router.get('/search', (req, res) => {
  const { q } = req.query;
  if (!q) return res.json({ products: [] });

  const results = searchFoods(q, 10);
  const products = results.map((f) => ({
    name: f.name,
    calories: f.calories,
    protein: f.protein,
    carbs: f.carbs,
    fat: f.fat,
    servingSize: 100,
    barcode: '',
  }));

  res.json({ products });
});

// GET /api/meals/barcode/:barcode
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
    const calories = p.nutriments?.['energy-kcal_100g'] ?? 0;
    const protein  = p.nutriments?.proteins_100g ?? 0;
    const carbs    = p.nutriments?.carbohydrates_100g ?? 0;
    const fat      = p.nutriments?.fat_100g ?? 0;

    // Reject physically impossible nutrition data from Open Food Facts crowdsourced entries
    if (protein + carbs + fat > 100 || calories > 900) {
      return res.status(404).json({ error: 'Product nutrition data is unavailable' });
    }

    res.json({ name: p.product_name || '', calories, protein, carbs, fat, servingSize: 100, barcode });
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
      grouped[entry.mealType]?.push(entry);
      totals.calories += entry.calories;
      totals.protein += entry.protein;
      totals.carbs += entry.carbs;
      totals.fat += entry.fat;
    }

    res.json({ ...grouped, totals });
  } catch (err) {
    next(err);
  }
});

// POST /api/meals
router.post('/', async (req, res, next) => {
  try {
    const { userId } = req.user;
    const { date, mealType, foodName, calories, protein, carbs, fat, servingSize, servingUnit } = req.body;

    if (!date || !mealType || !foodName || calories == null || protein == null || carbs == null || fat == null) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    if (!VALID_MEAL_TYPES.includes(mealType)) {
      return res.status(400).json({ error: `mealType must be one of: ${VALID_MEAL_TYPES.join(', ')}` });
    }
    const parsedDate = parseDate(date);
    if (!parsedDate) return res.status(400).json({ error: 'date must be in YYYY-MM-DD format' });

    for (const [field, val] of Object.entries({ calories, protein, carbs, fat })) {
      if (typeof val !== 'number' || !isFinite(val)) {
        return res.status(400).json({ error: `${field} must be a finite number` });
      }
    }

    const entry = await prisma.mealEntry.create({
      data: {
        userId,
        date: parsedDate,
        mealType,
        foodName,
        calories,
        protein,
        carbs,
        fat,
        servingSize: servingSize ?? 100,
        servingUnit: servingUnit ?? 'g',
      },
    });

    res.status(201).json(entry);
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

// GET /api/meals/custom-foods
router.get('/custom-foods', async (req, res, next) => {
  try {
    const foods = await prisma.customFood.findMany({
      where: { userId: req.user.userId },
      orderBy: { createdAt: 'desc' },
    });
    res.json(foods);
  } catch (err) { next(err); }
});

// POST /api/meals/custom-foods
router.post('/custom-foods', async (req, res, next) => {
  try {
    const { userId } = req.user;
    const { name, calories, protein, carbs, fat } = req.body;
    if (!name || calories == null || protein == null || carbs == null || fat == null)
      return res.status(400).json({ error: 'Missing required fields' });
    for (const [field, val] of Object.entries({ calories, protein, carbs, fat })) {
      if (typeof val !== 'number' || !isFinite(val))
        return res.status(400).json({ error: `${field} must be a finite number` });
    }
    const food = await prisma.customFood.create({
      data: { userId, name: name.trim(), calories, protein, carbs, fat },
    });
    res.status(201).json(food);
  } catch (err) {
    if (err.code === 'P2002') return res.status(409).json({ error: 'A custom food with that name already exists' });
    next(err);
  }
});

// DELETE /api/meals/custom-foods/:id
router.delete('/custom-foods/:id', async (req, res, next) => {
  try {
    const { userId } = req.user;
    const food = await prisma.customFood.findUnique({ where: { id: req.params.id } });
    if (!food) return res.status(404).json({ error: 'Custom food not found' });
    if (food.userId !== userId) return res.status(403).json({ error: 'Not authorized' });
    await prisma.customFood.delete({ where: { id: req.params.id } });
    res.status(204).send();
  } catch (err) { next(err); }
});

// GET /api/meals/presets
router.get('/presets', async (req, res, next) => {
  try {
    const presets = await prisma.mealPreset.findMany({
      where: { userId: req.user.userId },
      include: { items: true },
      orderBy: { createdAt: 'desc' },
    });
    res.json(presets);
  } catch (err) { next(err); }
});

function validateItems(items) {
  for (const [i, item] of items.entries()) {
    if (!item.foodName || typeof item.foodName !== 'string' || !item.foodName.trim())
      return `items[${i}].foodName is required`;
    for (const field of ['calories', 'protein', 'carbs', 'fat']) {
      if (typeof item[field] !== 'number' || !isFinite(item[field]))
        return `items[${i}].${field} must be a finite number`;
    }
  }
  return null;
}

function mapItems(items) {
  return items.map(i => ({
    foodName: i.foodName.trim(),
    calories: i.calories,
    protein:  i.protein,
    carbs:    i.carbs,
    fat:      i.fat,
    servings: (typeof i.servings === 'number' && isFinite(i.servings) && i.servings > 0) ? i.servings : 1,
  }));
}

// POST /api/meals/presets
router.post('/presets', async (req, res, next) => {
  try {
    const { userId } = req.user;
    const { name, items } = req.body;
    if (!name || !Array.isArray(items) || items.length === 0)
      return res.status(400).json({ error: 'name and at least one item are required' });
    const itemError = validateItems(items);
    if (itemError) return res.status(400).json({ error: itemError });
    const preset = await prisma.mealPreset.create({
      data: { userId, name: name.trim(), items: { create: mapItems(items) } },
      include: { items: true },
    });
    res.status(201).json(preset);
  } catch (err) {
    if (err.code === 'P2002') return res.status(409).json({ error: 'A preset with that name already exists' });
    next(err);
  }
});

// PUT /api/meals/presets/:id
router.put('/presets/:id', async (req, res, next) => {
  try {
    const { userId } = req.user;
    const { name, items } = req.body;
    if (!name || !Array.isArray(items) || items.length === 0)
      return res.status(400).json({ error: 'name and at least one item are required' });
    const itemError = validateItems(items);
    if (itemError) return res.status(400).json({ error: itemError });

    const preset = await prisma.mealPreset.findUnique({ where: { id: req.params.id } });
    if (!preset) return res.status(404).json({ error: 'Preset not found' });
    if (preset.userId !== userId) return res.status(403).json({ error: 'Not authorized' });

    // Replace all items atomically — deleteMany + update in a single transaction
    const updated = await prisma.$transaction(async (tx) => {
      await tx.mealPresetItem.deleteMany({ where: { presetId: req.params.id } });
      return tx.mealPreset.update({
        where: { id: req.params.id },
        data: { name: name.trim(), items: { create: mapItems(items) } },
        include: { items: true },
      });
    });
    res.json(updated);
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
    const { date, mealType } = req.body;
    if (!date || !mealType) return res.status(400).json({ error: 'date and mealType are required' });
    if (!VALID_MEAL_TYPES.includes(mealType)) return res.status(400).json({ error: 'Invalid mealType' });
    const parsedDate = parseDate(date);
    if (!parsedDate) return res.status(400).json({ error: 'date must be YYYY-MM-DD' });

    const preset = await prisma.mealPreset.findUnique({
      where: { id: req.params.id },
      include: { items: true },
    });
    if (!preset) return res.status(404).json({ error: 'Preset not found' });
    if (preset.userId !== userId) return res.status(403).json({ error: 'Not authorized' });

    const entries = await prisma.$transaction(
      preset.items.map(item =>
        prisma.mealEntry.create({
          data: {
            userId,
            date: parsedDate,
            mealType,
            foodName: item.foodName,
            calories: item.calories * item.servings,
            protein:  item.protein  * item.servings,
            carbs:    item.carbs    * item.servings,
            fat:      item.fat      * item.servings,
            servingSize: item.servings,
            servingUnit: 'serving',
          },
        })
      )
    );
    res.status(201).json(entries);
  } catch (err) { next(err); }
});

export default router;
