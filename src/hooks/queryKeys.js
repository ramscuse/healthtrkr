// Centralized query-key factories. One source of truth for cache keys and
// invalidation targets. Conventions:
//   - Domain root is an array prefix (e.g., ['meals']) so `invalidateQueries
//     ({ queryKey: queryKeys.meals.all })` clears every meals subquery.
//   - Within a domain, mutation-targeted reads live under a sub-prefix
//     (e.g., 'diary') so daily writes don't sweep away rate-limited or
//     static caches like FatSecret search or workout templates.
//   - Parameter-bearing keys carry their args as an object so equality is
//     stable regardless of key order (e.g., ['meals', { date }]).

export const queryKeys = {
  account: {
    all: ["account"],
  },
  goals: {
    all: ["goals"],
  },
  health: {
    all: ["health"],
    today: ["health", "today"],
  },
  water: {
    all: ["water"],
    today: ["water", "today"],
    byDate: (date) => ["water", { date }],
  },
  meals: {
    all: ["meals"],
    // Daily diary entries — what meal CRUD invalidates. Kept under its own
    // sub-prefix so add/delete doesn't evict the FatSecret search/detail
    // caches (rate-limited) or the custom-foods/presets library.
    diary: ["meals", "diary"],
    byDate: (date) => ["meals", "diary", { date }],
    customFoods: ["meals", "customFoods"],
    presets: ["meals", "presets"],
    search: (q) => ["meals", "search", q],
    foodDetail: (foodId) => ["meals", "food", foodId],
  },
  workouts: {
    all: ["workouts"],
    // Diary entries — what logWorkout invalidates. Static template lives
    // outside the diary so a workout log doesn't refetch it.
    diary: ["workouts", "diary"],
    byDate: (date) => ["workouts", "diary", { date }],
    history: (limit) => ["workouts", "diary", "history", { limit }],
    template: ["workouts", "template"],
    customExercises: ["workouts", "customExercises"],
    presets: ["workouts", "presets"],
  },
  progress: {
    all: ["progress"],
    summary: (date) => ["progress", "summary", { date }],
    weekly: (startDate) => ["progress", "weekly", { startDate }],
    range: (startDate, numDays) => ["progress", "range", { startDate, numDays }],
  },
  admin: {
    all: ["admin"],
    users: ["admin", "users"],
    user: (id) => ["admin", "users", id],
  },
};
