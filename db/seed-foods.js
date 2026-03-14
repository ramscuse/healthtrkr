/**
 * Downloads USDA FoodData Central (SR Legacy + Foundation) into data/foods.json
 * Run once: node db/seed-foods.js
 * Requires USDA_API_KEY in .env
 */
import 'dotenv/config';
import { writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_FILE = join(__dirname, '..', 'data', 'foods.json');
const API_KEY = process.env.USDA_API_KEY || 'DEMO_KEY';
const BASE = 'https://api.nal.usda.gov/fdc/v1';

// Nutrient numbers used by the /foods/list endpoint (legacy nutrient numbers)
const NID = { calories: '208', protein: '203', carbs: '205', fat: '204' };

function getNutrient(nutrients, number) {
  return nutrients.find(n => n.number === number)?.amount ?? 0;
}

async function fetchPage(dataType, pageNumber, pageSize = 200) {
  const params = new URLSearchParams({
    api_key: API_KEY,
    dataType,
    pageSize: String(pageSize),
    pageNumber: String(pageNumber),
  });
  const res = await fetch(`${BASE}/foods/list?${params}`);
  if (!res.ok) throw new Error(`USDA API error ${res.status}: ${await res.text()}`);
  return res.json(); // returns an array of food objects
}

async function fetchAllForType(dataType) {
  const foods = [];
  let page = 1;
  process.stdout.write(`  ${dataType}: `);

  while (true) {
    const batch = await fetchPage(dataType, page);
    if (!batch || batch.length === 0) break;

    for (const food of batch) {
      const cal = getNutrient(food.foodNutrients || [], NID.calories);
      if (!food.description || !(cal > 0)) continue;

      foods.push({
        name: food.description.trim(),
        calories: Math.round(cal),
        protein: Math.round(getNutrient(food.foodNutrients, NID.protein) * 10) / 10,
        carbs:   Math.round(getNutrient(food.foodNutrients, NID.carbs)   * 10) / 10,
        fat:     Math.round(getNutrient(food.foodNutrients, NID.fat)     * 10) / 10,
      });
    }

    process.stdout.write(`${page}…`);
    if (batch.length < 200) break;
    page++;

    // Small delay to be polite to the API
    await new Promise(r => setTimeout(r, 150));
  }

  console.log(` ${foods.length} foods`);
  return foods;
}

console.log('Downloading USDA FoodData Central...');

const [srLegacy, foundation, survey] = await Promise.all([
  fetchAllForType('SR Legacy'),
  fetchAllForType('Foundation'),
  fetchAllForType('Survey (FNDDS)'),
]);

// Merge and deduplicate by lowercased name
const seen = new Set();
const all = [];
for (const food of [...foundation, ...srLegacy, ...survey]) {
  const key = food.name.toLowerCase();
  if (!seen.has(key)) {
    seen.add(key);
    all.push(food);
  }
}

// Sort alphabetically for deterministic output
all.sort((a, b) => a.name.localeCompare(b.name));

writeFileSync(OUT_FILE, JSON.stringify(all));
console.log(`\nSaved ${all.length} foods to data/foods.json (${(JSON.stringify(all).length / 1024).toFixed(0)} KB)`);
