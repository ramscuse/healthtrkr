const TOKEN_URL = 'https://oauth.fatsecret.com/connect/token';
const API_URL   = 'https://platform.fatsecret.com/rest/server.api';

class FatSecretError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'FatSecretError';
    this.code = code;
  }
}

let accessToken  = null;
let expiresAt    = 0;      // ms epoch
let tokenPromise = null;   // in-flight guard — prevents concurrent token fetches

async function getToken() {
  if (accessToken && Date.now() < expiresAt - 60_000) return accessToken;
  if (tokenPromise) return tokenPromise;

  tokenPromise = (async () => {
    const { FATSECRET_CLIENT_ID: id, FATSECRET_CLIENT_SECRET: secret } = process.env;
    if (!id || !secret) throw new Error('FATSECRET_CLIENT_ID / FATSECRET_CLIENT_SECRET not set');

    const credentials = Buffer.from(`${id}:${secret}`).toString('base64');
    const res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials&scope=basic',
    });

    if (!res.ok) throw new Error(`FatSecret token request failed: ${res.status}`);
    const data = await res.json();
    accessToken = data.access_token;
    expiresAt   = Date.now() + data.expires_in * 1000;
    return accessToken;
  })().finally(() => { tokenPromise = null; });

  return tokenPromise;
}

async function apiFetch(method, params) {
  const token = await getToken();
  const url   = new URL(API_URL);
  url.searchParams.set('method', method);
  url.searchParams.set('format', 'json');
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) throw new Error(`FatSecret HTTP error: ${res.status}`);

  const data = await res.json();
  if (data?.error) throw new FatSecretError(data.error.code, data.error.message);
  return data;
}

function num(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function requiredNum(v) {
  const n = num(v);
  return n === null ? 0 : n;
}

function asArray(v) {
  if (Array.isArray(v)) return v;
  if (v == null) return [];
  return [v];
}

function normalizeServing(s) {
  return {
    servingId: Number(s.serving_id),
    description: s.serving_description || '',
    metricAmount: num(s.metric_serving_amount),
    metricUnit: s.metric_serving_unit || null,
    measurementDescription: s.measurement_description || null,
    numberOfUnits: num(s.number_of_units),
    isDefault: s.is_default === '1' || s.is_default === 1,
    calories: requiredNum(s.calories),
    protein: requiredNum(s.protein),
    carbs: requiredNum(s.carbohydrate),
    fat: requiredNum(s.fat),
    saturatedFat: num(s.saturated_fat),
    sugar: num(s.sugar),
    addedSugars: num(s.added_sugars),
    fiber: num(s.fiber),
    sodium: num(s.sodium),
  };
}

function normalizeFood(food) {
  const servings = asArray(food?.servings?.serving).map(normalizeServing);
  return {
    foodId: Number(food.food_id),
    foodName: food.food_name || '',
    brandName: food.brand_name || null,
    foodType: food.food_type || 'Generic',
    foodUrl: food.food_url || null,
    servings,
  };
}

// Parse the free-tier `food_description` string for a default-serving preview.
// Format: "Per 1 cup - Calories: 150kcal | Fat: 3.00g | Carbs: 25.00g | Protein: 5.00g"
const DESC_RE = /Per (.+?) - Calories: ([\d.]+)kcal \| Fat: ([\d.]+)g \| Carbs: ([\d.]+)g \| Protein: ([\d.]+)g/;
function parseDefaultPreview(description) {
  const m = description?.match(DESC_RE);
  if (!m) return null;
  return {
    description: m[1],
    calories: parseFloat(m[2]),
    fat: parseFloat(m[3]),
    carbs: parseFloat(m[4]),
    protein: parseFloat(m[5]),
  };
}

// Lightweight food summary returned by /search. Full servings come from
// fetchFoodById on demand (foods.search v5 requires the premier scope which
// basic-tier accounts don't have, so the multi-serving array is fetched lazily
// from the basic-scope food.get endpoint when the user picks a food).
function normalizeSearchHit(food) {
  return {
    foodId: Number(food.food_id),
    foodName: food.food_name || '',
    brandName: food.brand_name || null,
    foodType: food.food_type || 'Generic',
    foodUrl: food.food_url || null,
    defaultPreview: parseDefaultPreview(food.food_description),
  };
}

export async function searchFoods(query, limit = 10) {
  const data = await apiFetch('foods.search', {
    search_expression: query,
    max_results:       limit,
  });
  const raw = data?.foods?.food;
  return asArray(raw).map(normalizeSearchHit).filter(f => f.foodId);
}

export async function fetchFoodById(foodId) {
  const data = await apiFetch('food.get', { food_id: foodId });
  if (!data?.food) return null;
  return normalizeFood(data.food);
}

// Upsert a FatSecret-sourced Food + its servings. The caller passes the
// normalized response from searchFoods/fetchFoodById — never client input —
// so the shared Food row (userId=null) can't be poisoned with attacker-
// controlled nutrition data. Servings are upserted per-row by the unique
// (foodId, fatSecretServingId) key, avoiding the delete+create race that
// would otherwise let two concurrent materializations of the same food
// collide on the unique constraint.
export async function materializeFood(prisma, fsFood) {
  return prisma.$transaction(async (tx) => {
    const food = await tx.food.upsert({
      where: { fatSecretFoodId: fsFood.foodId },
      create: {
        source: 'fatsecret',
        fatSecretFoodId: fsFood.foodId,
        name: fsFood.foodName,
        brandName: fsFood.brandName,
        foodType: fsFood.foodType,
        foodUrl: fsFood.foodUrl,
      },
      update: {
        name: fsFood.foodName,
        brandName: fsFood.brandName,
        foodType: fsFood.foodType,
        foodUrl: fsFood.foodUrl,
      },
    });

    for (const s of fsFood.servings) {
      const data = {
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
      await tx.foodServing.upsert({
        where: { foodId_fatSecretServingId: { foodId: food.id, fatSecretServingId: s.servingId } },
        create: { foodId: food.id, fatSecretServingId: s.servingId, ...data },
        update: data,
      });
    }

    const servings = await tx.foodServing.findMany({ where: { foodId: food.id } });
    return { food, servings };
  });
}
