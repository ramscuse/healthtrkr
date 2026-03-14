import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { getProgressSummary, getWaterToday, getGoals, logWater, updateActiveCalories } from '../lib/api.js'
import StatCard from '../components/StatCard.jsx'

function getTodayString() {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function formatDate(dateStr) {
  const [year, month, day] = dateStr.split('-')
  const d = new Date(Number(year), Number(month) - 1, Number(day))
  return d.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
}

function getCalorieColor(consumed, min, max) {
  if (consumed > max) return 'text-red-600'
  if (consumed < min) return 'text-yellow-500'
  return 'text-green-600'
}

export default function Dashboard() {
  const navigate = useNavigate()
  const today = getTodayString()
  const [summary, setSummary] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [water, setWater]             = useState({ total: 0 })
  const [waterAdding, setWaterAdding] = useState(false)
  const [goals, setGoals]             = useState({})

  const [activeCalEditing, setActiveCalEditing] = useState(false)
  const [activeCalInput, setActiveCalInput]     = useState('')
  const [activeCalSaving, setActiveCalSaving]   = useState(false)
  const [activeCalError, setActiveCalError]     = useState('')

  useEffect(() => {
    async function load() {
      try {
        const [data, waterData, goalsData] = await Promise.all([
          getProgressSummary(today),
          getWaterToday(),
          getGoals(),
        ])
        setSummary(data)
        setWater(waterData || { total: 0 })
        setGoals(goalsData || {})
      } catch (err) {
        setError(err.message || 'Failed to load dashboard data.')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [today])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-400 dark:text-gray-500 text-sm animate-pulse">Loading dashboard...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 rounded-xl p-6 text-sm">
        {error}
      </div>
    )
  }

  const { consumed = {}, burned = {}, net = 0, deficit = 0, workoutLogged = false } = summary || {}

  const calorieColor = getCalorieColor(consumed.calories || 0, goals.calorieMin || 0, goals.calorieMax || 0)
  const proteinColor = getCalorieColor(consumed.protein || 0, goals.proteinMin || 0, goals.proteinMax || 0)

  const activeCaloriesDisplay = burned.active && burned.active > 0
    ? Math.round(burned.active).toString()
    : '—'

  const mealTypes = ['breakfast', 'lunch', 'dinner', 'snack']

  async function handleSaveActiveCal() {
    const n = parseFloat(activeCalInput)
    if (!n || n < 0) { setActiveCalError('Enter a valid number.'); return }
    setActiveCalSaving(true); setActiveCalError('')
    try {
      await updateActiveCalories(today, n)
      setSummary(prev => ({
        ...prev,
        burned: { ...prev.burned, active: n, total: n + (prev.burned?.resting ?? 0) },
        net: (prev.consumed?.calories ?? 0) - n,
        deficit: (goals.calorieMax ?? 0) - ((prev.consumed?.calories ?? 0) - n),
      }))
      setActiveCalEditing(false)
    } catch (err) {
      setActiveCalError(err.message || 'Failed to save.')
    } finally {
      setActiveCalSaving(false)
    }
  }

  async function handleQuickWater(oz) {
    setWaterAdding(true)
    try {
      await logWater({ date: today, amount: oz })
      setWater(prev => ({ ...prev, total: (prev.total || 0) + oz }))
    } catch { /* swallow */ }
    finally { setWaterAdding(false) }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-baseline justify-between">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Dashboard</h1>
        <span className="text-sm text-gray-500 dark:text-gray-400">{formatDate(today)}</span>
      </div>

      {/* 3 Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Calories */}
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-sm p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-1">Calories</p>
          <p className={`text-3xl font-bold ${calorieColor}`}>{Math.round(consumed.calories || 0)}</p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            Goal: {goals.calorieMin ?? '—'}–{goals.calorieMax ?? '—'} kcal
          </p>
          {goals.calorieMax > 0 && (
            <div className="mt-2">
              <div className="w-full bg-gray-100 dark:bg-gray-700 rounded-full h-1.5">
                <div className={`h-1.5 rounded-full transition-all ${consumed.calories > goals.calorieMax ? 'bg-red-500' : consumed.calories >= goals.calorieMin ? 'bg-green-500' : 'bg-yellow-400'}`}
                  style={{ width: `${Math.min(100, ((consumed.calories || 0) / goals.calorieMax) * 100)}%` }} />
              </div>
            </div>
          )}
        </div>

        {/* Protein */}
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-sm p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-1">Protein</p>
          <p className={`text-3xl font-bold ${proteinColor}`}>{Math.round(consumed.protein || 0)}<span className="text-base font-normal text-gray-400 dark:text-gray-500 ml-1">g</span></p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            Goal: {goals.proteinMin ?? '—'}–{goals.proteinMax ?? '—'} g
          </p>
          {goals.proteinMax > 0 && (
            <div className="mt-2">
              <div className="w-full bg-gray-100 dark:bg-gray-700 rounded-full h-1.5">
                <div className={`h-1.5 rounded-full transition-all ${consumed.protein > goals.proteinMax ? 'bg-red-500' : consumed.protein >= goals.proteinMin ? 'bg-green-500' : 'bg-yellow-400'}`}
                  style={{ width: `${Math.min(100, ((consumed.protein || 0) / goals.proteinMax) * 100)}%` }} />
              </div>
            </div>
          )}
        </div>

        {/* Active Burned */}
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-sm p-5">
          <div className="flex items-center justify-between mb-1">
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">Active Burned</p>
            {!activeCalEditing && (
              <button
                type="button"
                onClick={() => { setActiveCalInput(burned.active > 0 ? String(Math.round(burned.active)) : ''); setActiveCalEditing(true); setActiveCalError('') }}
                className="text-xs font-semibold text-indigo-500 dark:text-indigo-400 hover:text-indigo-700 transition-colors"
              >
                {burned.active > 0 ? 'Edit' : 'Log'}
              </button>
            )}
          </div>
          {activeCalEditing ? (
            <div className="space-y-2 mt-1">
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="0"
                  value={activeCalInput}
                  onChange={e => { setActiveCalInput(e.target.value); setActiveCalError('') }}
                  onKeyDown={e => e.key === 'Enter' && handleSaveActiveCal()}
                  placeholder="kcal"
                  autoFocus
                  className="w-24 border border-gray-200 dark:border-gray-600 rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                />
                <span className="text-xs text-gray-500 dark:text-gray-400">kcal</span>
                <button type="button" onClick={handleSaveActiveCal} disabled={activeCalSaving}
                  className="text-xs font-semibold text-white bg-indigo-500 hover:bg-indigo-600 disabled:opacity-50 rounded-lg px-2 py-1 transition-colors">
                  {activeCalSaving ? '…' : 'Save'}
                </button>
                <button type="button" onClick={() => { setActiveCalEditing(false); setActiveCalError('') }}
                  className="text-xs text-gray-400 hover:text-gray-600 transition-colors">✕</button>
              </div>
              {activeCalError && <p className="text-xs text-red-500">{activeCalError}</p>}
            </div>
          ) : (
            <>
              <p className="text-3xl font-bold text-indigo-600 dark:text-indigo-400">{activeCaloriesDisplay}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                {burned.active > 0 ? 'kcal active burned today' : 'Tap Log to add manually'}
              </p>
            </>
          )}
        </div>
      </div>

      {/* Calorie Balance Card */}
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-6 shadow-sm">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-4">Calorie Balance</h2>
        <div className="grid grid-cols-3 gap-3 sm:gap-6 text-center">
          <div>
            <p className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white">{Math.round(net)}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Net calories</p>
          </div>
          <div>
            <p className="text-2xl sm:text-3xl font-bold text-indigo-600 dark:text-indigo-400">{Math.abs(Math.round(deficit))}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{deficit >= 0 ? 'Deficit' : 'Surplus'}</p>
          </div>
          <div>
            <p className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white">{Math.round(burned.total || 0)}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Total burned</p>
          </div>
        </div>
      </div>

      {/* Workout Card */}
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-6 shadow-sm flex items-center gap-4">
        <div className={`flex-shrink-0 w-12 h-12 rounded-full flex items-center justify-center text-xl font-bold ${
          workoutLogged ? 'bg-green-100 dark:bg-green-900/20 text-green-600 dark:text-green-400' : 'bg-gray-100 dark:bg-gray-700 text-gray-400 dark:text-gray-500'
        }`}>
          {workoutLogged ? '✓' : '✗'}
        </div>
        <div>
          <h2 className="text-sm font-semibold text-gray-900 dark:text-white">
            {workoutLogged ? 'Workout logged today' : 'No workout logged yet'}
          </h2>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            {workoutLogged ? 'Great work keeping up with your training.' : 'Head to Workouts to log a session.'}
          </p>
        </div>
        {!workoutLogged && (
          <button
            onClick={() => navigate('/workouts')}
            className="ml-auto text-xs font-semibold text-indigo-600 hover:text-indigo-700 transition-colors"
          >
            Log workout
          </button>
        )}
      </div>

      {/* Water Card */}
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-6 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">Water Intake</h2>
          <button onClick={() => navigate('/water')}
            className="text-xs font-semibold text-sky-600 dark:text-sky-400 hover:text-sky-700 transition-colors">
            View all →
          </button>
        </div>
        <div className="flex items-end gap-3 mb-3">
          <span className="text-4xl font-bold text-sky-600 dark:text-sky-400">{Math.round(water.total || 0)}</span>
          <span className="text-base text-sky-500 dark:text-sky-400 font-medium pb-1">oz &nbsp;·&nbsp; {((water.total || 0) / 8).toFixed(1)} cups</span>
          {goals.waterGoal > 0 && (
            <span className="text-xs text-sky-400 pb-1 ml-auto">Goal: {goals.waterGoal} oz</span>
          )}
        </div>
        {goals.waterGoal > 0 && (
          <div className="mb-3">
            <div className="w-full bg-sky-50 dark:bg-sky-900/20 rounded-full h-1.5">
              <div className="bg-sky-500 h-1.5 rounded-full transition-all"
                style={{ width: `${Math.min(100, ((water.total || 0) / goals.waterGoal) * 100)}%` }} />
            </div>
          </div>
        )}
        <div className="grid grid-cols-4 gap-2">
          {[8, 12, 16, 32].map(oz => (
            <button key={oz} type="button" onClick={() => handleQuickWater(oz)} disabled={waterAdding}
              className="flex flex-col items-center justify-center bg-sky-50 dark:bg-sky-900/20 hover:bg-sky-100 dark:hover:bg-sky-900/30 border border-sky-100 dark:border-sky-800 hover:border-sky-200 rounded-xl py-3 transition-all disabled:opacity-50">
              <span className="text-base font-bold text-sky-600 dark:text-sky-400">{oz}</span>
              <span className="text-xs text-sky-500 dark:text-sky-400 font-medium">oz</span>
            </button>
          ))}
        </div>
      </div>

      {/* Quick-add Row */}
      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-3">Quick Add</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {mealTypes.map(meal => (
            <button
              key={meal}
              onClick={() => navigate('/meals', { state: { openFor: meal } })}
              className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:border-indigo-400 dark:hover:border-indigo-500 hover:shadow-sm rounded-xl py-4 text-sm font-semibold text-gray-700 dark:text-gray-300 hover:text-indigo-600 dark:hover:text-indigo-400 capitalize transition-all"
            >
              + {meal.charAt(0).toUpperCase() + meal.slice(1)}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
