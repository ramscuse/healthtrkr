import { useState, useEffect, useCallback } from 'react'
import {
  logWorkout, getWorkoutHistory,
  getCustomExercises, createCustomExercise, deleteCustomExercise,
  getWorkoutPresets, createWorkoutPreset, updateWorkoutPreset, deleteWorkoutPreset,
} from '../lib/api.js'
import { EXERCISES, CATEGORIES } from '../data/exercises.js'

function getTodayString() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

function formatDateDisplay(dateStr) {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return dateStr
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' })
}

function toHumanLabel(splitDay) {
  if (!splitDay) return 'Workout'
  return splitDay.replace(/_/g, ' ').replace(/\+/g, ' + ').replace(/\b\w/g, c => c.toUpperCase())
}

const CATEGORY_COLORS = {
  'Upper Body Push': { dot: 'bg-indigo-500', text: 'text-indigo-600 dark:text-indigo-400', badge: 'bg-indigo-50 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300', tab: 'border-indigo-600 text-indigo-600 dark:border-indigo-400 dark:text-indigo-400' },
  'Upper Body Pull': { dot: 'bg-emerald-500', text: 'text-emerald-600 dark:text-emerald-400', badge: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300', tab: 'border-emerald-600 text-emerald-600 dark:border-emerald-400 dark:text-emerald-400' },
  'Lower Body':      { dot: 'bg-amber-500',   text: 'text-amber-600 dark:text-amber-400',   badge: 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',   tab: 'border-amber-600 text-amber-600 dark:border-amber-400 dark:text-amber-400' },
  'Core':            { dot: 'bg-violet-500',  text: 'text-violet-600 dark:text-violet-400',  badge: 'bg-violet-50 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300', tab: 'border-violet-600 text-violet-600 dark:border-violet-400 dark:text-violet-400' },
  'Cardio':          { dot: 'bg-rose-500',    text: 'text-rose-600 dark:text-rose-400',    badge: 'bg-rose-50 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300',     tab: 'border-rose-600 text-rose-600 dark:border-rose-400 dark:text-rose-400' },
}

function truncate(str, max) {
  if (!str) return ''
  return str.length > max ? str.slice(0, max) + '…' : str
}

const EMPTY_EX_FORM = { name: '', category: 'Upper Body Push', muscles: '' }

export default function Workouts() {
  const today = getTodayString()
  const [selectedDate, setSelectedDate] = useState(today)

  // Plan
  const [plan, setPlan]               = useState([])
  const [saving, setSaving]           = useState(false)
  const [saveError, setSaveError]     = useState('')
  const [saveSuccess, setSaveSuccess] = useState(false)

  // Save plan as preset
  const [saveAsPreset, setSaveAsPreset]           = useState(false)
  const [saveAsPresetName, setSaveAsPresetName]   = useState('')
  const [saveAsPresetErr, setSaveAsPresetErr]     = useState('')
  const [saveAsPresetSaving, setSaveAsPresetSaving] = useState(false)

  // Library
  const [activeCategory, setActiveCategory] = useState('All')

  // Custom exercises
  const [customExercises, setCustomExercises] = useState([])

  // Panel
  const [panelMode, setPanelMode]     = useState(null) // null | 'presets' | 'new-preset' | 'new-exercise'
  const [editingPreset, setEditingPreset] = useState(null) // preset object when editing

  // New exercise form
  const [exForm, setExForm]           = useState(EMPTY_EX_FORM)
  const [exSaving, setExSaving]       = useState(false)
  const [exError, setExError]         = useState('')

  // Presets
  const [presets, setPresets]         = useState([])
  const [presetsLoading, setPresetsLoading] = useState(false)

  // New/Edit preset form
  const [presetName, setPresetName]   = useState('')
  const [presetPlan, setPresetPlan]   = useState([])
  const [presetCategory, setPresetCategory] = useState('All')
  const [presetSaving, setPresetSaving] = useState(false)
  const [presetError, setPresetError] = useState('')

  // Quick log
  const [quickCategories, setQuickCategories] = useState(new Set())
  const [quickSaving, setQuickSaving] = useState(false)
  const [quickError, setQuickError]   = useState('')
  const [quickSuccess, setQuickSuccess] = useState(false)

  // History
  const [history, setHistory]         = useState([])
  const [historyLoading, setHistoryLoading] = useState(true)

  // Generator
  const [showGenerator, setShowGenerator] = useState(false)
  const [genEnabled, setGenEnabled]   = useState(new Set())
  const [genCounts, setGenCounts]     = useState({
    'Upper Body Push': 6, 'Upper Body Pull': 6, 'Lower Body': 6, 'Core': 3, 'Cardio': 1,
  })

  // Auto-dismiss banners
  useEffect(() => { if (saveSuccess)   { const t = setTimeout(() => setSaveSuccess(false),  4000); return () => clearTimeout(t) } }, [saveSuccess])
  useEffect(() => { if (quickSuccess)  { const t = setTimeout(() => setQuickSuccess(false), 4000); return () => clearTimeout(t) } }, [quickSuccess])

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true)
    try { const data = await getWorkoutHistory(20); setHistory(Array.isArray(data) ? data : []) }
    catch { setHistory([]) }
    finally { setHistoryLoading(false) }
  }, [])

  const loadCustomExercises = useCallback(async () => {
    try { const data = await getCustomExercises(); setCustomExercises(Array.isArray(data) ? data : []) }
    catch { setCustomExercises([]) }
  }, [])

  const loadPresets = useCallback(async () => {
    setPresetsLoading(true)
    try { const data = await getWorkoutPresets(); setPresets(Array.isArray(data) ? data : []) }
    catch { setPresets([]) }
    finally { setPresetsLoading(false) }
  }, [])

  useEffect(() => { loadHistory(); loadCustomExercises(); loadPresets() }, [loadHistory, loadCustomExercises, loadPresets])

  // All exercises merged (static + custom)
  const allExercises = [
    ...EXERCISES,
    ...customExercises.map(ce => ({
      id: ce.id,
      name: ce.name,
      category: ce.category,
      muscles: Array.isArray(ce.muscles) ? ce.muscles : [],
      isCustom: true,
      dbId: ce.id,
    })),
  ]

  // Plan helpers
  const planIds = new Set(plan.map(e => e.id))

  function toggleExercise(exercise) {
    if (planIds.has(exercise.id)) setPlan(prev => prev.filter(e => e.id !== exercise.id))
    else setPlan(prev => [...prev, exercise])
  }

  function removeExercise(id) { setPlan(prev => prev.filter(e => e.id !== id)) }
  function clearPlan() { setPlan([]); setSaveSuccess(false); setSaveError(''); setSaveAsPreset(false) }

  // Generator
  function toggleGenCategory(cat) {
    setGenEnabled(prev => { const n = new Set(prev); n.has(cat) ? n.delete(cat) : n.add(cat); return n })
  }

  function generateWorkout() {
    const picked = []
    for (const cat of CATEGORIES) {
      if (!genEnabled.has(cat)) continue
      const pool = allExercises.filter(e => e.category === cat)
      const count = Math.min(genCounts[cat] || 0, pool.length)
      picked.push(...[...pool].sort(() => Math.random() - 0.5).slice(0, count))
    }
    setPlan(picked)
    setShowGenerator(false)
  }

  // Save plan to calendar
  async function handleSavePlan() {
    if (!plan.length) return
    setSaving(true); setSaveError('')
    try {
      const cats = [...new Set(plan.map(e => e.category))]
      const splitDay = cats.length === 1 ? cats[0].toLowerCase().replace(/ /g, '_') : 'custom'
      await logWorkout({ date: selectedDate, splitDay, exercises: plan.map(e => ({ id: e.id, name: e.name, category: e.category, muscles: e.muscles })) })
      setSaveSuccess(true); loadHistory()
    } catch (err) { setSaveError(err.message || 'Failed to save.') }
    finally { setSaving(false) }
  }

  // Save plan as preset
  async function handleSaveAsPreset() {
    if (!saveAsPresetName.trim()) { setSaveAsPresetErr('Enter a preset name.'); return }
    setSaveAsPresetSaving(true); setSaveAsPresetErr('')
    try {
      await createWorkoutPreset({ name: saveAsPresetName.trim(), exercises: plan.map(e => ({ id: e.id, name: e.name, category: e.category, muscles: e.muscles })) })
      setSaveAsPreset(false); setSaveAsPresetName(''); loadPresets()
    } catch (err) { setSaveAsPresetErr(err.message || 'Failed to save preset.') }
    finally { setSaveAsPresetSaving(false) }
  }

  // Quick log
  function toggleQuickCategory(cat) {
    setQuickCategories(prev => { const n = new Set(prev); n.has(cat) ? n.delete(cat) : n.add(cat); return n })
  }

  async function handleQuickLog() {
    if (!quickCategories.size) return
    setQuickSaving(true); setQuickError('')
    try {
      const cats = [...quickCategories]
      const splitDay = cats.length === 1 ? cats[0].toLowerCase().replace(/ /g, '_') : cats.map(c => c.toLowerCase().replace(/ /g, '_')).join('+')
      await logWorkout({ date: selectedDate, splitDay, exercises: [] })
      setQuickCategories(new Set()); setQuickSuccess(true); loadHistory()
    } catch (err) { setQuickError(err.message || 'Failed to save.') }
    finally { setQuickSaving(false) }
  }

  // Custom exercise form
  async function handleCreateExercise() {
    if (!exForm.name.trim()) { setExError('Name is required.'); return }
    const muscles = exForm.muscles.split(',').map(m => m.trim()).filter(Boolean)
    if (!muscles.length) { setExError('Enter at least one muscle.'); return }
    setExSaving(true); setExError('')
    try {
      await createCustomExercise({ name: exForm.name.trim(), category: exForm.category, muscles })
      setExForm(EMPTY_EX_FORM); loadCustomExercises(); closePanel()
    } catch (err) { setExError(err.message || 'Failed to create.') }
    finally { setExSaving(false) }
  }

  async function handleDeleteCustomExercise(id) {
    try {
      await deleteCustomExercise(id)
      setCustomExercises(prev => prev.filter(e => e.id !== id))
      setPlan(prev => prev.filter(e => e.id !== id))
    } catch { /* swallow */ }
  }

  // Preset panel helpers
  function openPresetsPanel() {
    setEditingPreset(null)
    setPanelMode('presets')
  }

  function openNewPresetPanel(preset = null) {
    setEditingPreset(preset)
    setPresetName(preset ? preset.name : '')
    setPresetPlan(preset ? (Array.isArray(preset.exercises) ? preset.exercises : []) : [])
    setPresetCategory('All')
    setPresetError('')
    setPanelMode('new-preset')
  }

  function openNewExercisePanel() {
    setExForm(EMPTY_EX_FORM)
    setExError('')
    setPanelMode('new-exercise')
  }

  function closePanel() { setPanelMode(null) }

  const presetPlanIds = new Set(presetPlan.map(e => e.id))

  function togglePresetExercise(exercise) {
    if (presetPlanIds.has(exercise.id)) setPresetPlan(prev => prev.filter(e => e.id !== exercise.id))
    else setPresetPlan(prev => [...prev, exercise])
  }

  async function handleSavePreset() {
    if (!presetName.trim()) { setPresetError('Enter a preset name.'); return }
    setPresetSaving(true); setPresetError('')
    try {
      const payload = { name: presetName.trim(), exercises: presetPlan.map(e => ({ id: e.id, name: e.name, category: e.category, muscles: e.muscles })) }
      if (editingPreset) await updateWorkoutPreset(editingPreset.id, payload)
      else await createWorkoutPreset(payload)
      loadPresets()
      closePanel()
    } catch (err) { setPresetError(err.message || 'Failed to save.') }
    finally { setPresetSaving(false) }
  }

  async function handleDeletePreset(id) {
    try { await deleteWorkoutPreset(id); setPresets(prev => prev.filter(p => p.id !== id)) }
    catch { /* swallow */ }
  }

  function handleUsePreset(preset) {
    const exercises = Array.isArray(preset.exercises) ? preset.exercises : []
    setPlan(exercises)
    closePanel()
  }

  // Filtered library
  const visibleExercises = activeCategory === 'All' ? allExercises : allExercises.filter(e => e.category === activeCategory)
  const visiblePresetExercises = presetCategory === 'All' ? allExercises : allExercises.filter(e => e.category === presetCategory)

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Workout Planner</h1>
        <input
          type="date"
          value={selectedDate}
          max={today}
          onChange={e => setSelectedDate(e.target.value)}
          style={{ fontSize: '16px' }}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent dark:bg-gray-800 dark:border-gray-600 dark:text-white dark:placeholder-gray-500"
        />
      </div>

      {/* Today's Plan */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden dark:bg-gray-900 dark:border-gray-700">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-700">
          <h2 className="text-sm font-bold text-gray-900 dark:text-white">Today's Plan</h2>
          <div className="flex gap-2">
            <button type="button" onClick={openPresetsPanel}
              className="text-xs font-semibold text-violet-600 hover:text-violet-700 border border-violet-200 hover:border-violet-300 rounded-lg px-3 py-1.5 transition-colors dark:text-violet-400 dark:border-violet-700 dark:hover:border-violet-600">
              Presets
            </button>
            <button type="button" onClick={() => setShowGenerator(true)}
              className="text-xs font-semibold text-indigo-600 hover:text-indigo-700 border border-indigo-200 hover:border-indigo-300 rounded-lg px-3 py-1.5 transition-colors dark:text-indigo-400 dark:border-indigo-700 dark:hover:border-indigo-600">
              Generate
            </button>
            {plan.length > 0 && (
              <button type="button" onClick={clearPlan}
                className="text-xs font-semibold text-gray-500 hover:text-red-600 border border-gray-200 hover:border-red-200 rounded-lg px-3 py-1.5 transition-colors dark:text-gray-400 dark:border-gray-600 dark:hover:text-red-400 dark:hover:border-red-800">
                Clear
              </button>
            )}
          </div>
        </div>

        <div className="px-5 py-4">
          {plan.length === 0 ? (
            <p className="text-sm text-gray-400 dark:text-gray-500 py-2">Your plan is empty — browse exercises below to build your workout.</p>
          ) : (
            <ul className="space-y-2">
              {plan.map(exercise => {
                const colors = CATEGORY_COLORS[exercise.category] || {}
                return (
                  <li key={exercise.id} className="flex items-center gap-3">
                    <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${colors.dot || 'bg-gray-400'}`} />
                    <span className="text-sm font-semibold text-gray-900 dark:text-white flex-shrink-0">{exercise.name}</span>
                    <div className="flex flex-wrap gap-1 flex-1 min-w-0">
                      {exercise.muscles.map(m => (
                        <span key={m} className="rounded-full bg-gray-100 text-gray-500 text-xs px-2 py-0.5 dark:bg-gray-700 dark:text-gray-400">{m}</span>
                      ))}
                    </div>
                    <button type="button" onClick={() => removeExercise(exercise.id)} aria-label={`Remove ${exercise.name}`}
                      className="flex-shrink-0 text-gray-300 hover:text-red-500 transition-colors ml-2 dark:text-gray-600 dark:hover:text-red-400">
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                        <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
                      </svg>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        {plan.length > 0 && (
          <div className="px-5 pb-5 space-y-3">
            {saveError && <p className="text-sm text-red-600 dark:text-red-400">{saveError}</p>}
            {saveSuccess && (
              <div className="bg-green-50 border border-green-200 text-green-700 rounded-lg px-4 py-3 text-sm font-medium dark:bg-green-900/20 dark:border-green-800 dark:text-green-400">
                Workout saved to calendar. Nice work!
              </div>
            )}

            {/* Save as preset inline form */}
            {saveAsPreset ? (
              <div className="space-y-2">
                <input
                  type="text"
                  placeholder="Preset name..."
                  value={saveAsPresetName}
                  onChange={e => setSaveAsPresetName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSaveAsPreset()}
                  style={{ fontSize: '16px' }}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:bg-gray-800 dark:border-gray-600 dark:text-white dark:placeholder-gray-500"
                />
                {saveAsPresetErr && <p className="text-xs text-red-600 dark:text-red-400">{saveAsPresetErr}</p>}
                <div className="flex gap-2">
                  <button type="button" onClick={handleSaveAsPreset} disabled={saveAsPresetSaving}
                    className="flex-1 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white text-sm font-semibold rounded-lg px-3 py-2 transition-colors">
                    {saveAsPresetSaving ? 'Saving...' : 'Save Preset'}
                  </button>
                  <button type="button" onClick={() => { setSaveAsPreset(false); setSaveAsPresetName(''); setSaveAsPresetErr('') }}
                    className="border border-gray-200 hover:border-gray-300 text-gray-600 text-sm font-semibold rounded-lg px-3 py-2 transition-colors dark:border-gray-600 dark:hover:border-gray-500 dark:text-gray-300">
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button type="button" onClick={() => setSaveAsPreset(true)}
                className="w-full border border-violet-200 hover:border-violet-300 text-violet-600 hover:text-violet-700 text-sm font-semibold rounded-lg px-4 py-2.5 transition-colors dark:border-violet-700 dark:hover:border-violet-600 dark:text-violet-400 dark:hover:text-violet-300">
                Save Plan as Preset
              </button>
            )}

            <button type="button" onClick={handleSavePlan} disabled={saving}
              className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-semibold rounded-lg px-4 py-3 transition-colors">
              {saving ? 'Saving...' : 'Save to Calendar'}
            </button>
          </div>
        )}
      </div>

      {/* Quick Log by Category */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-5 space-y-4 dark:bg-gray-900 dark:border-gray-700">
        <div>
          <h2 className="text-sm font-bold text-gray-900 dark:text-white">Quick Log by Category</h2>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">Tap the categories you trained today without selecting individual exercises.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {CATEGORIES.map(cat => {
            const isSelected = quickCategories.has(cat)
            const colors = CATEGORY_COLORS[cat] || {}
            return (
              <button key={cat} type="button" onClick={() => toggleQuickCategory(cat)}
                className={['flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm font-semibold transition-all',
                  isSelected ? `${colors.badge} border-transparent` : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300 dark:bg-gray-800 dark:border-gray-600 dark:text-gray-300 dark:hover:border-gray-500'].join(' ')}>
                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${colors.dot || 'bg-gray-400'}`} />
                {cat}
              </button>
            )
          })}
        </div>
        {quickError && <p className="text-sm text-red-600 dark:text-red-400">{quickError}</p>}
        {quickSuccess && (
          <div className="bg-green-50 border border-green-200 text-green-700 rounded-lg px-4 py-3 text-sm font-medium dark:bg-green-900/20 dark:border-green-800 dark:text-green-400">
            Workout logged. Keep it up!
          </div>
        )}
        {quickCategories.size > 0 && (
          <button type="button" onClick={handleQuickLog} disabled={quickSaving}
            className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-semibold rounded-lg px-4 py-3 transition-colors">
            {quickSaving ? 'Saving...' : `Log ${[...quickCategories].join(', ')}`}
          </button>
        )}
      </div>

      {/* Exercise Library */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">Exercise Library</h2>
          <button type="button" onClick={openNewExercisePanel}
            className="text-xs font-semibold text-indigo-600 hover:text-indigo-700 border border-indigo-200 hover:border-indigo-300 rounded-lg px-3 py-1.5 transition-colors dark:text-indigo-400 dark:border-indigo-700 dark:hover:border-indigo-600">
            + Custom Exercise
          </button>
        </div>

        {/* Category tabs */}
        <div className="flex gap-0 border-b border-gray-200 dark:border-gray-700 mb-4 overflow-x-auto">
          {['All', ...CATEGORIES].map(cat => {
            const isActive = activeCategory === cat
            const colors = cat !== 'All' ? CATEGORY_COLORS[cat] : null
            return (
              <button key={cat} type="button" onClick={() => setActiveCategory(cat)}
                className={['px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 -mb-px transition-colors',
                  isActive && colors ? `${colors.tab} border-b-2` : isActive ? 'border-indigo-600 text-indigo-600 dark:border-indigo-400 dark:text-indigo-400' : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'].join(' ')}>
                {cat}
              </button>
            )
          })}
        </div>

        {/* Exercise grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {visibleExercises.map(exercise => {
            const isAdded = planIds.has(exercise.id)
            const colors = CATEGORY_COLORS[exercise.category] || {}
            return (
              <div key={exercise.id}
                className={['bg-white border rounded-xl p-4 cursor-pointer transition-all relative dark:bg-gray-900',
                  isAdded ? 'border-indigo-200 dark:border-indigo-800/50' : 'border-gray-200 hover:border-indigo-300 hover:shadow-sm dark:border-gray-700 dark:hover:border-indigo-700'].join(' ')}
                onClick={() => toggleExercise(exercise)}>
                {/* Custom delete button */}
                {exercise.isCustom && (
                  <button type="button"
                    onClick={e => { e.stopPropagation(); handleDeleteCustomExercise(exercise.dbId || exercise.id) }}
                    className="absolute top-2 right-2 text-gray-300 hover:text-red-500 transition-colors dark:text-gray-600 dark:hover:text-red-400"
                    aria-label="Delete custom exercise">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                      <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
                    </svg>
                  </button>
                )}
                <p className={`text-xs font-medium mb-1 ${colors.text || 'text-gray-500'}`}>{exercise.category}</p>
                {exercise.isCustom && (
                  <span className="inline-block text-xs font-medium bg-gray-100 text-gray-500 rounded px-1.5 py-0.5 mb-1 dark:bg-gray-700 dark:text-gray-400">Custom</span>
                )}
                <p className="text-sm font-semibold text-gray-900 dark:text-white leading-tight mb-2">{exercise.name}</p>
                <div className="flex flex-wrap gap-1 mb-3">
                  {exercise.muscles.map(m => (
                    <span key={m} className="rounded-full bg-gray-100 text-gray-500 text-xs px-2 py-0.5 dark:bg-gray-700 dark:text-gray-400">{m}</span>
                  ))}
                </div>
                {isAdded ? (
                  <span className="inline-block text-xs font-semibold rounded-full bg-indigo-50 text-indigo-700 px-2.5 py-0.5 hover:bg-red-50 hover:text-red-600 transition-colors cursor-pointer dark:bg-indigo-900/30 dark:text-indigo-300 dark:hover:bg-red-900/20 dark:hover:text-red-400">
                    ✓ Added — click to remove
                  </span>
                ) : (
                  <button type="button" onClick={e => { e.stopPropagation(); toggleExercise(exercise) }}
                    className="text-xs font-semibold text-indigo-600 hover:text-indigo-700 transition-colors dark:text-indigo-400 dark:hover:text-indigo-300">
                    + Add
                  </button>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Workout History */}
      <div>
        <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-3">Workout History</h2>
        {historyLoading ? (
          <div className="text-gray-400 dark:text-gray-500 text-sm animate-pulse">Loading history...</div>
        ) : history.length > 0 ? (
          <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden dark:bg-gray-900 dark:border-gray-700">
            <ul className="divide-y divide-gray-100 dark:divide-gray-700">
              {history.map((session, idx) => {
                const exerciseNames = Array.isArray(session.exercises) ? session.exercises.map(e => e.name).filter(Boolean).join(', ') : ''
                return (
                  <li key={session.id || idx} className="px-5 py-4">
                    <div className="flex items-baseline justify-between gap-4">
                      <p className="text-sm font-semibold text-gray-900 dark:text-white">{toHumanLabel(session.splitDay)}</p>
                      <span className="text-xs text-gray-400 dark:text-gray-500 flex-shrink-0">{formatDateDisplay(session.date)}</span>
                    </div>
                    {exerciseNames ? (
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                        {truncate(exerciseNames, 60)}
                        <span className="ml-1 text-gray-400 dark:text-gray-500">({session.exercises.length} exercise{session.exercises.length !== 1 ? 's' : ''})</span>
                      </p>
                    ) : (
                      <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">Category log — no exercises recorded</p>
                    )}
                  </li>
                )
              })}
            </ul>
          </div>
        ) : (
          <p className="text-sm text-gray-400 dark:text-gray-500">No workouts logged yet.</p>
        )}
      </div>

      {/* Random Workout Generator dialog */}
      {showGenerator && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 space-y-5 dark:bg-gray-800">
            <div>
              <h3 className="text-base font-bold text-gray-900 dark:text-white">Random Workout Generator</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Select the categories you want to train, then adjust the exercise count for each.</p>
            </div>

            {/* Step 1 — category toggles */}
            <div>
              <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-2">Categories</p>
              <div className="flex flex-wrap gap-2">
                {CATEGORIES.map(cat => {
                  const isOn = genEnabled.has(cat)
                  const colors = CATEGORY_COLORS[cat] || {}
                  return (
                    <button key={cat} type="button" onClick={() => toggleGenCategory(cat)}
                      className={['flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-semibold transition-all',
                        isOn ? `${colors.badge} border-transparent` : 'bg-white border-gray-200 text-gray-400 hover:border-gray-300 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-400 dark:hover:border-gray-500'].join(' ')}>
                      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${isOn ? colors.dot : 'bg-gray-300'}`} />
                      {cat}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Step 2 — counts for enabled categories */}
            {genEnabled.size > 0 && (
              <div>
                <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-2">Exercises per category</p>
                <div className="space-y-2">
                  {CATEGORIES.filter(cat => genEnabled.has(cat)).map(cat => {
                    const colors = CATEGORY_COLORS[cat] || {}
                    const pool = allExercises.filter(e => e.category === cat).length
                    return (
                      <div key={cat} className="flex items-center justify-between gap-4">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${colors.dot || 'bg-gray-400'}`} />
                          <span className={`text-sm font-medium ${colors.text || 'text-gray-700 dark:text-gray-200'}`}>{cat}</span>
                          <span className="text-xs text-gray-400 dark:text-gray-500">({pool} available)</span>
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <button type="button"
                            onClick={() => setGenCounts(prev => ({ ...prev, [cat]: Math.max(1, (prev[cat] || 1) - 1) }))}
                            className="w-7 h-7 rounded-lg border border-gray-200 hover:border-gray-300 text-gray-500 hover:text-gray-700 text-base font-bold flex items-center justify-center transition-colors dark:border-gray-600 dark:hover:border-gray-500 dark:text-gray-400 dark:hover:text-gray-200">
                            −
                          </button>
                          <span className="w-8 text-center text-sm font-semibold text-gray-900 dark:text-white">{genCounts[cat] ?? 1}</span>
                          <button type="button"
                            onClick={() => setGenCounts(prev => ({ ...prev, [cat]: Math.min(pool, (prev[cat] || 1) + 1) }))}
                            className="w-7 h-7 rounded-lg border border-gray-200 hover:border-gray-300 text-gray-500 hover:text-gray-700 text-base font-bold flex items-center justify-center transition-colors dark:border-gray-600 dark:hover:border-gray-500 dark:text-gray-400 dark:hover:text-gray-200">
                            +
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            <div className="flex gap-3 pt-1">
              <button type="button" onClick={generateWorkout} disabled={!genEnabled.size}
                className="flex-1 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white text-sm font-semibold rounded-lg px-4 py-2.5 transition-colors">
                Generate
              </button>
              <button type="button" onClick={() => setShowGenerator(false)}
                className="flex-1 border border-gray-200 hover:border-gray-300 text-gray-700 text-sm font-semibold rounded-lg px-4 py-2.5 transition-colors dark:border-gray-600 dark:hover:border-gray-500 dark:text-gray-200">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Slide-over Panel */}
      {panelMode && (
        <div className="fixed inset-0 z-40 flex">
          <div className="flex-1 bg-black/40" onClick={closePanel} />
          <div className="w-full max-w-md bg-white shadow-2xl flex flex-col h-full overflow-hidden dark:bg-gray-900">

            {/* Panel: Presets list */}
            {panelMode === 'presets' && (
              <>
                <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-700 flex-shrink-0">
                  <h2 className="text-base font-bold text-gray-900 dark:text-white">Workout Presets</h2>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => openNewPresetPanel()}
                      className="text-xs font-semibold text-indigo-600 hover:text-indigo-700 border border-indigo-200 hover:border-indigo-300 rounded-lg px-3 py-1.5 transition-colors dark:text-indigo-400 dark:border-indigo-700 dark:hover:border-indigo-600">
                      + New Preset
                    </button>
                    <button type="button" onClick={closePanel}
                      className="text-gray-400 hover:text-gray-600 transition-colors p-1 dark:text-gray-500 dark:hover:text-gray-300">
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                        <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
                      </svg>
                    </button>
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto p-5">
                  {presetsLoading ? (
                    <p className="text-sm text-gray-400 dark:text-gray-500 animate-pulse">Loading presets...</p>
                  ) : presets.length === 0 ? (
                    <div className="text-center py-12">
                      <p className="text-sm text-gray-400 dark:text-gray-500 mb-4">No workout presets yet.</p>
                      <button type="button" onClick={() => openNewPresetPanel()}
                        className="text-sm font-semibold text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300">
                        Create your first preset →
                      </button>
                    </div>
                  ) : (
                    <ul className="space-y-3">
                      {presets.map(preset => {
                        const exList = Array.isArray(preset.exercises) ? preset.exercises : []
                        const cats = [...new Set(exList.map(e => e.category))].filter(Boolean)
                        return (
                          <li key={preset.id} className="bg-gray-50 rounded-xl p-4 space-y-3 dark:bg-gray-800">
                            <div>
                              <p className="text-sm font-bold text-gray-900 dark:text-white">{preset.name}</p>
                              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                                {exList.length} exercise{exList.length !== 1 ? 's' : ''}
                                {cats.length > 0 && ` · ${cats.join(', ')}`}
                              </p>
                              {exList.length > 0 && (
                                <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">{truncate(exList.map(e => e.name).join(', '), 80)}</p>
                              )}
                            </div>
                            <div className="flex gap-2">
                              <button type="button" onClick={() => handleUsePreset(preset)}
                                className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-lg px-3 py-2 transition-colors">
                                Load to Plan
                              </button>
                              <button type="button" onClick={() => openNewPresetPanel(preset)}
                                className="border border-gray-200 hover:border-gray-300 text-gray-600 text-xs font-semibold rounded-lg px-3 py-2 transition-colors dark:border-gray-600 dark:hover:border-gray-500 dark:text-gray-300">
                                Edit
                              </button>
                              <button type="button" onClick={() => handleDeletePreset(preset.id)}
                                className="border border-red-100 hover:border-red-200 text-red-500 text-xs font-semibold rounded-lg px-3 py-2 transition-colors dark:border-red-900/50 dark:hover:border-red-800 dark:text-red-400">
                                Delete
                              </button>
                            </div>
                          </li>
                        )
                      })}
                    </ul>
                  )}
                </div>
              </>
            )}

            {/* Panel: New / Edit preset */}
            {panelMode === 'new-preset' && (
              <>
                <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-100 dark:border-gray-700 flex-shrink-0">
                  <button type="button" onClick={() => setPanelMode('presets')}
                    className="text-gray-400 hover:text-gray-600 transition-colors dark:text-gray-500 dark:hover:text-gray-300">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                      <path fillRule="evenodd" d="M11.78 5.22a.75.75 0 010 1.06L8.06 10l3.72 3.72a.75.75 0 11-1.06 1.06l-4.25-4.25a.75.75 0 010-1.06l4.25-4.25a.75.75 0 011.06 0z" clipRule="evenodd" />
                    </svg>
                  </button>
                  <h2 className="text-base font-bold text-gray-900 dark:text-white flex-1">{editingPreset ? 'Edit Preset' : 'New Preset'}</h2>
                  <button type="button" onClick={closePanel} className="text-gray-400 hover:text-gray-600 transition-colors p-1 dark:text-gray-500 dark:hover:text-gray-300">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                      <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
                    </svg>
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto p-5 space-y-4">
                  {/* Name */}
                  <input type="text" placeholder="Preset name..." value={presetName}
                    onChange={e => setPresetName(e.target.value)}
                    style={{ fontSize: '16px' }}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:bg-gray-800 dark:border-gray-600 dark:text-white dark:placeholder-gray-500" />

                  {/* Selected exercises */}
                  {presetPlan.length > 0 && (
                    <div className="bg-gray-50 rounded-xl p-3 space-y-1.5 dark:bg-gray-800">
                      <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
                        Selected ({presetPlan.length})
                      </p>
                      {presetPlan.map(e => {
                        const colors = CATEGORY_COLORS[e.category] || {}
                        return (
                          <div key={e.id} className="flex items-center gap-2">
                            <span className={`w-2 h-2 rounded-full flex-shrink-0 ${colors.dot || 'bg-gray-400'}`} />
                            <span className="text-sm text-gray-800 dark:text-gray-200 flex-1">{e.name}</span>
                            <button type="button" onClick={() => togglePresetExercise(e)}
                              className="text-gray-300 hover:text-red-500 transition-colors dark:text-gray-600 dark:hover:text-red-400">
                              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                                <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
                              </svg>
                            </button>
                          </div>
                        )
                      })}
                    </div>
                  )}

                  {/* Category tabs (mini) */}
                  <div className="flex gap-0 border-b border-gray-200 dark:border-gray-700 overflow-x-auto">
                    {['All', ...CATEGORIES].map(cat => {
                      const isActive = presetCategory === cat
                      const colors = cat !== 'All' ? CATEGORY_COLORS[cat] : null
                      return (
                        <button key={cat} type="button" onClick={() => setPresetCategory(cat)}
                          className={['px-3 py-2 text-xs font-medium whitespace-nowrap border-b-2 -mb-px transition-colors',
                            isActive && colors ? `${colors.tab}` : isActive ? 'border-indigo-600 text-indigo-600 dark:border-indigo-400 dark:text-indigo-400' : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'].join(' ')}>
                          {cat}
                        </button>
                      )
                    })}
                  </div>

                  {/* Exercise list (compact) */}
                  <div className="space-y-1.5">
                    {visiblePresetExercises.map(exercise => {
                      const isAdded = presetPlanIds.has(exercise.id)
                      const colors = CATEGORY_COLORS[exercise.category] || {}
                      return (
                        <div key={exercise.id}
                          className={['flex items-center gap-3 rounded-lg px-3 py-2.5 cursor-pointer border transition-all',
                            isAdded ? 'bg-indigo-50 border-indigo-200 dark:bg-indigo-900/20 dark:border-indigo-800/50' : 'bg-white border-gray-100 hover:border-indigo-200 hover:bg-gray-50 dark:bg-gray-800 dark:border-gray-700 dark:hover:border-indigo-700 dark:hover:bg-gray-700'].join(' ')}
                          onClick={() => togglePresetExercise(exercise)}>
                          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${colors.dot || 'bg-gray-400'}`} />
                          <span className="text-sm text-gray-800 dark:text-gray-200 flex-1">{exercise.name}</span>
                          {exercise.isCustom && <span className="text-xs text-gray-400 dark:text-gray-500">Custom</span>}
                          {isAdded && (
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-indigo-500 flex-shrink-0">
                              <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
                            </svg>
                          )}
                        </div>
                      )
                    })}
                  </div>

                  {presetError && <p className="text-sm text-red-600 dark:text-red-400">{presetError}</p>}
                </div>

                <div className="px-5 py-4 border-t border-gray-100 dark:border-gray-700 flex-shrink-0">
                  <button type="button" onClick={handleSavePreset} disabled={presetSaving}
                    className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-semibold rounded-lg px-4 py-3 transition-colors">
                    {presetSaving ? 'Saving...' : (editingPreset ? 'Update Preset' : 'Save Preset')}
                  </button>
                </div>
              </>
            )}

            {/* Panel: New custom exercise */}
            {panelMode === 'new-exercise' && (
              <>
                <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-700 flex-shrink-0">
                  <h2 className="text-base font-bold text-gray-900 dark:text-white">New Custom Exercise</h2>
                  <button type="button" onClick={closePanel} className="text-gray-400 hover:text-gray-600 transition-colors p-1 dark:text-gray-500 dark:hover:text-gray-300">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                      <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
                    </svg>
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto p-5 space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1.5">Exercise Name</label>
                    <input type="text" placeholder="e.g. Bulgarian Split Squat" value={exForm.name}
                      onChange={e => setExForm(f => ({ ...f, name: e.target.value }))}
                      style={{ fontSize: '16px' }}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:bg-gray-800 dark:border-gray-600 dark:text-white dark:placeholder-gray-500" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1.5">Category</label>
                    <select value={exForm.category} onChange={e => setExForm(f => ({ ...f, category: e.target.value }))}
                      style={{ fontSize: '16px' }}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:bg-gray-800 dark:border-gray-600 dark:text-white dark:placeholder-gray-500">
                      {CATEGORIES.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1.5">Muscles Targeted</label>
                    <input type="text" placeholder="e.g. Quads, Glutes, Hamstrings" value={exForm.muscles}
                      onChange={e => setExForm(f => ({ ...f, muscles: e.target.value }))}
                      style={{ fontSize: '16px' }}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:bg-gray-800 dark:border-gray-600 dark:text-white dark:placeholder-gray-500" />
                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Separate multiple muscles with commas</p>
                  </div>
                  {exError && <p className="text-sm text-red-600 dark:text-red-400">{exError}</p>}
                </div>
                <div className="px-5 py-4 border-t border-gray-100 dark:border-gray-700 flex-shrink-0">
                  <button type="button" onClick={handleCreateExercise} disabled={exSaving}
                    className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-semibold rounded-lg px-4 py-3 transition-colors">
                    {exSaving ? 'Saving...' : 'Create Exercise'}
                  </button>
                </div>
              </>
            )}

          </div>
        </div>
      )}

    </div>
  )
}
