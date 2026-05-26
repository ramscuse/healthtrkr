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
src/lib/queryClient.js — TanStack Query client singleton + default options
src/hooks/            — TanStack Query hooks, one file per domain (useMeals, useWater, etc.) + queryKeys.js factory
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

### Auth & Session Model
- JWT is carried in an `HttpOnly`, `Secure` (prod-only), `SameSite=Strict` (prod) / `Lax` (dev) cookie named `token`. A companion non-httpOnly `sessionHint` cookie tells the frontend a session exists.
- JWTs carry `{ userId, tokenVersion, iat }` — **no `exp`**. Revocation is server-side: `authMiddleware` reads the current `User.tokenVersion` on every request and 401s on mismatch. Logout, password change, password reset, and admin-set-password all bump `tokenVersion`.
- CSRF is mitigated by `SameSite=Strict` on the token cookie + fixed-origin CORS (`credentials: true`, single allowed origin).

### Frontend API Client
`src/lib/api.js` is the single source for all backend calls. The JWT lives in the httpOnly cookie set by the server, so the client doesn't read or attach it — `credentials: 'include'` carries it. 401s clear the local `sessionHint` and redirect to `/login` (the redirect happens inside `request()`; do not add a duplicate `onError` handler to the React Query client).

### Data Fetching (TanStack Query)
- Pages and components never call `src/lib/api.js` directly for server data. Instead, they import hooks from `src/hooks/use<Domain>.js` (`useMeals`, `useWorkouts`, `useWater`, `useGoals`, `useAccount`, `useHealth`, `useProgress`, `useAdmin`).
- Query keys are produced exclusively by the factories in `src/hooks/queryKeys.js`. Mutations invalidate via those same factories — never hand-write a key.
- Within meals and workouts, daily-write entries live under a `diary` sub-prefix so that `useAddMeal` / `useLogWorkout` invalidations do **not** sweep the rate-limited FatSecret search cache or the static workout template (`staleTime: Infinity`).
- Mutations that affect aggregate progress data (meals, water, workouts, active calories) **must** invalidate `queryKeys.progress.all` so the Progress page recomputes.
- Mutations that mutate `data` instead of full positional args destructure inside `mutationFn` (e.g. `useUpdateActiveCalories` accepts `{ date, calories }`, `useUpdateUser` accepts `{ id, patch }`). Match that convention when adding new mutations.
- Intentional exceptions where direct `src/lib/api.js` calls are kept:
  - `Auth.jsx` (login/register/forgot/reset), `Layout.jsx` and `Account.jsx` (logout), `Account.jsx` (changePassword) — one-shot navigation flows.
  - `Meals.jsx` calls `getFoodDetail` directly inside `pickFoodForLog` — single imperative fetch on click, not a cacheable read.
  - `UserContext.jsx` and `ThemeContext.jsx` — context boundaries that own their own lifecycle.
  - `ProtectedRoute.jsx` reads `isLoggedIn()` (a cookie helper, not server state).
- After logout, components that call `logout()` must also call `queryClient.clear()` before navigating to `/login` so the previous session's cache can't leak into a same-tab re-login.

### Production Static File Serving
In production, Express serves `src/dist/` as static files and catches all non-`/api/*` routes with the SPA fallback. The `build` output directory is `dist/` (relative to the `src/` directory where Vite is run).

### UI & Styling (shadcn/ui + Tailwind v4)
- **Tailwind v4**, CSS-first config. There is **no `tailwind.config.js`** — theme tokens, the
  `@custom-variant dark`, and the v3→v4 border-color compat layer live in `src/index.css`. PostCSS
  uses `@tailwindcss/postcss` (no `autoprefixer`).
- **shadcn/ui** is the component system: `components.json` is configured for **`base-nova` style on
  Base UI** (`@base-ui/react`), `tsx: false` (this is a JSX project), `baseColor: neutral`,
  `cssVariables: true`. Components live in `src/components/ui/`. Add more with
  `npx shadcn@latest add <name>` (it writes JSX + uses the `@/` alias).
- **`@/` alias → `src/`** — defined in both `jsconfig.json` and `vite.config.js` (`resolve.alias`).
  Import primitives as `@/components/ui/button`, helpers as `@/lib/utils` (`cn`).
- **Theme = dark by default, violet primary.** New accounts are created with `darkMode: true`
  (`server/routes/auth.js`); `ThemeContext` defaults to dark and toggles `class="dark"` on `<html>`
  (also set in `src/index.html` to avoid a flash). A user's explicit light choice is respected.
- **Build UI from tokens, not raw palette classes:** `bg-background` / `bg-card`, `text-foreground`
  / `text-muted-foreground`, `border-border`, `text-primary` (the violet brand), `ring-foreground/10`.
  Do **not** introduce `bg-white` / `*-gray-*` / `*-indigo-*` for chrome — use tokens so light/dark
  both work. Migrated pages have zero non-token neutrals; keep it that way.
- **Intentional semantic colors are kept** (not mapped to `primary`) on the data-surfacing pages
  — **`Water.jsx`, `Workouts.jsx`, `Progress.jsx`, and `Dashboard.jsx`**: water is sky, workout
  categories use `CATEGORY_COLORS`, and nutrition status uses red/amber/green + per-metric colors
  (calories indigo, protein violet, etc.). `Dashboard.jsx` is included because it aggregates those
  same domains (calorie/protein goal status, water, workout-logged), so it inherits their semantic
  palette. Everywhere else, chrome must use tokens (no raw `gray`/`white`/`indigo`).
- **Toasts:** Sonner. `import { toast } from 'sonner'`; one `<Toaster />` + `<TooltipProvider>` are
  mounted at the app root in `App.jsx` (inside `ThemeProvider`). Use toasts for mutation success;
  keep validation errors inline.
- **Slide-overs → `Sheet`, modals → `Dialog`, confirms → `AlertDialog`** (e.g. Admin's
  delete-user confirm). Recharts stays as-is, wrapped in a `Card` (Progress).
- **All pages are migrated** to shadcn + the TanStack hooks, including `Admin.jsx` (now uses the
  `useAdmin*` hooks instead of direct `api.js` calls).

## Validation Patterns

All API routes validate inputs using these patterns:
- **Dates**: `/^\d{4}-\d{2}-\d{2}$/` regex + `new Date()` validity check
- **Numeric fields**: `typeof val === 'number' && isFinite(val)`
- **Enum fields**: validated against explicit allowlists (e.g., `mealType` against `['breakfast','lunch','dinner','snack']`)
- **Barcode**: `encodeURIComponent` + `/^\d{8,14}$/` regex

## Environment Variables

Required in `.env`:
- `DATABASE_URL` — PostgreSQL connection string
- `JWT_SECRET` — used for HS256 token signing. Must be ≥ 32 chars in production (boot validation enforces this).
- `FATSECRET_CONSUMER_KEY` — OAuth 1.0a consumer key for FatSecret food search API
- `FATSECRET_CONSUMER_SECRET` — OAuth 1.0a shared secret for FatSecret food search API
- `CORS_ORIGIN` — defaults to `http://localhost:5173` in dev. Required in production (boot fails if unset).
- `PORT` — defaults to `3001`

## Database

- PostgreSQL 15, Prisma ORM
- Schema: `db/schema.prisma`
- All models use CUID for IDs
- `WorkoutSession.exercises` and `CustomExercise.muscles` are stored as `Json` (no separate join table)
- `HealthData` has a `@@unique([userId, date])` constraint
- `AdminAuditLog` records role changes, password resets, and deletes performed by admins (PR `security/audit-remediation`)
