import { useState, useEffect, useRef, useCallback } from 'react'
import { useLocation } from 'react-router-dom'
import { getMeals, searchFood, getFoodDetail, addMeal, deleteMeal,
         getCustomFoods, createCustomFood, updateCustomFood, deleteCustomFood,
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

const EMPTY_CUSTOM_SERVING = {
  description: '1 serving',
  metricAmount: '',
  metricUnit: '',
  calories: '',
  protein: '',
  carbs: '',
  fat: '',
  fiber: '',
  sugar: '',
  sodium: '',
  saturatedFat: '',
  addedSugars: '',
  isDefault: true,
}

const EMPTY_CUSTOM_FOOD = {
  id: null,
  name: '',
  brandName: '',
  servings: [{ ...EMPTY_CUSTOM_SERVING }],
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

function defaultServingIdx(servings) {
  if (!Array.isArray(servings) || servings.length === 0) return 0
  const i = servings.findIndex(s => s.isDefault)
  return i >= 0 ? i : 0
}

// Build the food/serving payload used by POST /api/meals. For FatSecret foods
// the client only sends the FS ids — the server fetches the canonical
// nutrition data from FatSecret to avoid trusting client-supplied macros.
function buildLogPayload(chosen, servingIdx, quantity) {
  const serving = chosen.servings[servingIdx]
  if (chosen.source === 'custom') {
    return {
      food:    { source: 'custom' },
      serving: { source: 'custom', servingId: serving.id },
      quantity,
    }
  }
  return {
    food:    { source: 'fatsecret', fatSecretFoodId: chosen.fatSecretFoodId },
    serving: { source: 'fatsecret', fatSecretServingId: serving.fatSecretServingId ?? serving.servingId },
    quantity,
  }
}

// Convert a FatSecret search result into our "chosen food" shape (source='fatsecret').
function fsFoodToChosen(f) {
  return {
    source: 'fatsecret',
    fatSecretFoodId: f.foodId,
    foodName: f.foodName,
    brandName: f.brandName,
    foodType: f.foodType,
    foodUrl: f.foodUrl,
    servings: f.servings.map(s => ({
      ...s,
      fatSecretServingId: s.servingId,
    })),
  }
}

// Convert a custom food (from GET /custom-foods) into "chosen food" shape (source='custom').
function customFoodToChosen(f) {
  return {
    source: 'custom',
    customFoodId: f.id,
    foodName: f.name,
    brandName: f.brandName,
    foodType: f.foodType,
    servings: f.servings,
  }
}

function fmt(v, suffix = '') {
  if (v == null || !Number.isFinite(v)) return ''
  // Show one decimal for small numbers so e.g. 0.7g doesn't round to "1"
  const shown = Math.abs(v) < 10 ? Math.round(v * 10) / 10 : Math.round(v)
  return `${shown}${suffix}`
}

export default function Meals() {
  const today = getTodayString()
  const location = useLocation()

  // Page state
  const [date, setDate] = useState(today)
  const [meals, setMeals] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [deletingId, setDeletingId] = useState(null)
  const [saveAsMeal, setSaveAsMeal] = useState(null) // { mealType, name, saving, error } | null

  // Slide-over state
  const [slideOver, setSlideOver] = useState({ open: false, mealType: 'breakfast' })
  const [panelMode, setPanelMode] = useState('search')

  // Search panel state
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [searchLoading, setSearchLoading] = useState(false)
  const [searchError, setSearchError] = useState('')
  const debounceRef = useRef(null)

  // Log panel state — chosen food/serving + quantity
  const [chosenFood, setChosenFood] = useState(null) // {source, foodName, brandName, servings:[...]}
  const [chosenServingIdx, setChosenServingIdx] = useState(0)
  const [quantity, setQuantity] = useState(1)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')

  // Custom foods + custom-food editor state
  const [customFoods, setCustomFoods] = useState([])
  const [customFoodForm, setCustomFoodForm] = useState(EMPTY_CUSTOM_FOOD)
  const [customFoodError, setCustomFoodError] = useState('')
  const [savingCustomFood, setSavingCustomFood] = useState(false)
  const [deletingCustomFoodId, setDeletingCustomFoodId] = useState(null)
  const [customFoodAdvancedOpen, setCustomFoodAdvancedOpen] = useState({}) // { [servingIdx]: bool }

  // Preset state
  const [presets, setPresets] = useState([])
  const [loggingPresetId, setLoggingPresetId] = useState(null)
  const [deletingPresetId, setDeletingPresetId] = useState(null)
  const [presetForm, setPresetForm] = useState({ id: null, name: '', items: [] })
  const [presetSearchQuery, setPresetSearchQuery] = useState('')
  const [presetSearchResults, setPresetSearchResults] = useState([])
  const [presetSearchLoading, setPresetSearchLoading] = useState(false)
  const presetDebounceRef = useRef(null)
  const [presetPickFood, setPresetPickFood] = useState(null)   // chosen food while picking
  const [presetPickServingIdx, setPresetPickServingIdx] = useState(0)
  const [presetPickQuantity, setPresetPickQuantity] = useState(1)
  const [savingPreset, setSavingPreset] = useState(false)
  const [presetError, setPresetError] = useState('')

  // Goals state
  const [goals, setGoals]               = useState(null)
  const [goalsEditing, setGoalsEditing] = useState(false)
  const [goalsForm, setGoalsForm]       = useState({})
  const [goalsSaving, setGoalsSaving]   = useState(false)
  const [goalsError, setGoalsError]     = useState('')

  // ─── Loaders ─────────────────────────────────────────────────────────────
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

  useEffect(() => { loadMeals(date) }, [date, loadMeals])

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

  useEffect(() => {
    const openFor = location.state?.openFor
    if (openFor && MEAL_TYPES.includes(openFor) && !loading) {
      openSlideOver(openFor)
      window.history.replaceState({}, '')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading])

  const loadUserFoods = useCallback(async () => {
    try {
      const [foods, presetList] = await Promise.all([getCustomFoods(), getPresets()])
      setCustomFoods(foods || [])
      setPresets(presetList || [])
    } catch { /* non-critical */ }
  }, [])

  // ─── Slide-over open/close ──────────────────────────────────────────────
  function resetPanelState() {
    setSearchQuery('')
    setSearchResults([])
    setSearchError('')
    setChosenFood(null)
    setChosenServingIdx(0)
    setQuantity(1)
    setSubmitError('')
    setCustomFoodForm(EMPTY_CUSTOM_FOOD)
    setCustomFoodError('')
    setCustomFoodAdvancedOpen({})
    setPresetForm({ id: null, name: '', items: [] })
    setPresetSearchQuery('')
    setPresetSearchResults([])
    setPresetPickFood(null)
    setPresetPickServingIdx(0)
    setPresetPickQuantity(1)
    setPresetError('')
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

  // ─── Search ─────────────────────────────────────────────────────────────
  function handleSearchInput(e) {
    const q = e.target.value
    setSearchQuery(q)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (!q.trim()) { setSearchResults([]); return }
    debounceRef.current = setTimeout(async () => {
      if (q.trim().length < 2) { setSearchResults([]); return }
      setSearchLoading(true)
      setSearchError('')
      try {
        const data = await searchFood(q)
        setSearchResults(data?.foods || [])
      } catch (err) {
        setSearchResults([])
        setSearchError(err.message || 'Search failed.')
      } finally {
        setSearchLoading(false)
      }
    }, 700)
  }

  // Click a search result. Custom foods already include their servings inline;
  // FatSecret search hits are lightweight and need a separate food.get fetch
  // to materialize the full servings array.
  async function pickFoodForLog(food) {
    setSubmitError('')
    if (food.source === 'fatsecret' && (!food.servings || food.servings.length === 0)) {
      try {
        const detail = await getFoodDetail(food.fatSecretFoodId)
        if (!detail) throw new Error('Could not load food details.')
        const chosen = fsFoodToChosen(detail)
        setChosenFood(chosen)
        setChosenServingIdx(defaultServingIdx(chosen.servings))
      } catch (err) {
        setSearchError(err.message || 'Failed to load food details.')
        return
      }
    } else {
      setChosenFood(food)
      setChosenServingIdx(defaultServingIdx(food.servings))
    }
    setQuantity(1)
    setPanelMode('log')
  }

  // ─── Log a meal ─────────────────────────────────────────────────────────
  async function handleLogSubmit(e) {
    e.preventDefault()
    if (!chosenFood) return
    const q = Number(quantity)
    if (!Number.isFinite(q) || q <= 0) {
      setSubmitError('Quantity must be a positive number.')
      return
    }
    setSubmitting(true)
    setSubmitError('')
    try {
      const payload = {
        date,
        mealType: slideOver.mealType,
        ...buildLogPayload(chosenFood, chosenServingIdx, q),
      }
      await addMeal(payload)
      closeSlideOver()
      await loadMeals(date)
    } catch (err) {
      setSubmitError(err.message || 'Failed to add meal.')
    } finally {
      setSubmitting(false)
    }
  }

  // ─── Delete a meal entry ────────────────────────────────────────────────
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

  // ─── Custom-food editor ─────────────────────────────────────────────────
  function openCustomFoodEditor(existing = null) {
    if (existing) {
      setCustomFoodForm({
        id: existing.id,
        name: existing.name,
        brandName: existing.brandName ?? '',
        servings: existing.servings.map(s => ({
          id:           s.id,
          description:  s.description ?? '',
          metricAmount: s.metricAmount ?? '',
          metricUnit:   s.metricUnit ?? '',
          calories:     s.calories ?? '',
          protein:      s.protein ?? '',
          carbs:        s.carbs ?? '',
          fat:          s.fat ?? '',
          fiber:        s.fiber ?? '',
          sugar:        s.sugar ?? '',
          sodium:       s.sodium ?? '',
          saturatedFat: s.saturatedFat ?? '',
          addedSugars:  s.addedSugars ?? '',
          isDefault:    s.isDefault ?? false,
        })),
      })
    } else {
      setCustomFoodForm({ ...EMPTY_CUSTOM_FOOD, servings: [{ ...EMPTY_CUSTOM_SERVING }] })
    }
    setCustomFoodError('')
    setCustomFoodAdvancedOpen({})
    setPanelMode('custom-food')
  }

  function updateCustomFoodField(field, value) {
    setCustomFoodForm(prev => ({ ...prev, [field]: value }))
  }

  function updateCustomServingField(idx, field, value) {
    setCustomFoodForm(prev => {
      const servings = prev.servings.map((s, i) => i === idx ? { ...s, [field]: value } : s)
      return { ...prev, servings }
    })
  }

  function setCustomDefaultServing(idx) {
    setCustomFoodForm(prev => ({
      ...prev,
      servings: prev.servings.map((s, i) => ({ ...s, isDefault: i === idx })),
    }))
  }

  function addCustomServing() {
    setCustomFoodForm(prev => ({
      ...prev,
      servings: [...prev.servings, { ...EMPTY_CUSTOM_SERVING, isDefault: false }],
    }))
  }

  function removeCustomServing(idx) {
    setCustomFoodForm(prev => {
      if (prev.servings.length <= 1) return prev
      const servings = prev.servings.filter((_, i) => i !== idx)
      if (!servings.some(s => s.isDefault)) servings[0].isDefault = true
      return { ...prev, servings }
    })
  }

  function buildCustomFoodPayload() {
    return {
      name: customFoodForm.name.trim(),
      brandName: customFoodForm.brandName.trim() || null,
      servings: customFoodForm.servings.map(s => ({
        id: typeof s.id === 'string' ? s.id : null,
        description: s.description.trim(),
        metricAmount: s.metricAmount === '' ? null : Number(s.metricAmount),
        metricUnit:   s.metricUnit.trim() || null,
        isDefault:    s.isDefault === true,
        calories: Number(s.calories),
        protein:  Number(s.protein),
        carbs:    Number(s.carbs),
        fat:      Number(s.fat),
        fiber:        s.fiber        === '' ? null : Number(s.fiber),
        sugar:        s.sugar        === '' ? null : Number(s.sugar),
        sodium:       s.sodium       === '' ? null : Number(s.sodium),
        saturatedFat: s.saturatedFat === '' ? null : Number(s.saturatedFat),
        addedSugars:  s.addedSugars  === '' ? null : Number(s.addedSugars),
      })),
    }
  }

  async function handleSaveCustomFood() {
    if (!customFoodForm.name.trim()) { setCustomFoodError('Name is required.'); return }
    if (customFoodForm.servings.length === 0) { setCustomFoodError('Add at least one serving.'); return }
    for (const [i, s] of customFoodForm.servings.entries()) {
      if (!s.description.trim()) { setCustomFoodError(`Serving ${i + 1}: description is required.`); return }
      for (const field of ['calories', 'protein', 'carbs', 'fat']) {
        const n = Number(s[field])
        if (s[field] === '' || !Number.isFinite(n) || n < 0) {
          setCustomFoodError(`Serving ${i + 1}: ${field} is required and must be a non-negative number.`)
          return
        }
      }
    }
    setSavingCustomFood(true)
    setCustomFoodError('')
    try {
      const payload = buildCustomFoodPayload()
      if (customFoodForm.id) {
        await updateCustomFood(customFoodForm.id, payload)
      } else {
        await createCustomFood(payload)
      }
      await loadUserFoods()
      setPanelMode('search')
    } catch (err) {
      setCustomFoodError(err.message || 'Failed to save custom food.')
    } finally {
      setSavingCustomFood(false)
    }
  }

  async function handleDeleteCustomFood(id) {
    setDeletingCustomFoodId(id)
    try {
      await deleteCustomFood(id)
      setCustomFoods(prev => prev.filter(f => f.id !== id))
    } catch (err) {
      setSearchError(err.message || 'Could not delete food.')
    } finally {
      setDeletingCustomFoodId(null)
    }
  }

  // ─── Preset list actions ────────────────────────────────────────────────
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
    } catch (err) {
      setPresetError(err.message || 'Could not delete preset.')
    } finally {
      setDeletingPresetId(null)
    }
  }

  // ─── Preset editor ──────────────────────────────────────────────────────
  function openPresetEditor(existing = null) {
    if (existing) {
      setPresetForm({
        id: existing.id,
        name: existing.name,
        items: existing.items.map(it => ({
          servingId: it.servingId,
          quantity: it.quantity,
          foodName: it.foodName,
          servingDesc: it.servingDesc,
          caloriesPerServing: it.serving?.calories ?? 0,
        })),
      })
    } else {
      setPresetForm({ id: null, name: '', items: [] })
    }
    setPresetSearchQuery('')
    setPresetSearchResults([])
    setPresetPickFood(null)
    setPresetError('')
    setPanelMode('new-preset')
  }

  function handlePresetSearchInput(e) {
    const q = e.target.value
    setPresetSearchQuery(q)
    setPresetPickFood(null)
    if (presetDebounceRef.current) clearTimeout(presetDebounceRef.current)
    if (!q.trim()) { setPresetSearchResults([]); return }
    presetDebounceRef.current = setTimeout(async () => {
      if (q.trim().length < 2) { setPresetSearchResults([]); return }
      setPresetSearchLoading(true)
      try {
        const data = await searchFood(q)
        setPresetSearchResults(data?.foods || [])
      } catch {
        setPresetSearchResults([])
      } finally {
        setPresetSearchLoading(false)
      }
    }, 500)
  }

  function pickFoodForPreset(food) {
    setPresetPickFood(food)
    setPresetPickServingIdx(defaultServingIdx(food.servings))
    setPresetPickQuantity(1)
  }

  function addPickedFoodToPreset() {
    if (!presetPickFood) return
    const serving = presetPickFood.servings[presetPickServingIdx]
    if (!serving) return
    if (presetPickFood.source !== 'custom') {
      // FS picks need to be persisted to our DB so the preset can reference a real servingId.
      // We'll materialize at preset-save time via a placeholder + materialize step? Simpler:
      // require the user to log it once OR add an inline "save first" path. For now,
      // disallow adding FS foods directly — they must be saved to My Foods first.
      setPresetError('FatSecret foods must be saved to My Foods before they can be added to a preset.')
      return
    }
    setPresetError('')
    setPresetForm(prev => ({
      ...prev,
      items: [
        ...prev.items,
        {
          servingId: serving.id,
          quantity: presetPickQuantity,
          foodName: presetPickFood.foodName,
          servingDesc: serving.description,
          caloriesPerServing: serving.calories ?? 0,
        },
      ],
    }))
    setPresetPickFood(null)
    setPresetPickServingIdx(0)
    setPresetPickQuantity(1)
    setPresetSearchQuery('')
    setPresetSearchResults([])
  }

  function updatePresetItemQuantity(idx, value) {
    setPresetForm(prev => {
      const items = prev.items.map((it, i) => i === idx
        ? { ...it, quantity: Math.max(0.25, parseFloat(value) || 0.25) }
        : it)
      return { ...prev, items }
    })
  }

  function removePresetItem(idx) {
    setPresetForm(prev => ({ ...prev, items: prev.items.filter((_, i) => i !== idx) }))
  }

  async function handleSavePreset() {
    const name = presetForm.name.trim()
    if (!name) { setPresetError('Preset name is required.'); return }
    if (presetForm.items.length === 0) { setPresetError('Add at least one item.'); return }
    setSavingPreset(true)
    setPresetError('')
    try {
      const payload = {
        name,
        items: presetForm.items.map(it => ({ servingId: it.servingId, quantity: it.quantity })),
      }
      if (presetForm.id) {
        await updatePreset(presetForm.id, payload)
      } else {
        await createPreset(payload)
      }
      await loadUserFoods()
      setPanelMode('presets')
    } catch (err) {
      setPresetError(err.message || 'Failed to save preset.')
    } finally {
      setSavingPreset(false)
    }
  }

  // ─── Save current meal section as a preset ──────────────────────────────
  async function handleSaveMealAsPreset(items) {
    const name = saveAsMeal.name.trim()
    if (!name || !items.length) return
    setSaveAsMeal(prev => ({ ...prev, saving: true, error: '' }))
    try {
      const valid = items.filter(it => it.servingId)
      const dropped = items.length - valid.length
      if (valid.length === 0) throw new Error('No items reference a saved food — cannot save as preset.')
      const payload = {
        name,
        items: valid.map(it => ({ servingId: it.servingId, quantity: it.quantity ?? 1 })),
      }
      await createPreset(payload)
      setSaveAsMeal(null)
      await loadUserFoods()
      if (dropped > 0) {
        setError(`Saved preset, but ${dropped} item${dropped === 1 ? '' : 's'} could not be included (their food was deleted).`)
      }
    } catch (err) {
      setSaveAsMeal(prev => ({ ...prev, saving: false, error: err.message || 'Failed to save preset.' }))
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

  // ─── Panel renderers ────────────────────────────────────────────────────
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
            style={{ fontSize: '16px' }}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent dark:bg-gray-800 dark:border-gray-600 dark:text-white dark:placeholder-gray-500"
          />
        </div>

        {searchLoading && (
          <p className="text-xs text-gray-400 dark:text-gray-500 animate-pulse">Searching...</p>
        )}

        {searchError && (
          <p className="text-xs text-red-600">{searchError}</p>
        )}

        {!searchLoading && searchResults.length > 0 && (
          <ul className="divide-y divide-gray-100 dark:divide-gray-700 border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
            {searchResults.map((food) => {
              const p = food.defaultPreview
              return (
                <li key={food.foodId}>
                  <button
                    type="button"
                    onClick={() => pickFoodForLog({
                      source: 'fatsecret',
                      fatSecretFoodId: food.foodId,
                      foodName: food.foodName,
                      brandName: food.brandName,
                      foodType: food.foodType,
                      foodUrl: food.foodUrl,
                      servings: [],
                    })}
                    className="w-full text-left px-4 py-3 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-colors"
                  >
                    <p className="text-sm font-medium text-gray-900 dark:text-white">
                      {food.foodName}
                      {food.brandName ? <span className="text-gray-400 dark:text-gray-500"> · {food.brandName}</span> : null}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                      {p ? `Per ${p.description} · ${fmt(p.calories)} kcal · ${fmt(p.protein, 'g')} protein` : 'Tap to load servings'}
                    </p>
                  </button>
                </li>
              )
            })}
          </ul>
        )}

        {!searchLoading && searchQuery.trim() && searchResults.length === 0 && !searchError && (
          <p className="text-xs text-gray-400 dark:text-gray-500">No results found.</p>
        )}

        <button
          type="button"
          onClick={() => openCustomFoodEditor(null)}
          className="text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 transition-colors"
        >
          + Create custom food
        </button>

        <hr className="border-gray-200 dark:border-gray-700" />

        <div>
          <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">My Foods</h3>
          {customFoods.length === 0 ? (
            <p className="text-xs text-gray-400 dark:text-gray-500">No saved foods yet.</p>
          ) : (
            <ul className="divide-y divide-gray-100 dark:divide-gray-700 border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
              {customFoods.map(food => {
                const d = food.servings[defaultServingIdx(food.servings)]
                return (
                  <li key={food.id} className="flex items-center justify-between px-3 py-2.5 gap-2">
                    <button
                      type="button"
                      onClick={() => pickFoodForLog(customFoodToChosen(food))}
                      className="flex-1 min-w-0 text-left hover:bg-indigo-50 dark:hover:bg-indigo-900/20 rounded px-1 py-0.5 transition-colors"
                    >
                      <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{food.name}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {d ? `${d.description} · ${fmt(d.calories)} kcal · ${fmt(d.protein, 'g')} protein` : ''}
                        {food.servings.length > 1 ? ` · ${food.servings.length} servings` : ''}
                      </p>
                    </button>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button
                        type="button"
                        onClick={() => openCustomFoodEditor(food)}
                        aria-label={`Edit ${food.name}`}
                        className="w-7 h-7 flex items-center justify-center rounded-md text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                      >
                        <PencilIcon />
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
                )
              })}
            </ul>
          )}
        </div>
      </>
    )
  }

  function renderLogPanel() {
    if (!chosenFood) return null
    const serving = chosenFood.servings[chosenServingIdx]
    const q = Number(quantity) || 0
    const preview = {
      calories: (serving?.calories ?? 0) * q,
      protein:  (serving?.protein  ?? 0) * q,
      carbs:    (serving?.carbs    ?? 0) * q,
      fat:      (serving?.fat      ?? 0) * q,
    }
    return (
      <form onSubmit={handleLogSubmit} className="space-y-4">
        <div>
          <p className="text-sm font-semibold text-gray-900 dark:text-white">
            {chosenFood.foodName}
            {chosenFood.brandName ? <span className="text-gray-400 dark:text-gray-500 font-normal"> · {chosenFood.brandName}</span> : null}
          </p>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
            {chosenFood.source === 'custom' ? 'My Food' : 'FatSecret'}
          </p>
        </div>

        {chosenFood.servings.length > 1 ? (
          <div>
            <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Serving</label>
            <select
              value={chosenServingIdx}
              onChange={e => setChosenServingIdx(Number(e.target.value))}
              style={{ fontSize: '16px' }}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent dark:bg-gray-800 dark:border-gray-600 dark:text-white"
            >
              {chosenFood.servings.map((s, i) => (
                <option key={s.id ?? s.fatSecretServingId ?? i} value={i}>
                  {s.description} — {fmt(s.calories)} kcal
                </option>
              ))}
            </select>
          </div>
        ) : (
          <p className="text-xs text-gray-500 dark:text-gray-400">{serving?.description}</p>
        )}

        <div>
          <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Quantity</label>
          <input
            type="number"
            value={quantity}
            onChange={e => setQuantity(e.target.value)}
            min="0.25"
            step="0.25"
            inputMode="decimal"
            style={{ fontSize: '16px' }}
            className="w-32 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent dark:bg-gray-800 dark:border-gray-600 dark:text-white"
          />
        </div>

        <div className="grid grid-cols-4 gap-2 bg-gray-50 dark:bg-gray-800 rounded-lg p-3">
          <div className="text-center">
            <p className="text-base font-bold text-gray-900 dark:text-white">{fmt(preview.calories)}</p>
            <p className="text-[10px] text-gray-500 dark:text-gray-400 uppercase tracking-wider">kcal</p>
          </div>
          <div className="text-center">
            <p className="text-base font-bold text-indigo-600 dark:text-indigo-400">{fmt(preview.protein, 'g')}</p>
            <p className="text-[10px] text-gray-500 dark:text-gray-400 uppercase tracking-wider">protein</p>
          </div>
          <div className="text-center">
            <p className="text-base font-bold text-gray-900 dark:text-white">{fmt(preview.carbs, 'g')}</p>
            <p className="text-[10px] text-gray-500 dark:text-gray-400 uppercase tracking-wider">carbs</p>
          </div>
          <div className="text-center">
            <p className="text-base font-bold text-gray-900 dark:text-white">{fmt(preview.fat, 'g')}</p>
            <p className="text-[10px] text-gray-500 dark:text-gray-400 uppercase tracking-wider">fat</p>
          </div>
        </div>

        {submitError && <p className="text-xs text-red-600">{submitError}</p>}

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

  function renderCustomFoodPanel() {
    const f = customFoodForm
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setPanelMode('search')}
            className="w-7 h-7 flex items-center justify-center rounded-md text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
            aria-label="Back to search"
          >
            <BackIcon />
          </button>
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
            {f.id ? 'Edit Custom Food' : 'New Custom Food'}
          </h3>
        </div>

        <div className="grid grid-cols-1 gap-3">
          <div>
            <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">
              Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={f.name}
              onChange={e => updateCustomFoodField('name', e.target.value)}
              required
              style={{ fontSize: '16px' }}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent dark:bg-gray-800 dark:border-gray-600 dark:text-white"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Brand (optional)</label>
            <input
              type="text"
              value={f.brandName}
              onChange={e => updateCustomFoodField('brandName', e.target.value)}
              style={{ fontSize: '16px' }}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent dark:bg-gray-800 dark:border-gray-600 dark:text-white"
            />
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider">Servings</p>
            <button
              type="button"
              onClick={addCustomServing}
              className="text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 transition-colors"
            >
              + Add another serving
            </button>
          </div>

          {f.servings.map((s, idx) => (
            <div key={idx} className="border border-gray-200 dark:border-gray-700 rounded-lg p-3 space-y-3 bg-white dark:bg-gray-800">
              <div className="flex items-center justify-between gap-2">
                <label className="flex items-center gap-1.5 text-xs font-medium text-gray-600 dark:text-gray-300">
                  <input
                    type="radio"
                    name="defaultServing"
                    checked={s.isDefault}
                    onChange={() => setCustomDefaultServing(idx)}
                    className="accent-indigo-600"
                  />
                  Default
                </label>
                {f.servings.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeCustomServing(idx)}
                    aria-label="Remove serving"
                    className="w-6 h-6 flex items-center justify-center rounded text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-600 transition-colors"
                  >
                    <CloseIcon className="w-4 h-4" />
                  </button>
                )}
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-gray-500 dark:text-gray-400 mb-1">
                  Description <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={s.description}
                  onChange={e => updateCustomServingField(idx, 'description', e.target.value)}
                  placeholder="e.g. 1 scoop"
                  style={{ fontSize: '16px' }}
                  className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-semibold text-gray-500 dark:text-gray-400 mb-1">Metric amount</label>
                  <input
                    type="number"
                    value={s.metricAmount}
                    onChange={e => updateCustomServingField(idx, 'metricAmount', e.target.value)}
                    placeholder="e.g. 30"
                    min="0"
                    step="0.1"
                    inputMode="decimal"
                    style={{ fontSize: '16px' }}
                    className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-gray-500 dark:text-gray-400 mb-1">Unit</label>
                  <select
                    value={s.metricUnit}
                    onChange={e => updateCustomServingField(idx, 'metricUnit', e.target.value)}
                    style={{ fontSize: '16px' }}
                    className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                  >
                    <option value="">—</option>
                    <option value="g">g</option>
                    <option value="ml">ml</option>
                    <option value="oz">oz</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                {[
                  ['calories', 'Calories'],
                  ['protein',  'Protein (g)'],
                  ['carbs',    'Carbs (g)'],
                  ['fat',      'Fat (g)'],
                ].map(([key, label]) => (
                  <div key={key}>
                    <label className="block text-[11px] font-semibold text-gray-500 dark:text-gray-400 mb-1">
                      {label} <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="number"
                      value={s[key]}
                      onChange={e => updateCustomServingField(idx, key, e.target.value)}
                      required
                      min="0"
                      step="0.1"
                      inputMode="decimal"
                      style={{ fontSize: '16px' }}
                      className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                    />
                  </div>
                ))}
              </div>

              <button
                type="button"
                onClick={() => setCustomFoodAdvancedOpen(prev => ({ ...prev, [idx]: !prev[idx] }))}
                className="text-[11px] font-medium text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 transition-colors"
              >
                {customFoodAdvancedOpen[idx] ? 'Hide advanced nutrients' : 'Advanced nutrients (optional)'}
              </button>

              {customFoodAdvancedOpen[idx] && (
                <div className="grid grid-cols-2 gap-2">
                  {[
                    ['fiber',         'Fiber (g)'],
                    ['sugar',         'Sugar (g)'],
                    ['addedSugars',   'Added sugars (g)'],
                    ['saturatedFat',  'Sat. fat (g)'],
                    ['sodium',        'Sodium (mg)'],
                  ].map(([key, label]) => (
                    <div key={key}>
                      <label className="block text-[11px] font-semibold text-gray-500 dark:text-gray-400 mb-1">{label}</label>
                      <input
                        type="number"
                        value={s[key]}
                        onChange={e => updateCustomServingField(idx, key, e.target.value)}
                        min="0"
                        step="0.1"
                        inputMode="decimal"
                        style={{ fontSize: '16px' }}
                        className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>

        {customFoodError && <p className="text-xs text-red-600">{customFoodError}</p>}

        <button
          type="button"
          onClick={handleSaveCustomFood}
          disabled={savingCustomFood}
          className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-semibold rounded-lg px-4 py-2.5 transition-colors"
        >
          {savingCustomFood ? 'Saving...' : f.id ? 'Save Changes' : 'Save Custom Food'}
        </button>
      </div>
    )
  }

  function renderPresetsPanel() {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Meal Presets</h3>
          <button
            type="button"
            onClick={() => openPresetEditor(null)}
            className="text-xs font-medium bg-indigo-600 text-white px-3 py-1.5 rounded-md hover:bg-indigo-700 transition-colors"
          >
            + New Preset
          </button>
        </div>

        {presetError && <p className="text-xs text-red-600">{presetError}</p>}

        {presets.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-sm text-gray-400">No presets yet.</p>
            <p className="text-xs text-gray-400 mt-1">Create a preset to quickly log multiple foods at once.</p>
          </div>
        ) : (
          <ul className="space-y-2">
            {presets.map(preset => {
              const totalCal = preset.items.reduce((sum, it) => sum + ((it.serving?.calories ?? 0) * it.quantity), 0)
              return (
                <li key={preset.id} className="border border-gray-200 dark:border-gray-700 rounded-lg p-3">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">{preset.name}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                        {preset.items.length} item{preset.items.length !== 1 ? 's' : ''} · {fmt(totalCal)} kcal
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
                        onClick={() => openPresetEditor(preset)}
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
                          {item.quantity !== 1 ? `${item.quantity}× ` : ''}{item.foodName}
                          {item.servingDesc ? ` (${item.servingDesc})` : ''}
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
    const totalCal = presetForm.items.reduce((sum, it) => sum + (it.caloriesPerServing * it.quantity), 0)
    const pickServing = presetPickFood?.servings[presetPickServingIdx]

    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => { setPanelMode('presets'); setPresetError('') }}
            className="w-7 h-7 flex items-center justify-center rounded-md text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
            aria-label="Back to presets"
          >
            <BackIcon />
          </button>
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
            {presetForm.id ? 'Edit Preset' : 'New Preset'}
          </h3>
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">
            Preset Name <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={presetForm.name}
            onChange={e => setPresetForm(prev => ({ ...prev, name: e.target.value }))}
            placeholder="e.g. Morning Stack"
            style={{ fontSize: '16px' }}
            className="w-full border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-white bg-white dark:bg-gray-700 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">Add Item</label>
          <p className="text-[11px] text-gray-400 dark:text-gray-500 mb-2">
            Pick from My Foods (or search FatSecret — items must first be saved to My Foods to add to a preset).
          </p>
          <input
            type="text"
            value={presetSearchQuery}
            onChange={handlePresetSearchInput}
            placeholder="Search to add foods..."
            style={{ fontSize: '16px' }}
            className="w-full border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-white bg-white dark:bg-gray-700 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          />
        </div>

        {presetSearchLoading && (
          <p className="text-xs text-gray-400 animate-pulse">Searching...</p>
        )}

        {!presetSearchLoading && !presetPickFood && presetSearchResults.length > 0 && (
          <ul className="divide-y divide-gray-100 dark:divide-gray-700 border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
            {presetSearchResults.map(food => {
              const p = food.defaultPreview
              return (
                <li key={food.foodId} className="flex items-center justify-between px-3 py-2.5 gap-2 bg-white dark:bg-gray-800">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{food.foodName}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {p ? `Per ${p.description} · ${fmt(p.calories)} kcal · ${fmt(p.protein, 'g')} protein` : 'FatSecret food'}
                    </p>
                    <p className="text-[10px] text-amber-600 dark:text-amber-400 mt-0.5">Save to My Foods first to add to a preset.</p>
                  </div>
                </li>
              )
            })}
          </ul>
        )}

        {!presetPickFood && !presetSearchQuery.trim() && customFoods.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">My Foods</p>
            <ul className="divide-y divide-gray-100 dark:divide-gray-700 border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
              {customFoods.map(food => {
                const d = food.servings[defaultServingIdx(food.servings)]
                return (
                  <li key={food.id} className="flex items-center justify-between px-3 py-2.5 gap-2 bg-white dark:bg-gray-800">
                    <button
                      type="button"
                      onClick={() => pickFoodForPreset(customFoodToChosen(food))}
                      className="min-w-0 flex-1 text-left"
                    >
                      <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{food.name}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {d ? `${d.description} · ${fmt(d.calories)} kcal · ${fmt(d.protein, 'g')} protein` : ''}
                      </p>
                    </button>
                  </li>
                )
              })}
            </ul>
          </div>
        )}

        {presetPickFood && (
          <div className="border border-indigo-200 dark:border-indigo-700 bg-indigo-50/50 dark:bg-indigo-900/10 rounded-lg p-3 space-y-3">
            <p className="text-sm font-semibold text-gray-900 dark:text-white">{presetPickFood.foodName}</p>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[11px] font-semibold text-gray-500 dark:text-gray-400 mb-1">Serving</label>
                <select
                  value={presetPickServingIdx}
                  onChange={e => setPresetPickServingIdx(Number(e.target.value))}
                  style={{ fontSize: '16px' }}
                  className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                >
                  {presetPickFood.servings.map((s, i) => (
                    <option key={s.id ?? s.fatSecretServingId ?? i} value={i}>
                      {s.description}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-gray-500 dark:text-gray-400 mb-1">Quantity</label>
                <input
                  type="number"
                  value={presetPickQuantity}
                  onChange={e => setPresetPickQuantity(Math.max(0.25, parseFloat(e.target.value) || 0.25))}
                  min="0.25"
                  step="0.25"
                  inputMode="decimal"
                  style={{ fontSize: '16px' }}
                  className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                />
              </div>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {pickServing ? `${fmt((pickServing.calories ?? 0) * presetPickQuantity)} kcal total` : ''}
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={addPickedFoodToPreset}
                className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
              >
                Add to preset
              </button>
              <button
                type="button"
                onClick={() => setPresetPickFood(null)}
                className="text-xs font-medium text-gray-500 hover:text-gray-700 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider">Items in this preset</p>
            {presetForm.items.length > 0 && (
              <p className="text-xs text-gray-500 dark:text-gray-400">{fmt(totalCal)} kcal total</p>
            )}
          </div>
          {presetForm.items.length === 0 ? (
            <p className="text-xs text-gray-400 py-2">Search and add foods above.</p>
          ) : (
            <ul className="space-y-2">
              {presetForm.items.map((item, idx) => (
                <li key={idx} className="flex items-center gap-2 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 bg-white dark:bg-gray-800">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{item.foodName}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {item.servingDesc ? `${item.servingDesc} · ` : ''}{fmt(item.caloriesPerServing * item.quantity)} kcal
                    </p>
                  </div>
                  <input
                    type="number"
                    value={item.quantity}
                    onChange={e => updatePresetItemQuantity(idx, e.target.value)}
                    min="0.25"
                    step="0.25"
                    inputMode="decimal"
                    style={{ fontSize: '16px' }}
                    className="w-16 border border-gray-200 dark:border-gray-600 rounded px-2 py-1 text-xs text-gray-900 dark:text-white dark:bg-gray-700 text-center focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    aria-label={`Quantity for ${item.foodName}`}
                  />
                  <span className="text-xs text-gray-400 dark:text-gray-500">×</span>
                  <button
                    type="button"
                    onClick={() => removePresetItem(idx)}
                    aria-label={`Remove ${item.foodName}`}
                    className="w-6 h-6 flex items-center justify-center rounded text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-600 transition-colors"
                  >
                    <CloseIcon className="w-4 h-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {presetError && <p className="text-xs text-red-600">{presetError}</p>}

        <button
          type="button"
          onClick={handleSavePreset}
          disabled={savingPreset || !presetForm.name.trim() || presetForm.items.length === 0}
          className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-semibold rounded-lg px-4 py-2.5 transition-colors"
        >
          {savingPreset ? 'Saving...' : presetForm.id ? 'Save Changes' : 'Save Preset'}
        </button>
      </div>
    )
  }

  // ─── Render ─────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Meal Logger</h1>
        <input
          type="date"
          value={date}
          onChange={e => setDate(e.target.value)}
          style={{ fontSize: '16px' }}
          className="border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 text-sm text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
        />
      </div>

      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 rounded-xl p-4 text-sm">
          {error}
        </div>
      )}

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
                      inputMode="numeric"
                      style={{ fontSize: '16px' }}
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
          {MEAL_TYPES.map(mealType => {
            const items = meals?.[mealType] || []
            const subtotal = items.reduce((sum, item) => sum + (item.calories || 0), 0)

            return (
              <div key={mealType} className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-sm overflow-hidden">
                <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-700">
                  <h2 className="text-sm font-semibold text-gray-900 dark:text-white capitalize">{mealType}</h2>
                  <span className="text-sm text-gray-500 dark:text-gray-400">{fmt(subtotal)} kcal</span>
                </div>

                {items.length > 0 ? (
                  <ul className="divide-y divide-gray-50 dark:divide-gray-700">
                    {items.map(item => (
                      <li key={item.id} className="flex items-center justify-between px-5 py-3 gap-3">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">
                            {item.foodName}
                            {item.brandName ? <span className="text-gray-400 dark:text-gray-500 font-normal"> · {item.brandName}</span> : null}
                          </p>
                          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                            {item.quantity && item.quantity !== 1 ? `${item.quantity}× ` : ''}
                            {item.servingDesc ? `${item.servingDesc} · ` : ''}
                            {fmt(item.calories)} kcal · {fmt(item.protein, 'g')} protein · {fmt(item.carbs, 'g')} carbs · {fmt(item.fat, 'g')} fat
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
                        style={{ fontSize: '16px' }}
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
                    {saveAsMeal.error && <p className="text-xs text-red-600">{saveAsMeal.error}</p>}
                  </div>
                )}
              </div>
            )
          })}

          <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-sm px-5 py-4">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-3">Daily Totals</h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">{fmt(totals.calories || 0)}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Calories</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-indigo-600 dark:text-indigo-400">{fmt(totals.protein || 0, 'g')}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Protein</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">{fmt(totals.carbs || 0, 'g')}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Carbs</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">{fmt(totals.fat || 0, 'g')}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Fat</p>
              </div>
            </div>
          </div>
        </>
      )}

      {slideOver.open && (
        <div className="fixed inset-0 bg-black/40 z-40" onClick={closeSlideOver} aria-hidden="true" />
      )}

      <div
        className={`fixed inset-y-0 right-0 w-full sm:w-[420px] bg-white dark:bg-gray-900 shadow-xl z-50 flex flex-col transition-transform duration-300 ${
          slideOver.open ? 'translate-x-0' : 'translate-x-full'
        }`}
        aria-modal="true"
        role="dialog"
        aria-label="Add food panel"
      >
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
            <button
              onClick={closeSlideOver}
              aria-label="Close panel"
              className="w-8 h-8 flex items-center justify-center rounded-md text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
            >
              <CloseIcon />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-4">
          {panelMode === 'search'      && renderSearchPanel()}
          {panelMode === 'log'         && renderLogPanel()}
          {panelMode === 'custom-food' && renderCustomFoodPanel()}
          {panelMode === 'presets'     && renderPresetsPanel()}
          {panelMode === 'new-preset'  && renderNewPresetPanel()}
        </div>
      </div>
    </div>
  )
}
