# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

```bash
# Start both servers concurrently
npm run dev

# Start individually
npm run dev:server    # Express on :3001 (nodemon, auto-restarts)
npm run dev:client    # Vite on :5173 (proxies /api → :3001)

# Production
npm run build         # Vite build → src/dist/
npm start             # NODE_ENV=production node server/index.js

# Database
npm run db:migrate    # prisma migrate dev
npm run db:seed       # seed initial data
npm run db:seed-foods # seed food database
npm run db:studio     # Prisma Studio GUI
```

No test suite exists in this project.

## Change Workflow

All non-trivial changes follow this workflow:

1. **Branch** — create a feature branch before making any edits:
   ```bash
   git checkout -b <type>/<short-description>
   # e.g. fix/mobile-scroll, feat/water-reminders
   ```

2. **Implement** — make all changes on the branch.

3. **Code review** — spawn a `code-reviewer` agent against the branch diff. The agent must check:
   - No secrets or hardcoded values introduced
   - No regressions to existing desktop/mobile layout
   - Auth and security logic unchanged or correctly updated
   - No `console.log` debug statements left in
   - Changes are consistent with codebase style

4. **Address feedback** — fix every issue flagged as required by the review before proceeding.

5. **Push & open PR**:
   ```bash
   git push -u origin <branch>
   gh pr create --title "..." --body "..."
   ```

Do not commit directly to `main`. Do not push until the code review step is complete and all required feedback is addressed.

## Architecture Overview

**Full-stack monorepo**: Express backend + React/Vite frontend in one repo.

```
server/index.js       — Express bootstrap and route mounting
server/middleware/     — auth.js (JWT verify), errorHandler.js
api/                  — one file per domain (auth, meals, workouts, health, goals, progress, water, account)
lib/prisma.js         — shared singleton PrismaClient (all routes import from here)
db/schema.prisma      — Prisma schema (schema path set in package.json → "prisma.schema")
src/                  — React frontend (Vite root)
src/lib/api.js        — all fetch calls to backend (single request() wrapper)
src/context/          — ThemeContext (dark mode, persisted to DB via /api/account)
src/pages/            — Dashboard, Meals, Workouts, Progress, Water, Account, Auth
src/components/       — Layout (nav shell), ProtectedRoute, StatCard
```

**Module system**: `"type": "module"` — all files use ESM (`import`/`export`), no `require()`.

## Key Architectural Decisions

### Route Mounting Order in server/index.js
`/api/workouts/template` is mounted **before** the auth middleware and the main workouts router — it's intentionally public (no JWT required). The handler is exported as `workoutsTemplateHandler` from `api/workouts.js` and mounted explicitly:
```js
app.get('/api/workouts/template', workoutsTemplateHandler);  // public
app.use('/api/workouts', authMiddleware, workoutsRouter);    // protected
```

### Health Sync Auth
`/api/health/sync` uses a **shared sync token** (`x-sync-token` header + `x-user-id` header) instead of JWT — designed for Apple Watch / Health Auto Export automation. Token comparison uses `crypto.timingSafeEqual`. The routes `/api/health/today` and `/api/health/week` apply `authMiddleware` inline (not at mount time).

### Frontend API Client
`src/lib/api.js` is the single source for all backend calls. It auto-attaches the JWT from `localStorage`/`sessionStorage`, handles 401 by clearing the token and redirecting to `/login`, and throws errors with the backend's `error` field.

**Token storage**: "Remember me" → `localStorage`; session only → `sessionStorage`. Both are checked on each request.

### Production Static File Serving
In production, Express serves `src/dist/` as static files and catches all non-`/api/*` routes with the SPA fallback. The `build` output directory is `dist/` (relative to the `src/` directory where Vite is run).

## Validation Patterns

All API routes validate inputs using these patterns:
- **Dates**: `/^\d{4}-\d{2}-\d{2}$/` regex + `new Date()` validity check
- **Numeric fields**: `typeof val === 'number' && isFinite(val)`
- **Enum fields**: validated against explicit allowlists (e.g., `mealType` against `['breakfast','lunch','dinner','snack']`)
- **Barcode**: `encodeURIComponent` + `/^\d{8,14}$/` regex

## Environment Variables

Required in `.env`:
- `DATABASE_URL` — PostgreSQL connection string
- `JWT_SECRET` — used for HS256 token signing (7d expiry)
- `HEALTH_SYNC_TOKEN` — shared token for Apple Health sync endpoint
- `CORS_ORIGIN` — defaults to `http://localhost:5173`
- `PORT` — defaults to `3001`

## Database

- PostgreSQL 15, Prisma ORM
- Schema: `db/schema.prisma`
- All models use CUID for IDs
- `WorkoutSession.exercises` and `CustomExercise.muscles` are stored as `Json` (no separate join table)
- `HealthData` has a `@@unique([userId, date])` constraint — sync uses `upsert`
