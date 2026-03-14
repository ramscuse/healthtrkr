# FitTrack

A personal web-based fitness tracker with calorie/protein logging, workout tracking, Apple Watch data sync, and weekly progress charts. Built with React, Express, PostgreSQL, and Prisma while leveraging Claude Code.

---

## Prerequisites

- **Node.js 20+** — [nodejs.org](https://nodejs.org)
- **PostgreSQL 15** — running locally
- **WSL2 on Windows** — Ubuntu or Debian recommended

---

## Installation

```bash
# 1. Clone the repo
git clone <your-repo-url>
cd healthtrkr

# 2. Install dependencies
npm install

# 3. Copy and configure environment variables
cp .env.example .env
```

Edit `.env` and set your values:

```env
DATABASE_URL="postgresql://postgres:your-password@localhost:5432/fittrack"
JWT_SECRET="generate-a-long-random-string-here"
PORT=3001
VITE_API_URL=http://localhost:3001
HEALTH_SYNC_TOKEN="generate-another-long-random-string-here"
CORS_ORIGIN=http://localhost:5173

# Optional — needed only if you want to re-seed the food database from USDA
USDA_API_KEY=your-usda-api-key

# Optional — needed only for password reset emails via EmailJS
EMAILJS_SERVICE_ID=your-service-id
EMAILJS_TEMPLATE_ID=your-template-id
EMAILJS_PUBLIC_KEY=your-public-key
EMAILJS_PRIVATE_KEY=your-private-key
```

> **Generating secrets:** use `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` to generate strong random values for `JWT_SECRET` and `HEALTH_SYNC_TOKEN`.

```bash
# 4. Create the database (if it doesn't exist)
psql "postgresql://postgres:your-password@localhost:5432/postgres" -c "CREATE DATABASE fittrack;"

# 5. Run migrations
npm run db:migrate

# 6. (Optional) Seed the food search database (~6,000 common foods)
npm run db:seed-foods

# 7. (Optional) Seed a test user and default goals
npm run db:seed
```

---

## Running in Development

```bash
# Terminal 1 — Backend API (port 3001)
npm run dev:server

# Terminal 2 — Frontend Vite dev server (port 5173)
npm run dev:client
```

Or run both together:

```bash
npm run dev
```

Open your browser at **`http://localhost:5173`** (or your WSL2 IP if accessing from Windows — see note below).

> **WSL2 note:** If `localhost:5173` doesn't work in your Windows browser, find your WSL IP with `hostname -I` and use that instead (e.g. `http://172.23.1.198:5173`).

---

## First-Time Setup

1. Open the app and click **Register** to create your account
2. After logging in, go to the Dashboard
3. Your calorie and protein goals default to 2400–2600 kcal and 176–200g protein
4. Update your goals on the Account page, or via the API:
   ```bash
   curl -X PUT http://localhost:3001/api/goals \
     -H "Authorization: Bearer YOUR_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"calorieMin":2200,"calorieMax":2500,"proteinMin":160,"proteinMax":190,"startWeight":185}'
   ```

---

## Finding Your User ID

Your user ID is returned at login and is needed for the Apple Watch sync setup.

```bash
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"you@example.com","password":"yourpassword"}'
```

The response includes `user.id` — copy that value.

---

## Apple Watch Integration (Health Auto Export)

FitTrack ingests Apple Watch data using the **Health Auto Export** iOS app (~$4 one-time, App Store).

### Setup

1. Install **Health Auto Export** on your iPhone
2. Open the app → tap **+** → choose **REST API**
3. Set the **Endpoint URL** to:
   ```
   http://YOUR-WSL-IP:3001/api/health/sync
   ```
   Replace `YOUR-WSL-IP` with the output of `hostname -I` (e.g. `172.23.1.198`).
   For remote access, use your public domain/IP.

4. Add these **Custom Headers**:
   | Header | Value |
   |---|---|
   | `x-sync-token` | The value of `HEALTH_SYNC_TOKEN` from your `.env` |
   | `x-user-id` | Your FitTrack user ID (see above) |

5. Select these **Metrics** to export:
   - Active Energy
   - Basal Energy Burned
   - Step Count
   - Heart Rate

6. Set **Export Frequency** to: `Automatic (when data changes)`

7. Tap **Export** once to test — you should see active calories appear on the Dashboard.

### Verifying Sync

```bash
curl http://localhost:3001/api/health/today \
  -H "Authorization: Bearer YOUR_TOKEN"
```

Should return today's active calories, steps, and resting calories if a sync has occurred.

---

## Adding a Second User

Just register a new account at `/login` (Register tab). Each user has fully isolated data.

---

## Available Scripts

| Script | Description |
|---|---|
| `npm run dev` | Start backend + frontend together |
| `npm run dev:server` | Backend only (nodemon, port 3001) |
| `npm run dev:client` | Frontend only (Vite, port 5173) |
| `npm run build` | Production frontend build |
| `npm start` | Production server (serves built frontend) |
| `npm run db:migrate` | Run Prisma migrations |
| `npm run db:seed` | Seed test user and default goals |
| `npm run db:seed-foods` | Seed local food search database (USDA) |
| `npm run db:seed-off-foods` | Seed additional foods from Open Food Facts |
| `npm run db:reset-password` | CLI utility to reset a user's password directly |
| `npm run db:studio` | Open Prisma Studio (DB browser) |

---

## Production Build

```bash
npm run build
NODE_ENV=production npm start
```

The Express server will serve the built React app from `src/dist` and expose the API on port 3001.
