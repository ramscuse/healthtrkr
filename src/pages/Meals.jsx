import { useState, useEffect, useRef, useCallback } from 'react'
import { useLocation } from 'react-router-dom'
import { getMeals, searchFood, addMeal, deleteMeal,
         getCustomFoods, createCustomFood, deleteCustomFood,
         getPresets, createPreset, updatePreset, deletePreset, logPreset,
         getGoals, updateGoals } from '../lib/api.js'

function getTodayString() {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const MEAL_TYPES = ['breakfast', 'lunch', 'dinner', 'snack']

const EMPTY_FORM = {
  foodName: '',
  calories: '',
  protein: '',
  carbs: '',
  fat: '',
  servings: 1,
}

function TrashIcon({ className = 'w-4 h-4' }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={className}>
      <path fillRule="evenodd" d="M8.75 1A2.75 2.75 0 006 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 10.23 1.482l.149-.022.841 10.518A2.75 2.75 0 007.596 19h4.807a2.75 2.75 0 002.742-2.53l.841-10.52.149.023a.75.75 0 00.23-1.482A41.03 41.03 0 0014 4.193V3.75A2.75 2.75 0 0011.25 1h-2.5zM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4zM8.58 7.72a.75.75 0 00-1.5.06l.3 7.5a.75.75 0 101.5-.06l-.3-7.5zm4.34.06a.75.75 0 10-1.5-.06l-.3 7.5a.75.75 0 101.5.06l.3-7.5z" clipRule="evenodd" />
    </svg>
  )
}

function CloseIcon({ className = 'w-5 h-5' }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={className}>
      <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
    </svg>
  )
}

function BackIcon({ className = 'w-4 h-4' }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={className}>
      <path fillRule="evenodd" d="M17 10a.75.75 0 01-.75.75H5.612l4.158 3.96a.75.75 0 11-1.04 1.08l-5.5-5.25a.75.75 0 010-1.08l5.5-5.25a.75.75 0 111.04 1.08L5.612 9.25H16.25A.75.75 0 0117 10z" clipRule="evenodd" />
    </svg>
  )
}

function Spinner({ className = 'w-3 h-3 border-2 border-current border-t-transparent' }) {
  return <span className={`${className} rounded-full animate-spin inline-block`} />
}

function PencilIcon({ className = 'w-4 h-4' }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={className}>
      <path d="M5.433 13.917l1.262-3.155A4 4 0 017.58 9.42l6.92-6.918a2.121 2.121 0 013 3l-6.92 6.918c-.383.383-.84.685-1.343.886l-3.154 1.262a.5.5 0 01-.65-.65z" />
      <path d="M3.5 5.75c0-.69.56-1.25 1.25-1.25H10A.75.75 0 0010 3H4.75A2.75 2.75 0 002 5.75v9.5A2.75 2.75 0 004.75 18h9.5A2.75 2.75 0 0017 15.25V10a.75.75 0 00-1.5 0v5.25c0 .69-.56 1.25-1.25 1.25h-9.5c-.69 0-1.25-.56-1.25-1.25v-9.5z" />
    </svg>
  )
}

export default function Meals() {
  const today = getTodayString()
  const location = useLocation()

  // Existing state
  const [date, setDate] = useState(today)
  const [meals, setMeals] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [slideOver, setSlideOver] = useState({ open: false, mealType: 'breakfast' })
  const [panelMode, setPanelMode] = useState('search')
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [searchLoading, setSearchLoading] = useState(false)
  const debounceRef = useRef(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [baseNutrients, setBaseNutrients] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [deletingId, setDeletingId] = useState(null)

  // New state
  const [customFoods, setCustomFoods] = useState([])
  const [presets, setPresets] = useState([])
  const [savingCustomFood, setSavingCustomFood] = useState(false)
  const [customFoodSaved, setCustomFoodSaved] = useState(false)
  const [deletingCustomFoodId, setDeletingCustomFoodId] = useState(null)
  const [loggingPresetId, setLoggingPresetId] = useState(null)
  const [deletingPresetId, setDeletingPresetId] = useState(null)
  const [newPreset, setNewPreset] = useState({ name: '', items: [] })
  const [presetSearchQuery, setPresetSearchQuery] = useState('')
  const [presetSearchResults, setPresetSearchResults] = useState([])
  const [presetSearchLoading, setPresetSearchLoading] = useState(false)
  const presetDebounceRef = useRef(null)
  const [savingPreset, setSavingPreset] = useState(false)
  const [presetError, setPresetError] = useState('')
  const [editingPreset, setEditingPreset] = useState(null) // { id } | null
  const [saveAsMeal, setSaveAsMeal] = useState(null) // { mealType, name, saving, error } | null

  // Goals state
  const [goals, setGoals]               = useState(null)
  const [goalsEditing, setGoalsEditing] = useState(false)
  const [goalsForm, setGoalsForm]       = useState({})
  const [goalsSaving, setGoalsSaving]   = useState(false)
  const [goalsError, setGoalsError]     = useState('')

  // Load meals
  const loadMeals = useCallback(async (dateStr) => {
    setLoading(true)
    setError('')
    try {
      const data = await getMeals(dateStr)
      setMeals(data)
    } catch (err) {
      setError(err.message || 'Failed to load meals.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadMeals(date)
  }, [date, loadMeals])

  useEffect(() => {
    getGoals().then(g => {
      setGoals(g)
      setGoalsForm({
        calorieMin: g.calorieMin ?? '',
        calorieMax: g.calorieMax ?? '',
        proteinMin: g.proteinMin ?? '',
        proteinMax: g.proteinMax ?? '',
        carbsGoal:  g.carbsGoal  ?? '',
        fatGoal:    g.fatGoal    ?? '',
      })
    }).catch(() => {})
  }, [])

  // Auto-open slide-over when navigated from Dashboard Quick Add
  useEffect(() => {
    const openFor = location.state?.openFor
    if (openFor && MEAL_TYPES.includes(openFor) && !loading) {
      openSlideOver(openFor)
      // Clear the state so re-renders don't re-open
      window.history.replaceState({}, '')
    }
  }, [loading])

  // Load custom foods and presets
  const loadUserFoods = useCallback(async () => {
    try {
      const [foods, presetList] = await Promise.all([getCustomFoods(), getPresets()])
      setCustomFoods(foods || [])
      setPresets(presetList || [])
    } catch { /* non-critical */ }
  }, [])

  async function handleSaveMealAsPreset(items) {
    const name = saveAsMeal.name.trim()
    if (!name || !items.length) return
    setSaveAsMeal(prev => ({ ...prev, saving: true, error: '' }))
    try {
      const presetItems = items.map(item => {
        const servings = item.servingSize || 1
        return {
          foodName: item.foodName,
          calories: item.calories / servings,
          protein:  item.protein  / servings,
          carbs:    item.carbs    / servings,
          fat:      item.fat      / servings,
          servings,
        }
      })
      await createPreset({ name, items: presetItems })
      setSaveAsMeal(null)
      loadUserFoods()
    } catch (err) {
      setSaveAsMeal(prev => ({ ...prev, saving: false, error: err.message || 'Failed to save preset.' }))
    }
  }

  function resetPanelState() {
    setSearchQuery('')
    setSearchResults([])
    setForm(EMPTY_FORM)
    setBaseNutrients(null)
    setSubmitError('')
    setCustomFoodSaved(false)
    setNewPreset({ name: '', items: [] })
    setPresetSearchQuery('')
    setPresetSearchResults([])
    setPresetError('')
    setEditingPreset(null)
  }

  function openSlideOver(mealType, initialMode = 'search') {
    setSlideOver({ open: true, mealType })
    setPanelMode(initialMode)
    resetPanelState()
    setSaveAsMeal(null)
    loadUserFoods()
  }

  function closeSlideOver() {
    setSlideOver(prev => ({ ...prev, open: false }))
    resetPanelState()
  }

  // Search in food-add panel
  function handleSearchInput(e) {
    const q = e.target.value
    setSearchQuery(q)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (!q.trim()) { setSearchResults([]); return }
    debounceRef.current = setTimeout(async () => {
      if (q.trim().length < 2) { setSearchResults([]); return }
      setSearchLoading(true)
      try {
        const results = await searchFood(q)
        setSearchResults(results?.products || [])
      } catch (err) {
        setSearchResults([])
        if (err.message?.includes('rate limit')) setSubmitError(err.message)
      } finally {
        setSearchLoading(false)
      }
    }, 700)
  }

  function selectSearchResult(result) {
    const base = {
      calories: result.calories ?? 0,
      protein: result.protein ?? 0,
      carbs: result.carbs ?? 0,
      fat: result.fat ?? 0,
    }
    setBaseNutrients(base)
    setForm({
      foodName: result.name || result.foodName || '',
      calories: String(base.calories),
      protein: String(base.protein),
      carbs: String(base.carbs),
      fat: String(base.fat),
      servings: 1,
    })
    setPanelMode('manual')
    setSubmitError('')
    setCustomFoodSaved(false)
  }

  function handleFormChange(e) {
    const { name, value } = e.target
    if (name === 'servings' && baseNutrients) {
      const n = Math.max(0, parseFloat(value) || 0)
      setForm(prev => ({
        ...prev,
        servings: value,
        calories: String(Math.round(baseNutrients.calories * n)),
        protein: String(Math.round(baseNutrients.protein * n * 10) / 10),
        carbs: String(Math.round(baseNutrients.carbs * n * 10) / 10),
        fat: String(Math.round(baseNutrients.fat * n * 10) / 10),
      }))
    } else {
      setForm(prev => ({ ...prev, [name]: value }))
    }
  }

  async function handleFormSubmit(e) {
    e.preventDefault()
    setSubmitting(true)
    setSubmitError('')
    try {
      await addMeal({
        date,
        mealType: slideOver.mealType,
        foodName: form.foodName,
        calories: Number(form.calories),
        protein: Number(form.protein),
        carbs: Number(form.carbs),
        fat: Number(form.fat),
        servingSize: Number(form.servings) || 1,
        servingUnit: 'serving',
      })
      closeSlideOver()
      await loadMeals(date)
    } catch (err) {
      setSubmitError(err.message || 'Failed to add meal.')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDelete(id) {
    setDeletingId(id)
    try {
      await deleteMeal(id)
      await loadMeals(date)
    } catch {
      await loadMeals(date)
    } finally {
      setDeletingId(null)
    }
  }

  // Save to My Foods
  async function handleSaveCustomFood() {
    if (!form.foodName) return
    setSavingCustomFood(true)
    try {
      const payload = {
        name: form.foodName,
        calories: baseNutrients ? baseNutrients.calories : Number(form.calories),
        protein:  baseNutrients ? baseNutrients.protein  : Number(form.protein),
        carbs:    baseNutrients ? baseNutrients.carbs    : Number(form.carbs),
        fat:      baseNutrients ? baseNutrients.fat      : Number(form.fat),
      }
      await createCustomFood(payload)
      setCustomFoodSaved(true)
      await loadUserFoods()
      setTimeout(() => setCustomFoodSaved(false), 2000)
    } catch (err) {
      if (err.message?.includes('already exists')) {
        setCustomFoodSaved(true)
        setTimeout(() => setCustomFoodSaved(false), 2000)
      }
    } finally {
      setSavingCustomFood(false)
    }
  }

  async function handleDeleteCustomFood(id) {
    setDeletingCustomFoodId(id)
    try {
      await deleteCustomFood(id)
      setCustomFoods(prev => prev.filter(f => f.id !== id))
    } catch { /* silent */ } finally {
      setDeletingCustomFoodId(null)
    }
  }

  // Preset logging
  async function handleLogPreset(presetId) {
    setLoggingPresetId(presetId)
    try {
      await logPreset(presetId, { date, mealType: slideOver.mealType })
      closeSlideOver()
      await loadMeals(date)
    } catch (err) {
      setPresetError(err.message || 'Failed to log preset.')
    } finally {
      setLoggingPresetId(null)
    }
  }

  async function handleDeletePreset(id) {
    setDeletingPresetId(id)
    try {
      await deletePreset(id)
      setPresets(prev => prev.filter(p => p.id !== id))
    } catch { /* silent */ } finally {
      setDeletingPresetId(null)
    }
  }

  // New preset food search
  function handlePresetSearchInput(e) {
    const q = e.target.value
    setPresetSearchQuery(q)
    if (presetDebounceRef.current) clearTimeout(presetDebounceRef.current)
    if (!q.trim()) { setPresetSearchResults([]); return }
    presetDebounceRef.current = setTimeout(async () => {
      if (q.trim().length < 2) { setPresetSearchResults([]); return }
      setPresetSearchLoading(true)
      try {
        const results = await searchFood(q)
        setPresetSearchResults(results?.products || [])
      } catch {
        setPresetSearchResults([])
      } finally {
        setPresetSearchLoading(false)
      }
    }, 500)
  }

  function addFoodToPreset(food) {
    setNewPreset(prev => {
      const existing = prev.items.findIndex(i => i.foodName === (food.name || food.foodName))
      if (existing >= 0) {
        const updated = [...prev.items]
        updated[existing] = { ...updated[existing], servings: updated[existing].servings + 1 }
        return { ...prev, items: updated }
      }
      return {
        ...prev,
        items: [...prev.items, {
          foodName: food.name || food.foodName,
          calories: food.calories ?? 0,
          protein: food.protein ?? 0,
          carbs: food.carbs ?? 0,
          fat: food.fat ?? 0,
          servings: 1,
        }],
      }
    })
  }

  function updatePresetItemServings(index, value) {
    setNewPreset(prev => {
      const updated = [...prev.items]
      updated[index] = { ...updated[index], servings: Math.max(0.25, parseFloat(value) || 0.25) }
      return { ...prev, items: updated }
    })
  }

  function removePresetItem(index) {
    setNewPreset(prev => ({ ...prev, items: prev.items.filter((_, i) => i !== index) }))
  }

  async function handleSavePreset() {
    if (!newPreset.name.trim() || newPreset.items.length === 0) return
    setSavingPreset(true)
    setPresetError('')
    try {
      await createPreset({ name: newPreset.name.trim(), items: newPreset.items })
      await loadUserFoods()
      setPanelMode('presets')
      setNewPreset({ name: '', items: [] })
      setPresetSearchQuery('')
      setPresetSearchResults([])
    } catch (err) {
      setPresetError(err.message || 'Failed to save preset.')
    } finally {
      setSavingPreset(false)
    }
  }

  function openEditPreset(preset) {
    setEditingPreset({ id: preset.id })
    setNewPreset({
      name: preset.name,
      items: preset.items.map(item => ({
        foodName: item.foodName,
        calories: item.calories,
        protein:  item.protein,
        carbs:    item.carbs,
        fat:      item.fat,
        servings: item.servings,
      })),
    })
    setPresetSearchQuery('')
    setPresetSearchResults([])
    setPresetError('')
    setPanelMode('new-preset')
  }

  async function handleUpdatePreset() {
    if (!newPreset.name.trim() || newPreset.items.length === 0) return
    setSavingPreset(true)
    setPresetError('')
    try {
      const updated = await updatePreset(editingPreset.id, { name: newPreset.name, items: newPreset.items })
      setPresets(prev => prev.map(p => p.id === editingPreset.id ? updated : p))
      setEditingPreset(null)
      setNewPreset({ name: '', items: [] })
      setPresetSearchQuery('')
      setPresetSearchResults([])
      setPanelMode('presets')
    } catch (err) {
      setPresetError(err.message || 'Failed to update preset.')
    } finally {
      setSavingPreset(false)
    }
  }

  async function handleSaveGoals() {
    setGoalsSaving(true); setGoalsError('')
    try {
      const payload = {
        calorieMin: Number(goalsForm.calorieMin) || null,
        calorieMax: Number(goalsForm.calorieMax) || null,
        proteinMin: Number(goalsForm.proteinMin) || null,
        proteinMax: Number(goalsForm.proteinMax) || null,
        carbsGoal:  Number(goalsForm.carbsGoal)  || null,
        fatGoal:    Number(goalsForm.fatGoal)    || null,
      }
      const updated = await updateGoals(payload)
      setGoals(updated)
      setGoalsEditing(false)
    } catch (err) {
      setGoalsError(err.message || 'Failed to save goals.')
    } finally {
      setGoalsSaving(false)
    }
  }

  const totals = meals?.totals || { calories: 0, protein: 0, carbs: 0, fat: 0 }

  // Panel content renderers
  function renderSearchPanel() {
    return (
      <>
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">Search food...</label>
          <input
            type="text"
            value={searchQuery}
            onChange={handleSearchInput}
            placeholder="e.g. chicken breast, banana"
            autoFocus
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent dark:bg-gray-800 dark:border-gray-600 dark:text-white dark:placeholder-gray-500"
          />
        </div>

        {searchLoading && (
          <p className="text-xs text-gray-400 dark:text-gray-500 animate-pulse">Searching...</p>
        )}

        {!searchLoading && searchResults.length > 0 && (
          <ul className="divide-y divide-gray-100 dark:divide-gray-700 border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
            {searchResults.map((result, idx) => (
              <li key={result.id || idx}>
                <button
                  type="button"
                  onClick={() => selectSearchResult(result)}
                  className="w-full text-left px-4 py-3 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-colors"
                >
                  <p className="text-sm font-medium text-gray-900 dark:text-white">{result.name || result.foodName}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                    {result.calories != null ? `${Math.round(result.calories)} kcal` : ''}
                    {result.protein != null ? ` · ${Math.round(result.protein)}g protein` : ''}
                  </p>
                </button>
              </li>
            ))}
          </ul>
        )}

        {!searchLoading && searchQuery.trim() && searchResults.length === 0 && (
          <p className="text-xs text-gray-400 dark:text-gray-500">No results found.</p>
        )}

        <button
          type="button"
          onClick={() => { setPanelMode('manual'); setForm(EMPTY_FORM); setBaseNutrients(null); setSubmitError('') }}
          className="text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 transition-colors"
        >
          Enter manually
        </button>

        {/* My Foods section */}
        <hr className="border-gray-200 dark:border-gray-700" />

        <div>
          <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">My Foods</h3>
          {customFoods.length === 0 ? (
            <p className="text-xs text-gray-400 dark:text-gray-500">No saved foods yet.</p>
          ) : (
            <ul className="divide-y divide-gray-100 dark:divide-gray-700 border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
              {customFoods.map(food => (
                <li key={food.id} className="flex items-center justify-between px-3 py-2.5 gap-2">
                  <button
                    type="button"
                    onClick={() => selectSearchResult({ name: food.name, calories: food.calories, protein: food.protein, carbs: food.carbs, fat: food.fat })}
                    className="flex-1 min-w-0 text-left hover:bg-indigo-50 dark:hover:bg-indigo-900/20 rounded px-1 py-0.5 transition-colors"
                  >
                    <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{food.name}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {Math.round(food.calories)} kcal &middot; {Math.round(food.protein)}g protein
                    </p>
                  </button>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      type="button"
                      onClick={() => selectSearchResult({ name: food.name, calories: food.calories, protein: food.protein, carbs: food.carbs, fat: food.fat })}
                      className="text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 px-2 py-1 rounded border border-indigo-200 hover:border-indigo-300 transition-colors"
                    >
                      Add
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteCustomFood(food.id)}
                      disabled={deletingCustomFoodId === food.id}
                      aria-label={`Delete ${food.name}`}
                      className="w-7 h-7 flex items-center justify-center rounded-md text-red-400 hover:bg-red-50 hover:text-red-600 transition-colors disabled:opacity-40"
                    >
                      {deletingCustomFoodId === food.id
                        ? <Spinner className="w-3 h-3 border-2 border-red-400 border-t-transparent" />
                        : <TrashIcon />}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </>
    )
  }

  function renderManualPanel() {
    return (
      <form onSubmit={handleFormSubmit} className="space-y-4">
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500 dark:text-gray-400">Meal:</span>
          <span className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 capitalize">{slideOver.mealType}</span>
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">
            Food Name <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            name="foodName"
            value={form.foodName}
            onChange={handleFormChange}
            required
            autoFocus
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent dark:bg-gray-800 dark:border-gray-600 dark:text-white dark:placeholder-gray-500"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">
              Calories <span className="text-red-500">*</span>
            </label>
            <input
              type="number"
              name="calories"
              value={form.calories}
              onChange={handleFormChange}
              required
              min="0"
              step="1"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent dark:bg-gray-800 dark:border-gray-600 dark:text-white"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">
              Protein (g) <span className="text-red-500">*</span>
            </label>
            <input
              type="number"
              name="protein"
              value={form.protein}
              onChange={handleFormChange}
              required
              min="0"
              step="0.1"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent dark:bg-gray-800 dark:border-gray-600 dark:text-white"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">
              Carbs (g) <span className="text-red-500">*</span>
            </label>
            <input
              type="number"
              name="carbs"
              value={form.carbs}
              onChange={handleFormChange}
              required
              min="0"
              step="0.1"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent dark:bg-gray-800 dark:border-gray-600 dark:text-white"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">
              Fat (g) <span className="text-red-500">*</span>
            </label>
            <input
              type="number"
              name="fat"
              value={form.fat}
              onChange={handleFormChange}
              required
              min="0"
              step="0.1"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent dark:bg-gray-800 dark:border-gray-600 dark:text-white"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Servings</label>
          <input
            type="number"
            name="servings"
            value={form.servings}
            onChange={handleFormChange}
            min="0.25"
            step="0.25"
            className="w-32 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent dark:bg-gray-800 dark:border-gray-600 dark:text-white"
          />
          {baseNutrients && (
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Macros update automatically as you change servings.</p>
          )}
        </div>

        {/* Save to My Foods */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleSaveCustomFood}
            disabled={savingCustomFood || !form.foodName}
            className="text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 disabled:opacity-40 transition-colors border border-indigo-200 hover:border-indigo-300 rounded px-2 py-1"
          >
            {savingCustomFood ? 'Saving...' : customFoodSaved ? 'Saved!' : 'Save to My Foods'}
          </button>
        </div>

        {submitError && (
          <p className="text-xs text-red-600">{submitError}</p>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-semibold rounded-lg px-4 py-2.5 transition-colors"
        >
          {submitting ? 'Adding...' : `Add to ${slideOver.mealType.charAt(0).toUpperCase() + slideOver.mealType.slice(1)}`}
        </button>

        <button
          type="button"
          onClick={() => { setPanelMode('search'); setSubmitError('') }}
          className="text-xs font-medium text-indigo-600 hover:text-indigo-700 transition-colors"
        >
          Back to search
        </button>
      </form>
    )
  }

  function renderPresetsPanel() {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Meal Presets</h3>
          <button
            type="button"
            onClick={() => { setPanelMode('new-preset'); setPresetError('') }}
            className="text-xs font-medium bg-indigo-600 text-white px-3 py-1.5 rounded-md hover:bg-indigo-700 transition-colors"
          >
            + New Preset
          </button>
        </div>

        {presetError && (
          <p className="text-xs text-red-600">{presetError}</p>
        )}

        {presets.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-sm text-gray-400">No presets yet.</p>
            <p className="text-xs text-gray-400 mt-1">Create a preset to quickly log multiple foods at once.</p>
          </div>
        ) : (
          <ul className="space-y-2">
            {presets.map(preset => {
              const totalCal = preset.items.reduce((sum, item) => sum + item.calories * item.servings, 0)
              return (
                <li key={preset.id} className="border border-gray-200 dark:border-gray-700 rounded-lg p-3">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">{preset.name}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                        {preset.items.length} food{preset.items.length !== 1 ? 's' : ''} &middot; {Math.round(totalCal)} kcal
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <button
                        type="button"
                        onClick={() => handleLogPreset(preset.id)}
                        disabled={loggingPresetId === preset.id}
                        className="bg-indigo-600 text-white text-xs px-3 py-1 rounded-md hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                      >
                        {loggingPresetId === preset.id ? 'Adding...' : 'Use'}
                      </button>
                      <button
                        type="button"
                        onClick={() => openEditPreset(preset)}
                        aria-label={`Edit preset ${preset.name}`}
                        className="w-7 h-7 flex items-center justify-center rounded-md text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                      >
                        <PencilIcon />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeletePreset(preset.id)}
                        disabled={deletingPresetId === preset.id}
                        aria-label={`Delete preset ${preset.name}`}
                        className="w-7 h-7 flex items-center justify-center rounded-md text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-600 transition-colors disabled:opacity-40"
                      >
                        {deletingPresetId === preset.id
                          ? <Spinner className="w-3 h-3 border-2 border-red-400 border-t-transparent" />
                          : <TrashIcon />}
                      </button>
                    </div>
                  </div>
                  {preset.items.length > 0 && (
                    <ul className="space-y-0.5">
                      {preset.items.map(item => (
                        <li key={item.id} className="text-xs text-gray-500 dark:text-gray-400 truncate">
                          {item.servings !== 1 ? `${item.servings}x ` : ''}{item.foodName}
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </div>
    )
  }

  function renderNewPresetPanel() {
    const presetTotalCal = newPreset.items.reduce((sum, item) => sum + item.calories * item.servings, 0)

    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => { setEditingPreset(null); setPanelMode('presets'); setPresetError('') }}
            className="w-7 h-7 flex items-center justify-center rounded-md text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
            aria-label="Back to presets"
          >
            <BackIcon />
          </button>
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
            {editingPreset ? 'Edit Preset' : 'New Preset'}
          </h3>
        </div>

        {/* Preset name */}
        <div>
          <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">
            Preset Name <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={newPreset.name}
            onChange={e => setNewPreset(prev => ({ ...prev, name: e.target.value }))}
            placeholder="e.g. Morning Stack"
            autoFocus
            className="w-full border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-white bg-white dark:bg-gray-700 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          />
        </div>

        {/* Food search for preset */}
        <div>
          <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">Add Food</label>
          <input
            type="text"
            value={presetSearchQuery}
            onChange={handlePresetSearchInput}
            placeholder="Search to add foods..."
            className="w-full border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-white bg-white dark:bg-gray-700 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          />
        </div>

        {presetSearchLoading && (
          <p className="text-xs text-gray-400 animate-pulse">Searching...</p>
        )}

        {!presetSearchLoading && presetSearchResults.length > 0 && (
          <ul className="divide-y divide-gray-100 dark:divide-gray-700 border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
            {presetSearchResults.map((result, idx) => (
              <li key={result.id || idx} className="flex items-center justify-between px-3 py-2.5 gap-2 bg-white dark:bg-gray-800">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{result.name || result.foodName}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {result.calories != null ? `${Math.round(result.calories)} kcal` : ''}
                    {result.protein != null ? ` · ${Math.round(result.protein)}g protein` : ''}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => addFoodToPreset(result)}
                  className="flex-shrink-0 w-6 h-6 flex items-center justify-center rounded-full bg-indigo-600 text-white text-sm font-bold hover:bg-indigo-700 transition-colors"
                  aria-label={`Add ${result.name || result.foodName} to preset`}
                >
                  +
                </button>
              </li>
            ))}
          </ul>
        )}

        {/* Also allow adding custom foods to preset */}
        {customFoods.length > 0 && !presetSearchQuery.trim() && (
          <div>
            <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">My Foods</p>
            <ul className="divide-y divide-gray-100 dark:divide-gray-700 border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
              {customFoods.map(food => (
                <li key={food.id} className="flex items-center justify-between px-3 py-2.5 gap-2 bg-white dark:bg-gray-800">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{food.name}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {Math.round(food.calories)} kcal &middot; {Math.round(food.protein)}g protein
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => addFoodToPreset({ name: food.name, calories: food.calories, protein: food.protein, carbs: food.carbs, fat: food.fat })}
                    className="flex-shrink-0 w-6 h-6 flex items-center justify-center rounded-full bg-indigo-600 text-white text-sm font-bold hover:bg-indigo-700 transition-colors"
                    aria-label={`Add ${food.name} to preset`}
                  >
                    +
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Items in preset */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider">
              Items in this preset
            </p>
            {newPreset.items.length > 0 && (
              <p className="text-xs text-gray-500 dark:text-gray-400">{Math.round(presetTotalCal)} kcal total</p>
            )}
          </div>
          {newPreset.items.length === 0 ? (
            <p className="text-xs text-gray-400 py-2">Search and add foods above.</p>
          ) : (
            <ul className="space-y-2">
              {newPreset.items.map((item, index) => (
                <li key={index} className="flex items-center gap-2 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 bg-white dark:bg-gray-800">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{item.foodName}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {Math.round(item.calories * item.servings)} kcal
                    </p>
                  </div>
                  <input
                    type="number"
                    value={item.servings}
                    onChange={e => updatePresetItemServings(index, e.target.value)}
                    min="0.25"
                    step="0.25"
                    className="w-16 border border-gray-200 dark:border-gray-600 rounded px-2 py-1 text-xs text-gray-900 dark:text-white dark:bg-gray-700 text-center focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    aria-label={`Servings for ${item.foodName}`}
                  />
                  <span className="text-xs text-gray-400 dark:text-gray-500">srv</span>
                  <button
                    type="button"
                    onClick={() => removePresetItem(index)}
                    className="w-6 h-6 flex items-center justify-center rounded text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-600 transition-colors"
                    aria-label={`Remove ${item.foodName}`}
                  >
                    <CloseIcon className="w-4 h-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {presetError && (
          <p className="text-xs text-red-600">{presetError}</p>
        )}

        <button
          type="button"
          onClick={editingPreset ? handleUpdatePreset : handleSavePreset}
          disabled={savingPreset || !newPreset.name.trim() || newPreset.items.length === 0}
          className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-semibold rounded-lg px-4 py-2.5 transition-colors"
        >
          {savingPreset ? 'Saving...' : editingPreset ? 'Save Changes' : 'Save Preset'}
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header + Date Picker */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Meal Logger</h1>
        <input
          type="date"
          value={date}
          onChange={e => setDate(e.target.value)}
          className="border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 text-sm text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
        />
      </div>

      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 rounded-xl p-4 text-sm">
          {error}
        </div>
      )}

      {/* Nutrition Goals */}
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-700">
          <h2 className="text-sm font-bold text-gray-900 dark:text-white">Nutrition Goals</h2>
          {!goalsEditing ? (
            <button type="button" onClick={() => setGoalsEditing(true)}
              className="text-xs font-semibold text-indigo-600 hover:text-indigo-700 border border-indigo-200 hover:border-indigo-300 rounded-lg px-3 py-1.5 transition-colors">
              Edit Goals
            </button>
          ) : (
            <div className="flex gap-2">
              <button type="button" onClick={handleSaveGoals} disabled={goalsSaving}
                className="text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 rounded-lg px-3 py-1.5 transition-colors">
                {goalsSaving ? 'Saving…' : 'Save'}
              </button>
              <button type="button" onClick={() => { setGoalsEditing(false); setGoalsError('') }}
                className="text-xs font-semibold text-gray-500 dark:text-gray-400 border border-gray-200 dark:border-gray-600 hover:border-gray-300 dark:hover:border-gray-500 rounded-lg px-3 py-1.5 transition-colors">
                Cancel
              </button>
            </div>
          )}
        </div>
        <div className="px-5 py-4">
          {goalsEditing ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              {[
                { key: 'calorieMin', label: 'Calorie Min', unit: 'kcal' },
                { key: 'calorieMax', label: 'Calorie Max', unit: 'kcal' },
                { key: 'proteinMin', label: 'Protein Min', unit: 'g' },
                { key: 'proteinMax', label: 'Protein Max', unit: 'g' },
                { key: 'carbsGoal',  label: 'Carbs Goal',  unit: 'g' },
                { key: 'fatGoal',    label: 'Fat Goal',    unit: 'g' },
              ].map(({ key, label, unit }) => (
                <div key={key}>
                  <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">{label}</label>
                  <div className="flex items-center gap-1">
                    <input type="number" min="0" value={goalsForm[key]}
                      onChange={e => setGoalsForm(f => ({ ...f, [key]: e.target.value }))}
                      className="w-full border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-white bg-white dark:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                    <span className="text-xs text-gray-400 dark:text-gray-500 flex-shrink-0">{unit}</span>
                  </div>
                </div>
              ))}
              {goalsError && <p className="col-span-full text-xs text-red-600">{goalsError}</p>}
            </div>
          ) : goals ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 text-center">
              {[
                { label: 'Cal Min',  value: goals.calorieMin, unit: 'kcal' },
                { label: 'Cal Max',  value: goals.calorieMax, unit: 'kcal' },
                { label: 'Protein Min', value: goals.proteinMin, unit: 'g' },
                { label: 'Protein Max', value: goals.proteinMax, unit: 'g' },
                { label: 'Carbs',    value: goals.carbsGoal,  unit: 'g' },
                { label: 'Fat',      value: goals.fatGoal,    unit: 'g' },
              ].map(({ label, value, unit }) => (
                <div key={label} className="bg-gray-50 dark:bg-gray-700 rounded-lg p-2">
                  <p className="text-xs text-gray-400 dark:text-gray-500 mb-0.5">{label}</p>
                  <p className="text-sm font-bold text-gray-900 dark:text-white">{value ?? '—'}<span className="text-xs font-normal text-gray-400 dark:text-gray-500 ml-0.5">{unit}</span></p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-400">Loading goals…</p>
          )}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-48">
          <div className="text-gray-400 text-sm animate-pulse">Loading meals...</div>
        </div>
      ) : (
        <>
          {/* Meal Sections */}
          {MEAL_TYPES.map(mealType => {
            const items = meals?.[mealType] || []
            const subtotal = items.reduce((sum, item) => sum + (item.calories || 0), 0)

            return (
              <div key={mealType} className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-sm overflow-hidden">
                {/* Section header */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-700">
                  <h2 className="text-sm font-semibold text-gray-900 dark:text-white capitalize">{mealType}</h2>
                  <span className="text-sm text-gray-500 dark:text-gray-400">{Math.round(subtotal)} kcal</span>
                </div>

                {/* Food items */}
                {items.length > 0 ? (
                  <ul className="divide-y divide-gray-50 dark:divide-gray-700">
                    {items.map(item => (
                      <li key={item.id} className="flex items-center justify-between px-5 py-3 gap-3">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">{item.foodName}</p>
                          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                            {item.servingSize && item.servingSize !== 1 ? `${item.servingSize} servings · ` : ''}
                            {Math.round(item.calories)} kcal
                            {' · '}
                            {Math.round(item.protein)}g protein
                            {' · '}
                            {Math.round(item.carbs)}g carbs
                            {' · '}
                            {Math.round(item.fat)}g fat
                          </p>
                        </div>
                        <button
                          onClick={() => handleDelete(item.id)}
                          disabled={deletingId === item.id}
                          aria-label={`Delete ${item.foodName}`}
                          className="flex-shrink-0 w-7 h-7 flex items-center justify-center rounded-md text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-600 transition-colors disabled:opacity-40"
                        >
                          {deletingId === item.id
                            ? <Spinner className="w-3 h-3 border-2 border-red-400 border-t-transparent" />
                            : <TrashIcon />}
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="px-5 py-3 text-sm text-gray-400 dark:text-gray-500">Nothing logged yet.</p>
                )}

                {/* Add food + Presets + Save as Preset buttons */}
                <div className="px-5 py-3 border-t border-gray-50 dark:border-gray-700 flex items-center gap-4">
                  <button
                    onClick={() => openSlideOver(mealType)}
                    className="text-sm font-medium text-indigo-600 hover:text-indigo-700 transition-colors"
                  >
                    + Add Food
                  </button>
                  <button
                    onClick={() => openSlideOver(mealType, 'presets')}
                    className="text-sm font-medium text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
                  >
                    Presets
                  </button>
                  {items.length > 0 && saveAsMeal?.mealType !== mealType && (
                    <button
                      onClick={() => setSaveAsMeal({ mealType, name: '', saving: false, error: '' })}
                      className="text-sm font-medium text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors ml-auto"
                    >
                      Save as Preset
                    </button>
                  )}
                </div>

                {/* Inline save-as-preset form */}
                {saveAsMeal?.mealType === mealType && (
                  <div className="px-5 py-3 border-t border-indigo-50 dark:border-indigo-900/30 bg-indigo-50/40 dark:bg-indigo-900/10 space-y-2">
                    <p className="text-xs font-semibold text-gray-600 dark:text-gray-400">Save "{mealType}" as a preset:</p>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={saveAsMeal.name}
                        onChange={e => setSaveAsMeal(prev => ({ ...prev, name: e.target.value }))}
                        onKeyDown={e => { if (e.key === 'Enter') handleSaveMealAsPreset(items); if (e.key === 'Escape') setSaveAsMeal(null) }}
                        placeholder="Preset name…"
                        autoFocus
                        className="flex-1 border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-1.5 text-sm text-gray-900 dark:text-white bg-white dark:bg-gray-700 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                      />
                      <button
                        onClick={() => handleSaveMealAsPreset(items)}
                        disabled={saveAsMeal.saving || !saveAsMeal.name.trim()}
                        className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
                      >
                        {saveAsMeal.saving ? <Spinner /> : 'Save'}
                      </button>
                      <button
                        onClick={() => setSaveAsMeal(null)}
                        className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 text-xs px-2 transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                    {saveAsMeal.error && (
                      <p className="text-xs text-red-600">{saveAsMeal.error}</p>
                    )}
                  </div>
                )}
              </div>
            )
          })}

          {/* Daily Totals */}
          <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-sm px-5 py-4">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-3">Daily Totals</h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">{Math.round(totals.calories || 0)}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Calories</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-indigo-600 dark:text-indigo-400">{Math.round(totals.protein || 0)}g</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Protein</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">{Math.round(totals.carbs || 0)}g</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Carbs</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">{Math.round(totals.fat || 0)}g</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Fat</p>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Slide-over overlay */}
      {slideOver.open && (
        <div
          className="fixed inset-0 bg-black/40 z-40"
          onClick={closeSlideOver}
          aria-hidden="true"
        />
      )}

      {/* Slide-over panel */}
      <div
        className={`fixed inset-y-0 right-0 w-full sm:w-[420px] bg-white dark:bg-gray-900 shadow-xl z-50 flex flex-col transition-transform duration-300 ${
          slideOver.open ? 'translate-x-0' : 'translate-x-full'
        }`}
        aria-modal="true"
        role="dialog"
        aria-label="Add food panel"
      >
        {/* Panel header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-white capitalize">
            {panelMode === 'presets' || panelMode === 'new-preset'
              ? slideOver.mealType.charAt(0).toUpperCase() + slideOver.mealType.slice(1)
              : `Add to ${slideOver.mealType}`}
          </h2>
          <div className="flex items-center gap-1">
            {panelMode === 'search' && (
              <button
                type="button"
                onClick={() => { setPanelMode('presets'); setPresetError('') }}
                className="text-xs font-medium text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 px-2 py-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors mr-1"
              >
                Presets
              </button>
            )}
            {panelMode === 'manual' && (
              <button
                type="button"
                onClick={() => setPanelMode('search')}
                className="w-8 h-8 flex items-center justify-center rounded-md text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                aria-label="Back to search"
              >
                <BackIcon className="w-4 h-4" />
              </button>
            )}
            <button
              onClick={closeSlideOver}
              aria-label="Close panel"
              className="w-8 h-8 flex items-center justify-center rounded-md text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
            >
              <CloseIcon />
            </button>
          </div>
        </div>

        {/* Panel body */}
        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-4">
          {panelMode === 'search' && renderSearchPanel()}
          {panelMode === 'manual' && renderManualPanel()}
          {panelMode === 'presets' && renderPresetsPanel()}
          {panelMode === 'new-preset' && renderNewPresetPanel()}
        </div>
      </div>
    </div>
  )
}
