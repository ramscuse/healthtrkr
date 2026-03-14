import { useState, useEffect, useCallback } from 'react'
import { getWaterEntries, logWater, deleteWaterEntry, getGoals, updateGoals } from '../lib/api.js'

const PRESETS = [8, 12, 16, 20, 32]

function getTodayString() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}


function formatTime(isoStr) {
  if (!isoStr) return ''
  return new Date(isoStr).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}


export default function Water() {
  const today = getTodayString()
  const [selectedDate, setSelectedDate] = useState(today)
  const [entries, setEntries]       = useState([])
  const [loading, setLoading]       = useState(true)
  const [customAmt, setCustomAmt]   = useState('')
  const [adding, setAdding]         = useState(false)
  const [addError, setAddError]     = useState('')

  const [waterGoal, setWaterGoal]       = useState(null)
  const [goalEditing, setGoalEditing]   = useState(false)
  const [goalInput, setGoalInput]       = useState('')
  const [goalSaving, setGoalSaving]     = useState(false)
  const [goalError, setGoalError]       = useState('')

  const total = entries.reduce((sum, e) => sum + e.amount, 0)
  const cups  = (total / 8).toFixed(1)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await getWaterEntries(selectedDate)
      setEntries(Array.isArray(data) ? data : [])
    } catch {
      setEntries([])
    } finally {
      setLoading(false)
    }
  }, [selectedDate])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    getGoals().then(g => {
      setWaterGoal(g.waterGoal ?? null)
      setGoalInput(g.waterGoal ?? '')
    }).catch(() => {})
  }, [])

  async function handleAdd(amount) {
    if (!amount || amount <= 0) return
    setAdding(true); setAddError('')
    try {
      const entry = await logWater({ date: selectedDate, amount })
      setEntries(prev => [...prev, entry])
    } catch (err) {
      setAddError(err.message || 'Failed to add.')
    } finally {
      setAdding(false)
    }
  }

  async function handleDelete(id) {
    try {
      await deleteWaterEntry(id)
      setEntries(prev => prev.filter(e => e.id !== id))
    } catch { /* swallow */ }
  }

  async function handleSaveWaterGoal() {
    const n = parseFloat(goalInput)
    if (!n || n <= 0) { setGoalError('Enter a valid goal.'); return }
    setGoalSaving(true); setGoalError('')
    try {
      const updated = await updateGoals({ waterGoal: n })
      setWaterGoal(updated.waterGoal)
      setGoalEditing(false)
    } catch (err) {
      setGoalError(err.message || 'Failed to save.')
    } finally {
      setGoalSaving(false)
    }
  }

  function handleCustomAdd() {
    const n = parseFloat(customAmt)
    if (!n || n <= 0) { setAddError('Enter a valid amount.'); return }
    setCustomAmt('')
    handleAdd(n)
  }

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Water</h1>
        <input
          type="date"
          value={selectedDate}
          max={today}
          onChange={e => setSelectedDate(e.target.value)}
          style={{ fontSize: '16px' }}
          className="border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 text-sm text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent"
        />
      </div>

      {/* Total card */}
      <div className="bg-sky-50 dark:bg-sky-900/20 border border-sky-100 dark:border-sky-800 rounded-2xl p-6">
        <div className="flex items-start justify-between mb-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-sky-500 dark:text-sky-400">{selectedDate === today ? "Today's Intake" : selectedDate}</p>
          {!goalEditing ? (
            <button type="button" onClick={() => setGoalEditing(true)}
              className="text-xs font-semibold text-sky-500 dark:text-sky-400 hover:text-sky-700 transition-colors">
              {waterGoal ? `Goal: ${waterGoal} oz` : 'Set goal'}
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <input type="number" min="1" value={goalInput} onChange={e => { setGoalInput(e.target.value); setGoalError('') }}
                inputMode="numeric"
                style={{ fontSize: '16px' }}
                className="w-20 border border-sky-200 dark:border-sky-700 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-sky-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-white" />
              <span className="text-xs text-sky-500 dark:text-sky-400">oz</span>
              <button type="button" onClick={handleSaveWaterGoal} disabled={goalSaving}
                className="text-xs font-semibold text-white bg-sky-500 hover:bg-sky-600 disabled:opacity-50 rounded-lg px-2 py-1 transition-colors">
                {goalSaving ? '…' : 'Save'}
              </button>
              <button type="button" onClick={() => { setGoalEditing(false); setGoalError('') }}
                className="text-xs text-sky-400 hover:text-sky-600 transition-colors">✕</button>
            </div>
          )}
        </div>
        {goalError && <p className="text-xs text-red-500 mb-1">{goalError}</p>}
        <div className="text-center my-2">
          <p className="text-6xl font-bold text-sky-600 dark:text-sky-400 leading-none">{Math.round(total)}</p>
          <p className="text-base text-sky-500 dark:text-sky-400 mt-1 font-medium">oz &nbsp;·&nbsp; {cups} cups</p>
        </div>
        {waterGoal && waterGoal > 0 && (
          <div className="mt-3">
            <div className="flex justify-between text-xs text-sky-500 dark:text-sky-400 mb-1">
              <span>{Math.round((total / waterGoal) * 100)}% of goal</span>
              <span>{Math.round(Math.max(0, waterGoal - total))} oz remaining</span>
            </div>
            <div className="w-full bg-sky-100 dark:bg-sky-900/40 rounded-full h-2">
              <div className="bg-sky-500 h-2 rounded-full transition-all"
                style={{ width: `${Math.min(100, (total / waterGoal) * 100)}%` }} />
            </div>
          </div>
        )}
      </div>

      {/* Quick Add presets */}
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-sm p-5 space-y-4">
        <h2 className="text-sm font-bold text-gray-900 dark:text-white">Quick Add</h2>
        <div className="grid grid-cols-5 gap-2">
          {PRESETS.map(oz => (
            <button key={oz} type="button" onClick={() => handleAdd(oz)} disabled={adding}
              className="flex flex-col items-center justify-center bg-sky-50 dark:bg-sky-900/20 hover:bg-sky-100 dark:hover:bg-sky-900/30 border border-sky-100 dark:border-sky-800 hover:border-sky-200 rounded-xl py-3 transition-all disabled:opacity-50">
              <span className="text-lg font-bold text-sky-600 dark:text-sky-400">{oz}</span>
              <span className="text-xs text-sky-500 dark:text-sky-400 font-medium">oz</span>
            </button>
          ))}
        </div>

        {/* Custom amount */}
        <div className="flex gap-2">
          <input
            type="number"
            min="1"
            placeholder="Custom oz…"
            value={customAmt}
            onChange={e => { setCustomAmt(e.target.value); setAddError('') }}
            onKeyDown={e => e.key === 'Enter' && handleCustomAdd()}
            inputMode="decimal"
            style={{ fontSize: '16px' }}
            className="flex-1 border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2.5 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-sky-500"
          />
          <button type="button" onClick={handleCustomAdd} disabled={adding}
            className="bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white text-sm font-semibold rounded-lg px-4 py-2.5 transition-colors">
            Add
          </button>
        </div>
        {addError && <p className="text-sm text-red-600 dark:text-red-400">{addError}</p>}
      </div>

      {/* Today's log */}
      <div>
        <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-3">{selectedDate === today ? "Today's Log" : `Log — ${selectedDate}`}</h2>
        {loading ? (
          <div className="text-sm text-gray-400 dark:text-gray-500 animate-pulse">Loading…</div>
        ) : entries.length === 0 ? (
          <p className="text-sm text-gray-400 dark:text-gray-500">No water logged{selectedDate === today ? ' yet today' : ' on this day'}.</p>
        ) : (
          <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-sm overflow-hidden">
            <ul className="divide-y divide-gray-100 dark:divide-gray-700">
              {[...entries].reverse().map(entry => (
                <li key={entry.id} className="flex items-center justify-between px-5 py-3">
                  <div className="flex items-center gap-3">
                    <span className="w-2 h-2 rounded-full bg-sky-400 flex-shrink-0" />
                    <span className="text-sm font-semibold text-gray-900 dark:text-white">{entry.amount} oz</span>
                    <span className="text-xs text-gray-400 dark:text-gray-500">{(entry.amount / 8).toFixed(1)} cups</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-gray-400 dark:text-gray-500">{formatTime(entry.createdAt)}</span>
                    <button type="button" onClick={() => handleDelete(entry.id)}
                      className="text-gray-300 dark:text-gray-600 hover:text-red-500 transition-colors" aria-label="Delete">
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                        <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
                      </svg>
                    </button>
                  </div>
                </li>
              ))}
            </ul>
            <div className="px-5 py-3 bg-gray-50 dark:bg-gray-700/50 border-t border-gray-100 dark:border-gray-700 flex justify-between">
              <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">Total</span>
              <span className="text-xs font-bold text-sky-600 dark:text-sky-400">{Math.round(total)} oz · {cups} cups</span>
            </div>
          </div>
        )}
      </div>

    </div>
  )
}
