const BASE_URL = import.meta.env.VITE_API_URL ?? ''
const parsedPwaSessionHours = Number(import.meta.env.VITE_PWA_SESSION_HOURS ?? 24)
const PWA_SESSION_HOURS =
  Number.isFinite(parsedPwaSessionHours) && parsedPwaSessionHours > 0
    ? parsedPwaSessionHours
    : 24

function decodeJwtPayload(token) {
  try {
    const segment = token.split('.')[1]
    if (!segment) return null
    const base64 = segment.replace(/-/g, '+').replace(/_/g, '/')
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=')
    return JSON.parse(atob(padded))
  } catch {
    return null
  }
}

export function getToken() {
  const token = localStorage.getItem('token')
  if (!token) return null

  const payload = decodeJwtPayload(token)
  if (!payload || !payload.exp) {
    clearToken()
    return null
  }

  // Hard expiry — token past its own exp claim
  if (Date.now() / 1000 > payload.exp) {
    clearToken()
    return null
  }

  // rememberMe tokens have a 30d lifetime; session tokens have 24h.
  // Infer from the token itself: if lifetime > 25h it was issued as rememberMe.
  // Only apply the PWA session-age check for session tokens.
  const lifetimeSeconds = payload.exp - (payload.iat ?? 0)
  if (lifetimeSeconds <= 25 * 3600) {
    const ageHours = (Date.now() / 1000 - (payload.iat ?? 0)) / 3600
    if (ageHours > PWA_SESSION_HOURS) {
      clearToken()
      return null
    }
  }

  return token
}

export function setToken(token) {
  localStorage.setItem('token', token)
  sessionStorage.removeItem('token')
}

export function clearToken() {
  localStorage.removeItem('token')
  sessionStorage.removeItem('token')
}

// Try to recover a session from the HTTP-only cookie when localStorage is empty.
// iOS can clear localStorage under certain conditions even though the cookie persists.
export async function tryRefreshFromCookie() {
  try {
    const response = await fetch(`${BASE_URL}/api/auth/me`, {
      credentials: 'include',
    })
    if (!response.ok) return null
    const data = await response.json()
    if (!data.token) return null
    setToken(data.token)
    return data.token
  } catch {
    return null
  }
}

async function request(path, options = {}) {
  const token = getToken()

  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers || {})
  }

  const response = await fetch(`${BASE_URL}${path}`, {
    ...options,
    credentials: 'include',
    headers
  })

  if (response.status === 401) {
    clearToken()
    window.location.href = '/login'
    return
  }

  if (!response.ok) {
    let body
    try {
      body = await response.json()
    } catch {
      body = {}
    }
    throw new Error(body.error || `Request failed with status ${response.status}`)
  }

  if (response.status === 204) return null;
  return response.json()
}

export async function login(email, password, rememberMe = false) {
  return request('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password, rememberMe })
  })
}

export async function register(email, password, name) {
  return request('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ email, password, name })
  })
}

export async function forgotPassword(email) {
  return request('/api/auth/forgot-password', {
    method: 'POST',
    body: JSON.stringify({ email })
  })
}

export async function resetPassword(email, code, newPassword) {
  return request('/api/auth/reset-password', {
    method: 'POST',
    body: JSON.stringify({ email, code, newPassword })
  })
}

export async function logout() {
  return request('/api/auth/logout', { method: 'POST' })
}

export async function getGoals() {
  return request('/api/goals')
}

export async function getProgressSummary(date) {
  return request(`/api/progress/summary?date=${date}`)
}

export async function getMeals(date) {
  return request(`/api/meals?date=${date}`)
}

export async function getHealthToday() {
  return request('/api/health/today')
}

export async function getWorkouts(date) {
  return request(`/api/workouts?date=${date}`)
}

export async function searchFood(q) {
  return request(`/api/meals/search?q=${encodeURIComponent(q)}`)
}

export async function addMeal(data) {
  return request('/api/meals', { method: 'POST', body: JSON.stringify(data) })
}

export async function deleteMeal(id) {
  return request(`/api/meals/${id}`, { method: 'DELETE' })
}

export async function getWorkoutTemplate() {
  return request('/api/workouts/template')
}

export async function logWorkout(data) {
  return request('/api/workouts', { method: 'POST', body: JSON.stringify(data) })
}

export async function getWorkoutHistory(limit = 5) {
  return request(`/api/workouts/history?limit=${limit}`)
}

export async function getProgressWeekly(startDate) {
  return request(`/api/progress/weekly?startDate=${startDate}`)
}

export async function changePassword(currentPassword, newPassword) {
  return request('/api/auth/password', {
    method: 'PUT',
    body: JSON.stringify({ currentPassword, newPassword })
  })
}

export async function getCustomFoods() {
  return request('/api/meals/custom-foods')
}

export async function createCustomFood(data) {
  return request('/api/meals/custom-foods', { method: 'POST', body: JSON.stringify(data) })
}

export async function deleteCustomFood(id) {
  return request(`/api/meals/custom-foods/${id}`, { method: 'DELETE' })
}

export async function getPresets() {
  return request('/api/meals/presets')
}

export async function createPreset(data) {
  return request('/api/meals/presets', { method: 'POST', body: JSON.stringify(data) })
}

export async function updatePreset(id, data) {
  return request(`/api/meals/presets/${id}`, { method: 'PUT', body: JSON.stringify(data) })
}

export async function deletePreset(id) {
  return request(`/api/meals/presets/${id}`, { method: 'DELETE' })
}

export async function logPreset(presetId, { date, mealType }) {
  return request(`/api/meals/presets/${presetId}/log`, {
    method: 'POST',
    body: JSON.stringify({ date, mealType }),
  })
}

export async function getCustomExercises() {
  return request('/api/workouts/custom-exercises')
}

export async function createCustomExercise(data) {
  return request('/api/workouts/custom-exercises', { method: 'POST', body: JSON.stringify(data) })
}

export async function deleteCustomExercise(id) {
  return request(`/api/workouts/custom-exercises/${id}`, { method: 'DELETE' })
}

export async function getWorkoutPresets() {
  return request('/api/workouts/presets')
}

export async function createWorkoutPreset(data) {
  return request('/api/workouts/presets', { method: 'POST', body: JSON.stringify(data) })
}

export async function updateWorkoutPreset(id, data) {
  return request(`/api/workouts/presets/${id}`, { method: 'PUT', body: JSON.stringify(data) })
}

export async function deleteWorkoutPreset(id) {
  return request(`/api/workouts/presets/${id}`, { method: 'DELETE' })
}

export async function getWaterToday() {
  return request('/api/water/today')
}

export async function getWaterEntries(date) {
  return request(`/api/water?date=${date}`)
}

export async function logWater(data) {
  return request('/api/water', { method: 'POST', body: JSON.stringify(data) })
}

export async function deleteWaterEntry(id) {
  return request(`/api/water/${id}`, { method: 'DELETE' })
}

export async function getAccount() {
  return request('/api/account')
}

export async function updateAccount(data) {
  return request('/api/account', { method: 'PUT', body: JSON.stringify(data) })
}

export async function updateActiveCalories(date, calories) {
  return request('/api/health/active-calories', {
    method: 'PUT',
    body: JSON.stringify({ date, calories }),
  })
}

export async function updateGoals(data) {
  return request('/api/goals', { method: 'PUT', body: JSON.stringify(data) })
}

export async function getProgressRange(startDate, numDays) {
  return request(`/api/progress/range?startDate=${startDate}&numDays=${numDays}`)
}
