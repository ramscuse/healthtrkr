/**
 * Streams the Open Food Facts JSONL export, filters for US products with
 * complete nutrition data, and merges them into data/foods.json alongside
 * the existing USDA data.
 *
 * Run once: node db/seed-off-foods.js [limit]
 *   limit — optional number of new foods to collect (default: 30 000)
 *   e.g.: npm run db:seed-off-foods -- 60000
 *
 * Streams line-by-line through the gzip-compressed JSONL, stops as soon as
 * MAX_NEW new foods have been collected — no need to download the full file.
 */
import { createGunzip } from 'zlib';
import { createInterface } from 'readline';
import { spawn } from 'child_process';
import { writeFileSync, readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FOODS_FILE = join(__dirname, '..', 'data', 'foods.json');

// Direct S3 URL — avoids a redirect hop that can be unreliable
const JSONL_URL = 'https://openfoodfacts-ds.s3.eu-west-3.amazonaws.com/openfoodfacts-products.jsonl.gz';
const USER_AGENT = 'healthtrkr/1.0 (personal fitness tracker; non-commercial)';

// Allow caller to override the limit: `npm run db:seed-off-foods -- 60000`
const MAX_NEW = (() => {
  const arg = process.argv[2];
  const n = arg ? parseInt(arg, 10) : NaN;
  if (!isNaN(n) && n > 0) return n;
  return 30_000; // default
})();


// --- Load existing foods ---
let existing = [];
if (existsSync(FOODS_FILE)) {
  existing = JSON.parse(readFileSync(FOODS_FILE, 'utf8'));
  console.log(`Loaded ${existing.length.toLocaleString()} existing foods from data/foods.json`);
} else {
  console.warn('data/foods.json not found — run node db/seed-foods.js first');
}

const seen = new Set(existing.map(f => f.name.toLowerCase()));
const added = [];

console.log(`Streaming Open Food Facts JSONL (targeting ${MAX_NEW.toLocaleString()} new US foods)...`);
console.log('(Download will stop once target is reached)\n');

// Use curl for the download — reliable on WSL2 where Node.js DNS can be flaky
const curl = spawn('curl', [
  '--location',        // follow redirects
  '--silent',
  '--show-error',
  '--user-agent', USER_AGENT,
  JSONL_URL,
], { stdio: ['ignore', 'pipe', 'inherit'] });

await new Promise((resolve, reject) => {
  const gunzip = createGunzip();
  const rl = createInterface({ input: curl.stdout.pipe(gunzip), crlfDelay: Infinity });
  let linesRead = 0;
  let bytesIn = 0;

  curl.stdout.on('data', chunk => { bytesIn += chunk.length; });

  rl.on('line', (line) => {
    linesRead++;
    if (!line.trim()) return;

    let p;
    try { p = JSON.parse(line); } catch { return; }

    // Must be a US product
    if (!p.countries_tags?.includes('en:united-states')) return;

    const name = (p.product_name_en || p.product_name || '').trim();
    if (!name) return;

    const cal = p.nutriments?.['energy-kcal_100g'] ?? 0;
    if (!(cal > 0)) return;

    const protein = Math.round((p.nutriments?.proteins_100g      ?? 0) * 10) / 10;
    const carbs   = Math.round((p.nutriments?.carbohydrates_100g ?? 0) * 10) / 10;
    const fat     = Math.round((p.nutriments?.fat_100g           ?? 0) * 10) / 10;

    // Reject physically impossible entries: macros can't exceed 100g per 100g of food,
    // and calories can't exceed ~900 kcal/100g (theoretical max for pure fat/oil).
    if (protein + carbs + fat > 100 || cal > 900) return;

    const key = name.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);

    added.push({ name, calories: Math.round(cal), protein, carbs, fat });

    if (added.length % 1000 === 0) {
      const mb = (bytesIn / 1024 / 1024).toFixed(0);
      process.stdout.write(
        `\r  ${added.length.toLocaleString()} / ${MAX_NEW.toLocaleString()} new foods  |  ${linesRead.toLocaleString()} lines read  |  ${mb} MB downloaded`
      );
    }

    if (added.length >= MAX_NEW) {
      rl.close();
      curl.kill(); // stop downloading once we have enough
    }
  });

  rl.on('close', resolve);
  rl.on('error', reject);
  // When we kill curl early the gunzip stream gets an abrupt EOF — that's expected
  gunzip.on('error', (err) => {
    if (added.length >= MAX_NEW || err.code === 'Z_BUF_ERROR') resolve();
    else reject(err);
  });
  curl.on('error', reject);
});

console.log(`\n\n  Done. Added ${added.length.toLocaleString()} new foods from Open Food Facts.`);

if (added.length === 0) {
  console.log('Nothing new to save.');
  process.exit(0);
}

// Merge, sort alphabetically, save
const merged = [...existing, ...added].sort((a, b) => a.name.localeCompare(b.name));
writeFileSync(FOODS_FILE, JSON.stringify(merged));

const sizeMB = (Buffer.byteLength(JSON.stringify(merged)) / 1024 / 1024).toFixed(1);
console.log(`Saved ${merged.length.toLocaleString()} total foods to data/foods.json (${sizeMB} MB)`);
