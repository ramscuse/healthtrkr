import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { changePassword, getAccount, getGoals, updateGoals, clearToken } from '../lib/api.js'
import { useDarkMode } from '../context/ThemeContext.jsx'

export default function Account() {
  const { darkMode, toggleDarkMode } = useDarkMode()
  const navigate = useNavigate()

  // Profile state
  const [profile, setProfile] = useState(null)

  // Goals state
  const [goals, setGoals]               = useState(null)
  const [goalsEditing, setGoalsEditing] = useState(false)
  const [goalsForm, setGoalsForm]       = useState({})
  const [goalsSaving, setGoalsSaving]   = useState(false)
  const [goalsError, setGoalsError]     = useState('')
  const [goalsSaved, setGoalsSaved]     = useState(false)

  // Password state
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  useEffect(() => {
    getAccount().then(u => setProfile(u)).catch(() => {})
    getGoals().then(g => {
      setGoals(g)
      setGoalsForm({
        calorieMin: g.calorieMin ?? '',
        calorieMax: g.calorieMax ?? '',
        proteinMin: g.proteinMin ?? '',
        proteinMax: g.proteinMax ?? '',
        waterGoal:  g.waterGoal  ?? '',
      })
    }).catch(() => {})
  }, [])

  async function handleSaveGoals() {
    setGoalsSaving(true); setGoalsError(''); setGoalsSaved(false)
    try {
      const payload = {}
      for (const [key, val] of Object.entries(goalsForm)) {
        const n = Number(val)
        if (val !== '' && Number.isFinite(n)) payload[key] = n
      }
      const updated = await updateGoals(payload)
      setGoals(updated)
      setGoalsEditing(false)
      setGoalsSaved(true)
      setTimeout(() => setGoalsSaved(false), 2500)
    } catch (err) {
      setGoalsError(err.message || 'Failed to save goals.')
    } finally {
      setGoalsSaving(false)
    }
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setSuccess(false)

    if (next !== confirm) {
      setError('New passwords do not match.')
      return
    }
    if (next.length < 6) {
      setError('New password must be at least 6 characters.')
      return
    }

    setLoading(true)
    try {
      await changePassword(current, next)
      setSuccess(true)
      setCurrent('')
      setNext('')
      setConfirm('')
    } catch (err) {
      setError(err.message || 'Failed to update password.')
    } finally {
      setLoading(false)
    }
  }

  function handleLogout() {
    clearToken()
    navigate('/login')
  }

  return (
    <div className="max-w-md space-y-6">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Account</h1>

      {/* Profile Info */}
      {profile && (
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-sm p-6">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-4">Profile</h2>
          <div className="space-y-2">
            {profile.name && (
              <div className="flex items-center gap-3">
                <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 w-16">Name</span>
                <span className="text-sm text-gray-900 dark:text-white">{profile.name}</span>
              </div>
            )}
            <div className="flex items-center gap-3">
              <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 w-16">Email</span>
              <span className="text-sm text-gray-900 dark:text-white">{profile.email}</span>
            </div>
          </div>
        </div>
      )}

      {/* Goals */}
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-sm p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200">Goals</h2>
          {!goalsEditing ? (
            <button type="button" onClick={() => { setGoalsEditing(true); setGoalsError('') }}
              className="text-xs font-semibold text-indigo-600 hover:text-indigo-700 border border-indigo-200 hover:border-indigo-300 rounded-lg px-3 py-1.5 transition-colors">
              Edit
            </button>
          ) : (
            <div className="flex gap-2">
              <button type="button" onClick={handleSaveGoals} disabled={goalsSaving}
                className="text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 rounded-lg px-3 py-1.5 transition-colors">
                {goalsSaving ? 'Saving…' : 'Save'}
              </button>
              <button type="button" onClick={() => {
                setGoalsEditing(false)
                setGoalsError('')
                setGoalsForm({
                  calorieMin: goals?.calorieMin ?? '',
                  calorieMax: goals?.calorieMax ?? '',
                  proteinMin: goals?.proteinMin ?? '',
                  proteinMax: goals?.proteinMax ?? '',
                  waterGoal:  goals?.waterGoal  ?? '',
                })
              }}
                className="text-xs font-semibold text-gray-500 dark:text-gray-400 border border-gray-200 dark:border-gray-600 hover:border-gray-300 rounded-lg px-3 py-1.5 transition-colors">
                Cancel
              </button>
            </div>
          )}
        </div>

        {goalsSaved && (
          <div className="mb-4 bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-700 text-green-700 dark:text-green-400 text-sm rounded-lg px-4 py-3">
            Goals saved.
          </div>
        )}

        {goalsEditing ? (
          <div className="space-y-3">
            {[
              { key: 'calorieMin', label: 'Calorie Min', unit: 'kcal' },
              { key: 'calorieMax', label: 'Calorie Max', unit: 'kcal' },
              { key: 'proteinMin', label: 'Protein Min', unit: 'g' },
              { key: 'proteinMax', label: 'Protein Max', unit: 'g' },
              { key: 'waterGoal',  label: 'Water Goal',  unit: 'oz' },
            ].map(({ key, label, unit }) => (
              <div key={key} className="flex items-center gap-3">
                <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 w-28 flex-shrink-0">{label}</label>
                <div className="flex items-center gap-1 flex-1">
                  <input
                    type="number"
                    min="0"
                    value={goalsForm[key]}
                    onChange={e => setGoalsForm(f => ({ ...f, [key]: e.target.value }))}
                    inputMode="numeric"
                    style={{ fontSize: '16px' }}
                    className="flex-1 border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-white bg-white dark:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  <span className="text-xs text-gray-400 dark:text-gray-500 flex-shrink-0">{unit}</span>
                </div>
              </div>
            ))}
            {goalsError && <p className="text-xs text-red-600">{goalsError}</p>}
          </div>
        ) : goals ? (
          <div className="space-y-2">
            {[
              { label: 'Calories', value: goals.calorieMin != null && goals.calorieMax != null ? `${goals.calorieMin}–${goals.calorieMax} kcal` : goals.calorieMax ? `${goals.calorieMax} kcal max` : null },
              { label: 'Protein',  value: goals.proteinMin != null && goals.proteinMax != null ? `${goals.proteinMin}–${goals.proteinMax} g` : goals.proteinMax ? `${goals.proteinMax} g max` : null },
              { label: 'Water',    value: goals.waterGoal ? `${goals.waterGoal} oz / day` : null },
            ].map(({ label, value }) => (
              <div key={label} className="flex items-center gap-3">
                <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 w-16">{label}</span>
                <span className="text-sm text-gray-900 dark:text-white">{value ?? <span className="text-gray-400 dark:text-gray-500">Not set</span>}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-gray-400">Loading goals…</p>
        )}
      </div>

      {/* Appearance */}
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-sm p-6">
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-5">Appearance</h2>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-gray-900 dark:text-white">Dark Mode</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Switch between light and dark theme</p>
          </div>
          <button
            type="button"
            onClick={toggleDarkMode}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 dark:focus:ring-offset-gray-800 ${
              darkMode ? 'bg-indigo-600' : 'bg-gray-200 dark:bg-gray-600'
            }`}
            role="switch"
            aria-checked={darkMode}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                darkMode ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </div>
      </div>

      {/* Change Password */}
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-sm p-6">
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-5">Change Password</h2>

        {success && (
          <div className="mb-4 bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-700 text-green-700 dark:text-green-400 text-sm rounded-lg px-4 py-3">
            Password updated successfully.
          </div>
        )}
        {error && (
          <div className="mb-4 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 text-red-700 dark:text-red-400 text-sm rounded-lg px-4 py-3">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">Current Password</label>
            <input
              type="password"
              value={current}
              onChange={e => setCurrent(e.target.value)}
              required
              autoComplete="current-password"
              style={{ fontSize: '16px' }}
              className="w-full border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-white bg-white dark:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">New Password</label>
            <input
              type="password"
              value={next}
              onChange={e => setNext(e.target.value)}
              required
              autoComplete="new-password"
              style={{ fontSize: '16px' }}
              className="w-full border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-white bg-white dark:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">Confirm New Password</label>
            <input
              type="password"
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
              required
              autoComplete="new-password"
              style={{ fontSize: '16px' }}
              className="w-full border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-white bg-white dark:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-semibold rounded-lg px-4 py-2.5 transition-colors"
          >
            {loading ? 'Updating...' : 'Update Password'}
          </button>
        </form>
      </div>

      {/* Log Out */}
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-sm p-6">
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-4">Session</h2>
        <button
          type="button"
          onClick={handleLogout}
          className="w-full border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 text-sm font-semibold rounded-lg px-4 py-2.5 transition-colors"
        >
          Log Out
        </button>
      </div>
    </div>
  )
}
