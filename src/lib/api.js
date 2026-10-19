const BASE_URL = import.meta.env.VITE_API_URL ?? "";

// The JWT is in an httpOnly cookie; the server-set sessionHint cookie is the
// only session signal JS can see.
export function isLoggedIn() {
  return document.cookie.split(";").some((c) => c.trim().startsWith("sessionHint="));
}

async function request(path, method, body) {
  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body), // undefined stays undefined (no body)
  });

  if (response.status === 401) {
    document.cookie = "sessionHint=; Max-Age=0; path=/";
    window.location.href = "/login";
    return;
  }

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || `Request failed with status ${response.status}`);
  }

  if (response.status === 204) return null;
  return response.json();
}

// Auth
export const login = (email, password, rememberMe = false) =>
  request("/api/auth/login", "POST", { email, password, rememberMe });
export const register = (email, password, name) =>
  request("/api/auth/register", "POST", { email, password, name });
export const forgotPassword = (email) => request("/api/auth/forgot-password", "POST", { email });
export const resetPassword = (email, code, newPassword) =>
  request("/api/auth/reset-password", "POST", { email, code, newPassword });
export const logout = () => request("/api/auth/logout", "POST");
export const changePassword = (currentPassword, newPassword) =>
  request("/api/auth/password", "PUT", { currentPassword, newPassword });

// Account & goals
export const getAccount = () => request("/api/account");
export const updateAccount = (data) => request("/api/account", "PUT", data);
export const getGoals = () => request("/api/goals");
export const updateGoals = (data) => request("/api/goals", "PUT", data);

// Health
export const updateActiveCalories = (date, calories) =>
  request("/api/health/active-calories", "PUT", { date, calories });

// Progress
export const getProgressSummary = (date) => request(`/api/progress/summary?date=${date}`);
export const getProgressWeekly = (startDate) =>
  request(`/api/progress/weekly?startDate=${startDate}`);
export const getProgressRange = (startDate, numDays) =>
  request(`/api/progress/range?startDate=${startDate}&numDays=${numDays}`);

// Meals
export const getMeals = (date) => request(`/api/meals?date=${date}`);
export const addMeal = (data) => request("/api/meals", "POST", data);
export const deleteMeal = (id) => request(`/api/meals/${id}`, "DELETE");
export const searchFood = (q) => request(`/api/meals/search?q=${encodeURIComponent(q)}`);
export const getFoodDetail = (foodId) => request(`/api/meals/foods/${encodeURIComponent(foodId)}`);
export const getCustomFoods = () => request("/api/meals/custom-foods");
export const createCustomFood = (data) => request("/api/meals/custom-foods", "POST", data);
export const updateCustomFood = (id, data) => request(`/api/meals/custom-foods/${id}`, "PUT", data);
export const deleteCustomFood = (id) => request(`/api/meals/custom-foods/${id}`, "DELETE");
export const getPresets = () => request("/api/meals/presets");
export const createPreset = (data) => request("/api/meals/presets", "POST", data);
export const updatePreset = (id, data) => request(`/api/meals/presets/${id}`, "PUT", data);
export const deletePreset = (id) => request(`/api/meals/presets/${id}`, "DELETE");
export const logPreset = (presetId, { date, mealType }) =>
  request(`/api/meals/presets/${presetId}/log`, "POST", { date, mealType });
export const getRecentFoods = (mealType) =>
  request(`/api/meals/recent?mealType=${encodeURIComponent(mealType)}`);
export const getFavoriteFoods = (mealType) =>
  request(`/api/meals/favorites?mealType=${encodeURIComponent(mealType)}`);
export const addFavoriteFood = (body) => request("/api/meals/favorites", "POST", body);
export const removeFavoriteFood = (foodId, mealType) =>
  request(`/api/meals/favorites/${foodId}?mealType=${encodeURIComponent(mealType)}`, "DELETE");

// Workouts
export const logWorkout = (data) => request("/api/workouts", "POST", data);
export const getWorkoutHistory = (limit) => request(`/api/workouts/history?limit=${limit}`);
export const getCustomExercises = () => request("/api/workouts/custom-exercises");
export const createCustomExercise = (data) =>
  request("/api/workouts/custom-exercises", "POST", data);
export const deleteCustomExercise = (id) =>
  request(`/api/workouts/custom-exercises/${id}`, "DELETE");
export const getWorkoutPresets = () => request("/api/workouts/presets");
export const createWorkoutPreset = (data) => request("/api/workouts/presets", "POST", data);
export const updateWorkoutPreset = (id, data) =>
  request(`/api/workouts/presets/${id}`, "PUT", data);
export const deleteWorkoutPreset = (id) => request(`/api/workouts/presets/${id}`, "DELETE");

// Water
export const getWaterToday = () => request("/api/water/today");
export const getWaterEntries = (date) => request(`/api/water?date=${date}`);
export const logWater = (data) => request("/api/water", "POST", data);
export const deleteWaterEntry = (id) => request(`/api/water/${id}`, "DELETE");

// Admin
export const getUsers = () => request("/api/admin/users");
export const updateUser = (id, patch) => request(`/api/admin/users/${id}`, "PUT", patch);
export const resetUserPassword = (id, newPassword) =>
  request(`/api/admin/users/${id}/password`, "PUT", { newPassword });
export const deleteUser = (id) => request(`/api/admin/users/${id}`, "DELETE");
