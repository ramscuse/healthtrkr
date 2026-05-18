import crypto from 'crypto';

const API_URL = 'https://platform.fatsecret.com/rest/server.api';
const FETCH_TIMEOUT_MS = 10_000;

class FatSecretError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'FatSecretError';
    this.code = code;
  }
}

// Stricter percent-encoding than encodeURIComponent — RFC 3986 also encodes !'()*
function pctEncode(s) {
  return encodeURIComponent(String(s)).replace(
    /[!'()*]/g,
    c => '%' + c.charCodeAt(0).toString(16).toUpperCase()
  );
}

// OAuth 1.0a signature for 2-legged (server-only) requests. Token secret is
// empty since we never exchange for a user token.
function signRequest(httpMethod, url, params, consumerSecret) {
  const paramString = Object.keys(params)
    .sort()
    .map(k => `${pctEncode(k)}=${pctEncode(params[k])}`)
    .join('&');
  const baseString = `${httpMethod.toUpperCase()}&${pctEncode(url)}&${pctEncode(paramString)}`;
  const signingKey = `${pctEncode(consumerSecret)}&`;
  return crypto.createHmac('sha1', signingKey).update(baseString).digest('base64');
}

// We sign with OAuth 1.0a because FatSecret's OAuth 2.0 endpoint requires
// server IP whitelisting, which is incompatible with Vercel's dynamic egress
// IPs. FatSecret issues separate credentials for 1.0 (consumer key + shared
// secret) and 2.0 (client id + client secret) — these env vars hold the 1.0 set.
async function apiFetch(method, params) {
  const { FATSECRET_CONSUMER_KEY: key, FATSECRET_CONSUMER_SECRET: secret } = process.env;
  if (!key || !secret) throw new Error('FATSECRET_CONSUMER_KEY / FATSECRET_CONSUMER_SECRET not set');

  const allParams = {
    method,
    format: 'json',
    ...params,
    oauth_consumer_key: key,
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_nonce: crypto.randomBytes(16).toString('hex'),
    oauth_version: '1.0',
  };
  for (const k of Object.keys(allParams)) allParams[k] = String(allParams[k]);

  allParams.oauth_signature = signRequest('POST', API_URL, allParams, secret);

  const body = Object.entries(allParams)
    .map(([k, v]) => `${pctEncode(k)}=${pctEncode(v)}`)
    .join('&');

  const res = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
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
