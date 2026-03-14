import { useState, useEffect, useCallback } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ReferenceLine, ResponsiveContainer, CartesianGrid } from 'recharts'
import { getProgressWeekly, getProgressRange } from '../lib/api.js'
import { useDarkMode } from '../context/ThemeContext.jsx'

// ── Date helpers ──────────────────────────────────────────────────────────────

function getTodayString() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

// Get the Monday of the week containing `date` (YYYY-MM-DD string)
function getMondayOf(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  const day = date.getDay() // 0=Sun
  const diff = (day === 0 ? -6 : 1 - day)
  date.setDate(date.getDate() + diff)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function addDays(dateStr, n) {
  const [y, m, d] = dateStr.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  date.setDate(date.getDate() + n)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function getMonthStart(year, month) {
  return `${year}-${String(month).padStart(2, '0')}-01`
}

function getDaysInMonth(year, month) {
  return new Date(year, month, 0).getDate()
}

function shortDate(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function monthLabel(year, month) {
  return new Date(year, month - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}

function dayLabel(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

function dayNum(dateStr) {
  return parseInt(dateStr.split('-')[2], 10)
}

function dayOfWeek(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(y, m - 1, d).getDay() // 0=Sun
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function hasData(s) {
  return (s.consumed?.calories || 0) > 0 || (s.water || 0) > 0
}

function pct(actual, goal) {
  if (!goal || goal <= 0) return null
  return Math.round((actual / goal) * 100)
}

function GoalBar({ value, goal, color = 'bg-indigo-500' }) {
  if (!goal || goal <= 0) return null
  const width = Math.min(100, (value / goal) * 100)
  return (
    <div className="w-full bg-gray-100 rounded-full h-1.5 mt-1">
      <div className={`${color} h-1.5 rounded-full transition-all`} style={{ width: `${width}%` }} />
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function Progress() {
  const today = getTodayString()
  const { darkMode } = useDarkMode()
  const todayDate = new Date(today.replace(/-/g, '/'))

  // View mode
  const [viewMode, setViewMode] = useState('weekly') // 'weekly' | 'monthly'

  // Week navigation (offset in weeks from current)
  const [weekOffset, setWeekOffset] = useState(0)

  // Month navigation
  const [monthYear, setMonthYear] = useState(todayDate.getFullYear())
  const [monthMonth, setMonthMonth] = useState(todayDate.getMonth() + 1)

  const [summaries, setSummaries] = useState([])
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState('')

  // Computed date range
  const weekStart = addDays(getMondayOf(today), weekOffset * 7)
  const weekEnd   = addDays(weekStart, 6)

  const monthStart = getMonthStart(monthYear, monthMonth)
  const numDays    = getDaysInMonth(monthYear, monthMonth)

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      let data
      if (viewMode === 'weekly') {
        data = await getProgressWeekly(weekStart)
      } else {
        data = await getProgressRange(monthStart, numDays)
      }
      setSummaries(Array.isArray(data) ? data : [])
    } catch (err) {
      setError(err.message || 'Failed to load progress.')
    } finally {
      setLoading(false)
    }
  }, [viewMode, weekStart, monthStart, numDays])

  useEffect(() => { load() }, [load])

  // ── Averages (exclude days with no data) ──
  const activeDays = summaries.filter(hasData)
  const n = activeDays.length || 1

  const avgCalIn    = Math.round(activeDays.reduce((s, d) => s + (d.consumed?.calories || 0), 0) / n)
  const avgCalBurned = Math.round(activeDays.reduce((s, d) => s + (d.burned?.active || 0), 0) / n)
  const avgProtein  = Math.round(activeDays.reduce((s, d) => s + (d.consumed?.protein || 0), 0) / n)
  const avgWater    = Math.round(activeDays.reduce((s, d) => s + (d.water || 0), 0) / n)

  // Goals from first non-null entry
  const goals = summaries.find(s => s.goals)?.goals || {}

  // ── Chart data (weekly) ──
  const chartData = summaries.map(s => ({
    day: new Date(s.date.replace(/-/g, '/')).toLocaleDateString('en-US', { weekday: 'short' }),
    calories: Math.round(s.consumed?.calories || 0),
    protein:  Math.round(s.consumed?.protein  || 0),
    water:    Math.round(s.water || 0),
  }))

  // ── Month calendar helpers ──
  const firstDow = dayOfWeek(monthStart) // 0=Sun
  const calendarOffset = firstDow === 0 ? 6 : firstDow - 1 // offset to Monday-first grid

  // Selected day detail
  const [selectedDay, setSelectedDay] = useState(null) // date string

  function handleSelectDay(s) {
    setSelectedDay(prev => prev === s.date ? null : s.date)
  }

  const selectedDaySummary = selectedDay ? summaries.find(s => s.date === selectedDay) : null

  // ── Navigation ──
  function prevWeek()  { setWeekOffset(w => w - 1) }
  function nextWeek()  { if (weekOffset < 0) setWeekOffset(w => w + 1) }
  function prevMonth() {
    setSelectedDay(null)
    if (monthMonth === 1) { setMonthMonth(12); setMonthYear(y => y - 1) }
    else setMonthMonth(m => m - 1)
  }
  function nextMonth() {
    const now = new Date()
    if (monthYear > now.getFullYear() || (monthYear === now.getFullYear() && monthMonth >= now.getMonth() + 1)) return
    setSelectedDay(null)
    if (monthMonth === 12) { setMonthMonth(1); setMonthYear(y => y + 1) }
    else setMonthMonth(m => m + 1)
  }

  if (error) {
    return <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 rounded-xl p-6 text-sm">{error}</div>
  }

  const tooltipStyle = {
    borderRadius: '8px',
    border: `1px solid ${darkMode ? '#374151' : '#e5e7eb'}`,
    fontSize: '12px',
    backgroundColor: darkMode ? '#1f2937' : '#ffffff',
    color: darkMode ? '#f9fafb' : '#111827',
  }

  return (
    <div className="space-y-6">

      {/* ── Header + view toggle ── */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Progress</h1>
        <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-800 rounded-lg p-1">
          {['weekly', 'monthly'].map(mode => (
            <button key={mode} type="button" onClick={() => setViewMode(mode)}
              className={['px-4 py-1.5 rounded-md text-sm font-semibold transition-all capitalize',
                viewMode === mode ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'].join(' ')}>
              {mode}
            </button>
          ))}
        </div>
      </div>

      {/* ── Period navigation ── */}
      <div className="flex items-center justify-between">
        <button type="button" onClick={viewMode === 'weekly' ? prevWeek : prevMonth}
          className="flex items-center gap-1 text-sm font-semibold text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition-colors px-3 py-1.5 border border-gray-200 dark:border-gray-700 hover:border-gray-300 rounded-lg">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
            <path fillRule="evenodd" d="M11.78 5.22a.75.75 0 010 1.06L8.06 10l3.72 3.72a.75.75 0 11-1.06 1.06l-4.25-4.25a.75.75 0 010-1.06l4.25-4.25a.75.75 0 011.06 0z" clipRule="evenodd" />
          </svg>
          Prev
        </button>
        <span className="text-sm font-semibold text-gray-700 dark:text-gray-200">
          {viewMode === 'weekly'
            ? `${shortDate(weekStart)} – ${shortDate(weekEnd)}`
            : monthLabel(monthYear, monthMonth)}
        </span>
        <button type="button" onClick={viewMode === 'weekly' ? nextWeek : nextMonth}
          disabled={viewMode === 'weekly' ? weekOffset >= 0 : (monthYear === todayDate.getFullYear() && monthMonth === todayDate.getMonth() + 1)}
          className="flex items-center gap-1 text-sm font-semibold text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white disabled:opacity-30 transition-colors px-3 py-1.5 border border-gray-200 dark:border-gray-700 hover:border-gray-300 rounded-lg">
          Next
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
            <path fillRule="evenodd" d="M8.22 5.22a.75.75 0 011.06 0l4.25 4.25a.75.75 0 010 1.06l-4.25 4.25a.75.75 0 01-1.06-1.06L11.94 10 8.22 6.28a.75.75 0 010-1.06z" clipRule="evenodd" />
          </svg>
        </button>
      </div>

      {/* ── Averages ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Avg Cal In',    value: avgCalIn,    unit: 'kcal', color: 'text-indigo-600 dark:text-indigo-400', note: goals.calorieMin ? `Goal ${goals.calorieMin}–${goals.calorieMax}` : null },
          { label: 'Avg Cal Burned', value: avgCalBurned, unit: 'kcal', color: 'text-orange-500 dark:text-orange-400', note: 'Active calories' },
          { label: 'Avg Protein',   value: avgProtein,  unit: 'g',    color: 'text-violet-600 dark:text-violet-400', note: goals.proteinMin ? `Goal ${goals.proteinMin}–${goals.proteinMax}g` : null },
          { label: 'Avg Water',     value: avgWater,    unit: 'oz',   color: 'text-sky-600 dark:text-sky-400',    note: goals.waterGoal ? `Goal ${goals.waterGoal} oz` : null },
        ].map(({ label, value, unit, color, note }) => (
          <div key={label} className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-sm p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-1">{label}</p>
            <p className={`text-2xl font-bold ${color}`}>{loading ? '…' : value}<span className="text-sm font-normal text-gray-400 dark:text-gray-500 ml-1">{unit}</span></p>
            {note && <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{note}</p>}
            {!activeDays.length && !loading && <p className="text-xs text-gray-300 dark:text-gray-600 mt-0.5">No data</p>}
          </div>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-40">
          <div className="text-gray-400 dark:text-gray-500 text-sm animate-pulse">Loading…</div>
        </div>
      ) : viewMode === 'weekly' ? (

        /* ══════════════ WEEKLY VIEW ══════════════ */
        <div className="space-y-4">

          {/* Calorie bar chart */}
          <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-sm p-5">
            <p className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-4">Calorie Intake</p>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={chartData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={darkMode ? '#374151' : '#f3f4f6'} />
                <XAxis dataKey="day" tick={{ fontSize: 11, fill: darkMode ? '#6b7280' : '#9ca3af' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: darkMode ? '#6b7280' : '#9ca3af' }} axisLine={false} tickLine={false} width={40}
                  domain={[0, dataMax => Math.max(dataMax, goals.calorieMax || 0) * 1.05]} />
                <Tooltip contentStyle={tooltipStyle} formatter={v => [`${v} kcal`, 'Calories']} />
                <Bar dataKey="calories" fill="#6366f1" radius={[4,4,0,0]} />
                {goals.calorieMin > 0 && <ReferenceLine y={goals.calorieMin} stroke="#22c55e" strokeDasharray="5 3" strokeWidth={1.5} />}
                {goals.calorieMax > 0 && <ReferenceLine y={goals.calorieMax} stroke="#ef4444" strokeDasharray="5 3" strokeWidth={1.5} />}
              </BarChart>
            </ResponsiveContainer>
            <div className="flex gap-4 mt-2 justify-center">
              <span className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400"><span className="w-3 h-3 rounded-sm bg-indigo-500 inline-block" />Actual</span>
              {goals.calorieMin > 0 && <span className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400"><span className="w-3 h-3 rounded-sm bg-green-500 inline-block" />Min</span>}
              {goals.calorieMax > 0 && <span className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400"><span className="w-3 h-3 rounded-sm bg-red-500 inline-block" />Max</span>}
            </div>
          </div>

          {/* Protein bar chart */}
          <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-sm p-5">
            <p className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-4">Protein Intake</p>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={chartData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={darkMode ? '#374151' : '#f3f4f6'} />
                <XAxis dataKey="day" tick={{ fontSize: 11, fill: darkMode ? '#6b7280' : '#9ca3af' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: darkMode ? '#6b7280' : '#9ca3af' }} axisLine={false} tickLine={false} width={40}
                  domain={[0, dataMax => Math.max(dataMax, goals.proteinMax || 0) * 1.05]} />
                <Tooltip contentStyle={tooltipStyle} formatter={v => [`${v}g`, 'Protein']} />
                <Bar dataKey="protein" fill="#8b5cf6" radius={[4,4,0,0]} />
                {goals.proteinMin > 0 && <ReferenceLine y={goals.proteinMin} stroke="#22c55e" strokeDasharray="5 3" strokeWidth={1.5} />}
                {goals.proteinMax > 0 && <ReferenceLine y={goals.proteinMax} stroke="#ef4444" strokeDasharray="5 3" strokeWidth={1.5} />}
              </BarChart>
            </ResponsiveContainer>
            <div className="flex gap-4 mt-2 justify-center">
              <span className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400"><span className="w-3 h-3 rounded-sm bg-violet-500 inline-block" />Actual</span>
              {goals.proteinMin > 0 && <span className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400"><span className="w-3 h-3 rounded-sm bg-green-500 inline-block" />Min</span>}
              {goals.proteinMax > 0 && <span className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400"><span className="w-3 h-3 rounded-sm bg-red-500 inline-block" />Max</span>}
            </div>
          </div>

          {/* Day-by-day detail cards */}
          <div className="space-y-3">
            {summaries.map(s => {
              const active = hasData(s)
              const cal = Math.round(s.consumed?.calories || 0)
              const pro = Math.round(s.consumed?.protein  || 0)
              const carbs = Math.round(s.consumed?.carbs  || 0)
              const fat  = Math.round(s.consumed?.fat     || 0)
              const wat  = Math.round(s.water || 0)
              return (
                <div key={s.date} className={`bg-white dark:bg-gray-800 border rounded-xl shadow-sm overflow-hidden ${active ? 'border-gray-200 dark:border-gray-700' : 'border-gray-100 dark:border-gray-700'}`}>
                  <div className={`flex items-center justify-between px-4 py-3 ${active ? 'bg-white dark:bg-gray-800' : 'bg-gray-50 dark:bg-gray-700/50'}`}>
                    <p className={`text-sm font-bold ${active ? 'text-gray-900 dark:text-white' : 'text-gray-400 dark:text-gray-500'}`}>{dayLabel(s.date)}</p>
                    <div className="flex items-center gap-2">
                      {s.workoutLogged && <span className="text-xs bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400 font-semibold rounded-full px-2 py-0.5 border border-green-100 dark:border-green-800">💪 Workout</span>}
                      {!active && <span className="text-xs text-gray-300 dark:text-gray-600">No data</span>}
                    </div>
                  </div>
                  {active && (
                    <div className="grid grid-cols-3 sm:grid-cols-5 gap-px bg-gray-100 dark:bg-gray-700 border-t border-gray-100 dark:border-gray-700">
                      {[
                        { label: 'Calories', value: cal,  unit: 'kcal', color: 'text-indigo-600 dark:text-indigo-400', bar: 'bg-indigo-400', goal: goals.calorieMax, min: goals.calorieMin, max: goals.calorieMax },
                        { label: 'Protein',  value: pro,  unit: 'g',    color: 'text-violet-600 dark:text-violet-400', bar: 'bg-violet-400', goal: goals.proteinMax, min: goals.proteinMin, max: goals.proteinMax },
                        { label: 'Carbs',    value: carbs,unit: 'g',    color: 'text-amber-600 dark:text-amber-400',  bar: 'bg-amber-400',  goal: goals.carbsGoal },
                        { label: 'Fat',      value: fat,  unit: 'g',    color: 'text-orange-600 dark:text-orange-400', bar: 'bg-orange-400', goal: goals.fatGoal },
                        { label: 'Water',    value: wat,  unit: 'oz',   color: 'text-sky-600 dark:text-sky-400',    bar: 'bg-sky-400',    goal: goals.waterGoal },
                      ].map(({ label, value, unit, color, bar, goal, min, max }) => (
                        <div key={label} className="bg-white dark:bg-gray-800 px-3 py-3">
                          <p className="text-xs text-gray-400 dark:text-gray-500 mb-0.5">{label}</p>
                          <p className={`text-base font-bold ${color}`}>{value}<span className="text-xs font-normal text-gray-400 dark:text-gray-500 ml-0.5">{unit}</span></p>
                          {(goal || max) ? (
                            <>
                              <GoalBar value={value} goal={goal || max} color={bar} />
                              <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                                {max ? `${pct(value, max)}%` : `${pct(value, goal)}%`}
                                {min ? ` · min ${min}` : goal ? ` of ${goal}` : ''}
                              </p>
                            </>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>

      ) : (

        /* ══════════════ MONTHLY VIEW ══════════════ */
        <div className="space-y-4">

          {/* Calorie bar chart for month */}
          <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-sm p-5">
            <p className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-4">Daily Calories — {monthLabel(monthYear, monthMonth)}</p>
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={summaries.map(s => ({
                day: dayNum(s.date),
                calories: Math.round(s.consumed?.calories || 0),
              }))} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={darkMode ? '#374151' : '#f3f4f6'} />
                <XAxis dataKey="day" tick={{ fontSize: 10, fill: darkMode ? '#6b7280' : '#9ca3af' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: darkMode ? '#6b7280' : '#9ca3af' }} axisLine={false} tickLine={false} width={36}
                  domain={[0, dataMax => Math.max(dataMax, goals.calorieMax || 0) * 1.05]} />
                <Tooltip contentStyle={{ ...tooltipStyle, fontSize: '11px' }} formatter={v => [`${v} kcal`, 'Cal']} />
                <Bar dataKey="calories" fill="#6366f1" radius={[3,3,0,0]} />
                {goals.calorieMax > 0 && <ReferenceLine y={goals.calorieMax} stroke="#ef4444" strokeDasharray="4 2" strokeWidth={1} />}
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Calendar grid */}
          <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-sm p-5">
            <p className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-4">Monthly Overview</p>

            {/* Day-of-week headers (Mon-Sun) */}
            <div className="grid grid-cols-7 gap-1 mb-1">
              {['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(d => (
                <div key={d} className="text-center text-xs font-semibold text-gray-400 dark:text-gray-500 py-1">{d}</div>
              ))}
            </div>

            {/* Calendar cells */}
            <div className="grid grid-cols-7 gap-1">
              {Array.from({ length: calendarOffset }).map((_, i) => (
                <div key={`empty-${i}`} />
              ))}
              {summaries.map(s => {
                const active = hasData(s)
                const isToday = s.date === today
                const isSelected = s.date === selectedDay
                const cal = s.consumed?.calories || 0
                const wat = s.water || 0
                const workout = s.workoutLogged

                // Color logic — includes dark mode variants
                let bgColor = 'bg-gray-50 dark:bg-gray-700 text-gray-300 dark:text-gray-500'
                if (active) {
                  const calOk = goals.calorieMax ? cal >= (goals.calorieMin || 0) && cal <= goals.calorieMax : cal > 0
                  const watOk = goals.waterGoal  ? wat >= goals.waterGoal : true
                  if (calOk && watOk) bgColor = 'bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                  else if (calOk || watOk) bgColor = 'bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400'
                  else bgColor = 'bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400'
                }

                return (
                  <div key={s.date}
                    onClick={() => handleSelectDay(s)}
                    className={`${bgColor} rounded-lg p-1.5 aspect-square flex flex-col items-center justify-center gap-0.5 cursor-pointer transition-all
                      ${isToday ? 'ring-2 ring-indigo-400' : ''}
                      ${isSelected ? 'ring-2 ring-indigo-600 scale-105 shadow-md' : 'hover:opacity-80'}`}>
                    <span className="text-xs font-bold leading-none">{dayNum(s.date)}</span>
                    {workout && <span className="text-xs leading-none">💪</span>}
                  </div>
                )
              })}
            </div>

            {/* Legend */}
            <div className="flex flex-wrap gap-3 mt-4 justify-center">
              <span className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400"><span className="w-3 h-3 rounded bg-green-100 dark:bg-green-900/30 inline-block" />Goals met</span>
              <span className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400"><span className="w-3 h-3 rounded bg-amber-100 dark:bg-amber-900/30 inline-block" />Partial</span>
              <span className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400"><span className="w-3 h-3 rounded bg-red-100 dark:bg-red-900/30 inline-block" />Missed</span>
              <span className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400"><span className="w-3 h-3 rounded bg-gray-100 dark:bg-gray-700 inline-block" />No data</span>
              <span className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">💪 Workout logged</span>
            </div>

            {/* Selected day detail */}
            {selectedDaySummary && (
              <div className="mt-5 border-t border-gray-100 dark:border-gray-700 pt-5">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-sm font-bold text-gray-900 dark:text-white">{dayLabel(selectedDaySummary.date)}</p>
                  <div className="flex items-center gap-2">
                    {selectedDaySummary.workoutLogged && (
                      <span className="text-xs bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400 font-semibold rounded-full px-2 py-0.5 border border-green-100 dark:border-green-800">💪 Workout</span>
                    )}
                    <button type="button" onClick={() => setSelectedDay(null)}
                      className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors">
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                        <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
                      </svg>
                    </button>
                  </div>
                </div>
                {hasData(selectedDaySummary) ? (
                  <div className="grid grid-cols-3 sm:grid-cols-5 gap-px bg-gray-100 dark:bg-gray-700 rounded-xl overflow-hidden border border-gray-100 dark:border-gray-700">
                    {[
                      { label: 'Calories', value: Math.round(selectedDaySummary.consumed?.calories || 0), unit: 'kcal', color: 'text-indigo-600 dark:text-indigo-400', bar: 'bg-indigo-400', goal: goals.calorieMax, min: goals.calorieMin, max: goals.calorieMax },
                      { label: 'Protein',  value: Math.round(selectedDaySummary.consumed?.protein  || 0), unit: 'g',    color: 'text-violet-600 dark:text-violet-400', bar: 'bg-violet-400', goal: goals.proteinMax, min: goals.proteinMin, max: goals.proteinMax },
                      { label: 'Carbs',    value: Math.round(selectedDaySummary.consumed?.carbs    || 0), unit: 'g',    color: 'text-amber-600 dark:text-amber-400',  bar: 'bg-amber-400',  goal: goals.carbsGoal },
                      { label: 'Fat',      value: Math.round(selectedDaySummary.consumed?.fat      || 0), unit: 'g',    color: 'text-orange-600 dark:text-orange-400', bar: 'bg-orange-400', goal: goals.fatGoal },
                      { label: 'Water',    value: Math.round(selectedDaySummary.water || 0),              unit: 'oz',   color: 'text-sky-600 dark:text-sky-400',    bar: 'bg-sky-400',    goal: goals.waterGoal },
                    ].map(({ label, value, unit, color, bar, goal, min, max }) => (
                      <div key={label} className="bg-white dark:bg-gray-800 px-3 py-3">
                        <p className="text-xs text-gray-400 dark:text-gray-500 mb-0.5">{label}</p>
                        <p className={`text-base font-bold ${color}`}>{value}<span className="text-xs font-normal text-gray-400 dark:text-gray-500 ml-0.5">{unit}</span></p>
                        {(goal || max) && (
                          <>
                            <GoalBar value={value} goal={goal || max} color={bar} />
                            <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                              {max ? `${pct(value, max)}%` : `${pct(value, goal)}%`}
                              {min ? ` · min ${min}` : goal ? ` of ${goal}` : ''}
                            </p>
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-gray-400 dark:text-gray-500">No data logged for this day.</p>
                )}
              </div>
            )}
          </div>

        </div>
      )}

    </div>
  )
}
