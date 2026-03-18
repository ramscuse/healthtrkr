import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_FILE = join(__dirname, '..', 'data', 'foods.json');

let foods = [];

// Load once at startup
if (existsSync(DATA_FILE)) {
  foods = JSON.parse(readFileSync(DATA_FILE, 'utf8'));
  console.log(`Food database loaded: ${foods.length} items`);
} else {
  console.warn('data/foods.json not found — run: node db/seed-foods.js');
}

/**
 * Score a food name against a query.
 * Higher = more relevant. Returns 0 if no match.
 */
function score(foodName, queryWords) {
  const name = foodName.toLowerCase();
  let total = 0;
  for (const word of queryWords) {
    if (name.startsWith(word))       { total += 4; continue; }
    if (name.includes(`, ${word}`))  { total += 3; continue; }
    if (name.includes(` ${word}`))   { total += 2; continue; }
    if (name.includes(word))         { total += 1; continue; }
    // If any query word has zero match, penalise heavily
    total -= 10;
  }
  // Prefer USDA-style "Category, descriptor, preparation" names over generic product names.
  // USDA entries use comma-separated format and tend to be more nutritionally accurate.
  if (foodName.includes(',')) total += 1;
  return total;
}

export function searchFoods(query, limit = 10) {
  if (!query || foods.length === 0) return [];

  const queryWords = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  if (queryWords.length === 0) return [];

  return foods
    .map(food => ({ food, s: score(food.name, queryWords) }))
    .filter(({ s }) => s > 0)
    .sort((a, b) => b.s - a.s)
    .slice(0, limit)
    .map(({ food }) => food);
}
