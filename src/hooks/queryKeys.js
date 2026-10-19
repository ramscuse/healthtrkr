// The only source of query keys. Prefix arrays double as invalidation targets.
// Daily writes live under a `diary` sub-prefix so invalidating them doesn't
// evict the rate-limited FatSecret search cache or the foods/presets library.
export const queryKeys = {
  account: { all: ["account"] },
  goals: { all: ["goals"] },
  water: {
    all: ["water"],
    today: ["water", "today"],
    byDate: (date) => ["water", { date }],
  },
  meals: {
    diary: ["meals", "diary"],
    byDate: (date) => ["meals", "diary", { date }],
    customFoods: ["meals", "customFoods"],
    presets: ["meals", "presets"],
    favoritesAll: ["meals", "favorites"],
    favorites: (mealType) => ["meals", "favorites", { mealType }],
    recentAll: ["meals", "recent"],
    recent: (mealType) => ["meals", "recent", { mealType }],
    search: (q) => ["meals", "search", q],
  },
  workouts: {
    diary: ["workouts", "diary"],
    history: (limit) => ["workouts", "diary", "history", { limit }],
    customExercises: ["workouts", "customExercises"],
    presets: ["workouts", "presets"],
  },
  progress: {
    all: ["progress"],
    summary: (date) => ["progress", "summary", { date }],
    weekly: (startDate) => ["progress", "weekly", { startDate }],
    range: (startDate, numDays) => ["progress", "range", { startDate, numDays }],
  },
  admin: { users: ["admin", "users"] },
};
