import { useState } from 'react'
import { toast } from 'sonner'
import { X, ArrowLeft, Check, Plus, Minus, Trash2 } from 'lucide-react'
import {
  useWorkoutHistory,
  useCustomExercises,
  useCreateCustomExercise,
  useDeleteCustomExercise,
  useWorkoutPresets,
  useCreateWorkoutPreset,
  useUpdateWorkoutPreset,
  useDeleteWorkoutPreset,
  useLogWorkout,
} from '../hooks/useWorkouts.js'
import { EXERCISES, CATEGORIES } from '../data/exercises.js'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

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

// Per-category color coding (semantic — distinguishes muscle-group categories).
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

const SELECT_CLASS =
  'h-9 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30'

export default function Workouts() {
  const today = getTodayString()
  const [selectedDate, setSelectedDate] = useState(today)

  // Plan (local)
  const [plan, setPlan] = useState([])
  const [saveClientError, setSaveClientError] = useState('')

  // Save plan as preset (local)
  const [saveAsPreset, setSaveAsPreset] = useState(false)
  const [saveAsPresetName, setSaveAsPresetName] = useState('')
  const [saveAsPresetClientErr, setSaveAsPresetClientErr] = useState('')

  // Library (local)
  const [activeCategory, setActiveCategory] = useState('All')

  // Panel (local)
  const [panelMode, setPanelMode] = useState(null) // null | 'presets' | 'new-preset' | 'new-exercise'
  const [editingPreset, setEditingPreset] = useState(null)

  // New exercise form (local)
  const [exForm, setExForm] = useState(EMPTY_EX_FORM)
  const [exClientError, setExClientError] = useState('')

  // New/Edit preset form (local)
  const [presetName, setPresetName] = useState('')
  const [presetPlan, setPresetPlan] = useState([])
  const [presetCategory, setPresetCategory] = useState('All')
  const [presetClientError, setPresetClientError] = useState('')

  // Quick log (local)
  const [quickCategories, setQuickCategories] = useState(new Set())
  const [quickClientError, setQuickClientError] = useState('')

  // Generator (local)
  const [showGenerator, setShowGenerator] = useState(false)
  const [genEnabled, setGenEnabled] = useState(new Set())
  const [genCounts, setGenCounts] = useState({
    'Upper Body Push': 6, 'Upper Body Pull': 6, 'Lower Body': 6, 'Core': 3, 'Cardio': 1,
  })

  // ── Hooks: reads ──
  const historyQuery = useWorkoutHistory(20)
  const customExercisesQuery = useCustomExercises()
  const presetsQuery = useWorkoutPresets()

  // ── Hooks: mutations ──
  // Separate useLogWorkout instances for plan-save vs quick-log so their
  // isPending / error states don't collide.
  const logWorkoutMutation = useLogWorkout()
  const quickLogMutation = useLogWorkout()
  const createCustomExerciseMutation = useCreateCustomExercise()
  const deleteCustomExerciseMutation = useDeleteCustomExercise()
  const createWorkoutPresetMutation = useCreateWorkoutPreset()
  const updateWorkoutPresetMutation = useUpdateWorkoutPreset()
  const deleteWorkoutPresetMutation = useDeleteWorkoutPreset()
  // Separate instance for the "Save Plan as Preset" inline form.
  const saveAsPresetMutation = useCreateWorkoutPreset()

  // ── Derived ──
  const history = historyQuery.data || []
  const historyLoading = historyQuery.isPending
  const customExercises = customExercisesQuery.data || []
  const presets = presetsQuery.data || []
  const presetsLoading = presetsQuery.isPending

  const saving = logWorkoutMutation.isPending
  const saveError = saveClientError || (logWorkoutMutation.error && logWorkoutMutation.error.message) || ''

  const quickSaving = quickLogMutation.isPending
  const quickError = quickClientError || (quickLogMutation.error && quickLogMutation.error.message) || ''

  const exSaving = createCustomExerciseMutation.isPending
  const exError = exClientError
    || (createCustomExerciseMutation.error && createCustomExerciseMutation.error.message)
    || (deleteCustomExerciseMutation.error && deleteCustomExerciseMutation.error.message)
    || ''

  const presetSaving = createWorkoutPresetMutation.isPending || updateWorkoutPresetMutation.isPending
  const presetError = presetClientError
    || (createWorkoutPresetMutation.error && createWorkoutPresetMutation.error.message)
    || (updateWorkoutPresetMutation.error && updateWorkoutPresetMutation.error.message)
    || (deleteWorkoutPresetMutation.error && deleteWorkoutPresetMutation.error.message)
    || ''

  const saveAsPresetSaving = saveAsPresetMutation.isPending
  const saveAsPresetErr = saveAsPresetClientErr || (saveAsPresetMutation.error && saveAsPresetMutation.error.message) || ''

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
  function clearPlan() { setPlan([]); setSaveClientError(''); setSaveAsPreset(false) }

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
  function handleSavePlan() {
    if (!plan.length) return
    setSaveClientError('')
    const cats = [...new Set(plan.map(e => e.category))]
    const splitDay = cats.length === 1 ? cats[0].toLowerCase().replace(/ /g, '_') : 'custom'
    const payload = { date: selectedDate, splitDay, exercises: plan.map(e => ({ id: e.id, name: e.name, category: e.category, muscles: e.muscles })) }
    logWorkoutMutation.mutate(payload, {
      onSuccess: () => toast.success('Workout saved to calendar. Nice work!'),
    })
  }

  // Save plan as preset
  function handleSaveAsPreset() {
    if (!saveAsPresetName.trim()) { setSaveAsPresetClientErr('Enter a preset name.'); return }
    setSaveAsPresetClientErr('')
    const payload = { name: saveAsPresetName.trim(), exercises: plan.map(e => ({ id: e.id, name: e.name, category: e.category, muscles: e.muscles })) }
    saveAsPresetMutation.mutate(payload, {
      onSuccess: () => {
        setSaveAsPreset(false)
        setSaveAsPresetName('')
        toast.success('Plan saved as preset')
      },
    })
  }

  // Quick log
  function toggleQuickCategory(cat) {
    setQuickCategories(prev => { const n = new Set(prev); n.has(cat) ? n.delete(cat) : n.add(cat); return n })
  }

  function handleQuickLog() {
    if (!quickCategories.size) return
    setQuickClientError('')
    const cats = [...quickCategories]
    const splitDay = cats.length === 1 ? cats[0].toLowerCase().replace(/ /g, '_') : cats.map(c => c.toLowerCase().replace(/ /g, '_')).join('+')
    quickLogMutation.mutate({ date: selectedDate, splitDay, exercises: [] }, {
      onSuccess: () => {
        setQuickCategories(new Set())
        toast.success('Workout logged. Keep it up!')
      },
    })
  }

  // Custom exercise form
  function handleCreateExercise() {
    if (!exForm.name.trim()) { setExClientError('Name is required.'); return }
    const muscles = exForm.muscles.split(',').map(m => m.trim()).filter(Boolean)
    if (!muscles.length) { setExClientError('Enter at least one muscle.'); return }
    setExClientError('')
    createCustomExerciseMutation.mutate(
      { name: exForm.name.trim(), category: exForm.category, muscles },
      {
        onSuccess: () => {
          setExForm(EMPTY_EX_FORM)
          closePanel()
          toast.success('Custom exercise created')
        },
      },
    )
  }

  function handleDeleteCustomExercise(id) {
    deleteCustomExerciseMutation.mutate(id, {
      onSuccess: () => {
        // Keep local plan in sync — the deleted exercise can no longer be in it.
        setPlan(prev => prev.filter(e => e.id !== id))
      },
    })
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
    setPresetClientError('')
    setPanelMode('new-preset')
  }

  function openNewExercisePanel() {
    setExForm(EMPTY_EX_FORM)
    setExClientError('')
    setPanelMode('new-exercise')
  }

  function closePanel() { setPanelMode(null) }

  const presetPlanIds = new Set(presetPlan.map(e => e.id))

  function togglePresetExercise(exercise) {
    if (presetPlanIds.has(exercise.id)) setPresetPlan(prev => prev.filter(e => e.id !== exercise.id))
    else setPresetPlan(prev => [...prev, exercise])
  }

  function handleSavePreset() {
    if (!presetName.trim()) { setPresetClientError('Enter a preset name.'); return }
    setPresetClientError('')
    const payload = { name: presetName.trim(), exercises: presetPlan.map(e => ({ id: e.id, name: e.name, category: e.category, muscles: e.muscles })) }
    const onSuccess = () => { closePanel(); toast.success(editingPreset ? 'Preset updated' : 'Preset saved') }
    if (editingPreset) {
      updateWorkoutPresetMutation.mutate({ id: editingPreset.id, data: payload }, { onSuccess })
    } else {
      createWorkoutPresetMutation.mutate(payload, { onSuccess })
    }
  }

  function handleDeletePreset(id) {
    deleteWorkoutPresetMutation.mutate(id)
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
        <h1 className="text-2xl font-bold">Workout Planner</h1>
        <Input type="date" value={selectedDate} max={today} onChange={e => setSelectedDate(e.target.value)} className="w-auto" />
      </div>

      {/* Today's Plan */}
      <Card className="py-0 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="text-sm font-bold">Today's Plan</h2>
          <div className="flex gap-2">
            <Button type="button" variant="outline" size="sm" onClick={openPresetsPanel}>Presets</Button>
            <Button type="button" variant="outline" size="sm" onClick={() => setShowGenerator(true)}>Generate</Button>
            {plan.length > 0 && (
              <Button type="button" variant="outline" size="sm" onClick={clearPlan} className="text-muted-foreground hover:text-destructive">Clear</Button>
            )}
          </div>
        </div>

        <div className="px-5 py-4">
          {plan.length === 0 ? (
            <p className="text-sm text-muted-foreground py-2">Your plan is empty — browse exercises below to build your workout.</p>
          ) : (
            <ul className="space-y-2">
              {plan.map(exercise => {
                const colors = CATEGORY_COLORS[exercise.category] || {}
                return (
                  <li key={exercise.id} className="flex items-center gap-3">
                    <span className={cn('size-2.5 rounded-full shrink-0', colors.dot || 'bg-muted-foreground')} />
                    <span className="text-sm font-semibold shrink-0">{exercise.name}</span>
                    <div className="flex flex-wrap gap-1 flex-1 min-w-0">
                      {exercise.muscles.map(m => (
                        <span key={m} className="rounded-full bg-muted text-muted-foreground text-xs px-2 py-0.5">{m}</span>
                      ))}
                    </div>
                    <Button type="button" size="icon-sm" variant="ghost" onClick={() => removeExercise(exercise.id)} aria-label={`Remove ${exercise.name}`} className="shrink-0 text-muted-foreground hover:text-destructive">
                      <X />
                    </Button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        {plan.length > 0 && (
          <div className="px-5 pb-5 space-y-3">
            {saveError && <p className="text-sm text-destructive">{saveError}</p>}

            {/* Save as preset inline form */}
            {saveAsPreset ? (
              <div className="space-y-2">
                <Input
                  type="text"
                  placeholder="Preset name..."
                  value={saveAsPresetName}
                  onChange={e => setSaveAsPresetName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSaveAsPreset()}
                  className="h-9"
                />
                {saveAsPresetErr && <p className="text-xs text-destructive">{saveAsPresetErr}</p>}
                <div className="flex gap-2">
                  <Button type="button" onClick={handleSaveAsPreset} disabled={saveAsPresetSaving} className="flex-1">
                    {saveAsPresetSaving ? 'Saving...' : 'Save Preset'}
                  </Button>
                  <Button type="button" variant="outline" onClick={() => { setSaveAsPreset(false); setSaveAsPresetName(''); setSaveAsPresetClientErr('') }}>
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <Button type="button" variant="outline" onClick={() => setSaveAsPreset(true)} className="w-full text-primary border-primary/30 hover:border-primary hover:text-primary">
                Save Plan as Preset
              </Button>
            )}

            <Button type="button" onClick={handleSavePlan} disabled={saving} className="w-full h-10">
              {saving ? 'Saving...' : 'Save to Calendar'}
            </Button>
          </div>
        )}
      </Card>

      {/* Quick Log by Category */}
      <Card>
        <CardContent className="space-y-4">
          <div>
            <h2 className="text-sm font-bold">Quick Log by Category</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Tap the categories you trained today without selecting individual exercises.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {CATEGORIES.map(cat => {
              const isSelected = quickCategories.has(cat)
              const colors = CATEGORY_COLORS[cat] || {}
              return (
                <button key={cat} type="button" onClick={() => toggleQuickCategory(cat)}
                  className={cn('flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm font-semibold transition-colors',
                    isSelected ? `${colors.badge} border-transparent` : 'border-border text-muted-foreground hover:border-muted-foreground/40')}>
                  <span className={cn('size-2 rounded-full shrink-0', colors.dot || 'bg-muted-foreground')} />
                  {cat}
                </button>
              )
            })}
          </div>
          {quickError && <p className="text-sm text-destructive">{quickError}</p>}
          {quickCategories.size > 0 && (
            <Button type="button" onClick={handleQuickLog} disabled={quickSaving} className="w-full h-10">
              {quickSaving ? 'Saving...' : `Log ${[...quickCategories].join(', ')}`}
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Exercise Library */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Exercise Library</h2>
          <Button type="button" variant="outline" size="sm" onClick={openNewExercisePanel}>+ Custom Exercise</Button>
        </div>

        {/* Category tabs */}
        <div className="flex gap-0 border-b border-border mb-4 overflow-x-auto">
          {['All', ...CATEGORIES].map(cat => {
            const isActive = activeCategory === cat
            const colors = cat !== 'All' ? CATEGORY_COLORS[cat] : null
            return (
              <button key={cat} type="button" onClick={() => setActiveCategory(cat)}
                className={cn('px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 -mb-px transition-colors',
                  isActive && colors ? colors.tab : isActive ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground')}>
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
                className={cn('bg-card rounded-xl p-4 cursor-pointer transition-colors relative ring-1',
                  isAdded ? 'ring-primary/40' : 'ring-foreground/10 hover:ring-primary/30')}
                onClick={() => toggleExercise(exercise)}>
                {/* Custom delete button */}
                {exercise.isCustom && (
                  <button type="button"
                    onClick={e => { e.stopPropagation(); handleDeleteCustomExercise(exercise.dbId || exercise.id) }}
                    className="absolute top-2 right-2 text-muted-foreground hover:text-destructive transition-colors"
                    aria-label="Delete custom exercise">
                    <X className="size-3.5" />
                  </button>
                )}
                <p className={cn('text-xs font-medium mb-1', colors.text || 'text-muted-foreground')}>{exercise.category}</p>
                {exercise.isCustom && (
                  <span className="inline-block text-xs font-medium bg-muted text-muted-foreground rounded-sm px-1.5 py-0.5 mb-1">Custom</span>
                )}
                <p className="text-sm font-semibold leading-tight mb-2">{exercise.name}</p>
                <div className="flex flex-wrap gap-1 mb-3">
                  {exercise.muscles.map(m => (
                    <span key={m} className="rounded-full bg-muted text-muted-foreground text-xs px-2 py-0.5">{m}</span>
                  ))}
                </div>
                {isAdded ? (
                  <span className="inline-block text-xs font-semibold rounded-full bg-primary/10 text-primary px-2.5 py-0.5">
                    ✓ Added — click to remove
                  </span>
                ) : (
                  <button type="button" onClick={e => { e.stopPropagation(); toggleExercise(exercise) }}
                    className="text-xs font-semibold text-primary hover:underline">
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
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Workout History</h2>
        {historyLoading ? (
          <div className="space-y-2">
            {[0, 1, 2].map(i => <Skeleton key={i} className="h-16 rounded-xl" />)}
          </div>
        ) : history.length > 0 ? (
          <Card className="py-0 overflow-hidden">
            <ul className="divide-y divide-border">
              {history.map((session, idx) => {
                const exerciseNames = Array.isArray(session.exercises) ? session.exercises.map(e => e.name).filter(Boolean).join(', ') : ''
                return (
                  <li key={session.id || idx} className="px-5 py-4">
                    <div className="flex items-baseline justify-between gap-4">
                      <p className="text-sm font-semibold">{toHumanLabel(session.splitDay)}</p>
                      <span className="text-xs text-muted-foreground shrink-0">{formatDateDisplay(session.date)}</span>
                    </div>
                    {exerciseNames ? (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {truncate(exerciseNames, 60)}
                        <span className="ml-1 text-muted-foreground/70">({session.exercises.length} exercise{session.exercises.length !== 1 ? 's' : ''})</span>
                      </p>
                    ) : (
                      <p className="text-xs text-muted-foreground mt-0.5">Category log — no exercises recorded</p>
                    )}
                  </li>
                )
              })}
            </ul>
          </Card>
        ) : (
          <p className="text-sm text-muted-foreground">No workouts logged yet.</p>
        )}
      </div>

      {/* Random Workout Generator dialog */}
      <Dialog open={showGenerator} onOpenChange={setShowGenerator}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Random Workout Generator</DialogTitle>
            <DialogDescription>Select the categories you want to train, then adjust the exercise count for each.</DialogDescription>
          </DialogHeader>

          {/* Step 1 — category toggles */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Categories</p>
            <div className="flex flex-wrap gap-2">
              {CATEGORIES.map(cat => {
                const isOn = genEnabled.has(cat)
                const colors = CATEGORY_COLORS[cat] || {}
                return (
                  <button key={cat} type="button" onClick={() => toggleGenCategory(cat)}
                    className={cn('flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-semibold transition-colors',
                      isOn ? `${colors.badge} border-transparent` : 'border-border text-muted-foreground hover:border-muted-foreground/40')}>
                    <span className={cn('size-2 rounded-full shrink-0', isOn ? colors.dot : 'bg-muted-foreground/40')} />
                    {cat}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Step 2 — counts for enabled categories */}
          {genEnabled.size > 0 && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Exercises per category</p>
              <div className="space-y-2">
                {CATEGORIES.filter(cat => genEnabled.has(cat)).map(cat => {
                  const colors = CATEGORY_COLORS[cat] || {}
                  const pool = allExercises.filter(e => e.category === cat).length
                  return (
                    <div key={cat} className="flex items-center justify-between gap-4">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className={cn('size-2.5 rounded-full shrink-0', colors.dot || 'bg-muted-foreground')} />
                        <span className={cn('text-sm font-medium', colors.text || 'text-foreground')}>{cat}</span>
                        <span className="text-xs text-muted-foreground">({pool} available)</span>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <Button type="button" size="icon-sm" variant="outline"
                          onClick={() => setGenCounts(prev => ({ ...prev, [cat]: Math.max(1, (prev[cat] || 1) - 1) }))}
                          aria-label={`Fewer ${cat}`}>
                          <Minus />
                        </Button>
                        <span className="w-8 text-center text-sm font-semibold">{genCounts[cat] ?? 1}</span>
                        <Button type="button" size="icon-sm" variant="outline"
                          onClick={() => setGenCounts(prev => ({ ...prev, [cat]: Math.min(pool, (prev[cat] || 1) + 1) }))}
                          aria-label={`More ${cat}`}>
                          <Plus />
                        </Button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          <div className="flex gap-3 pt-1">
            <Button type="button" onClick={generateWorkout} disabled={!genEnabled.size} className="flex-1">Generate</Button>
            <Button type="button" variant="outline" onClick={() => setShowGenerator(false)} className="flex-1">Cancel</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Slide-over Panel */}
      <Sheet open={panelMode !== null} onOpenChange={(open) => { if (!open) closePanel() }}>
        <SheetContent className="w-full sm:max-w-md p-0 gap-0">

          {/* Panel: Presets list */}
          {panelMode === 'presets' && (
            <>
              <SheetHeader className="flex-row items-center justify-between border-b pr-12">
                <SheetTitle>Workout Presets</SheetTitle>
                <Button type="button" variant="outline" size="sm" onClick={() => openNewPresetPanel()}>+ New Preset</Button>
              </SheetHeader>
              <div className="flex-1 overflow-y-auto p-5">
                {presetsLoading ? (
                  <div className="space-y-3">{[0, 1].map(i => <Skeleton key={i} className="h-24 rounded-xl" />)}</div>
                ) : presets.length === 0 ? (
                  <div className="text-center py-12">
                    <p className="text-sm text-muted-foreground mb-4">No workout presets yet.</p>
                    <button type="button" onClick={() => openNewPresetPanel()} className="text-sm font-semibold text-primary hover:underline">
                      Create your first preset →
                    </button>
                  </div>
                ) : (
                  <ul className="space-y-3">
                    {presets.map(preset => {
                      const exList = Array.isArray(preset.exercises) ? preset.exercises : []
                      const cats = [...new Set(exList.map(e => e.category))].filter(Boolean)
                      return (
                        <li key={preset.id} className="bg-muted/50 rounded-xl p-4 space-y-3">
                          <div>
                            <p className="text-sm font-bold">{preset.name}</p>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {exList.length} exercise{exList.length !== 1 ? 's' : ''}
                              {cats.length > 0 && ` · ${cats.join(', ')}`}
                            </p>
                            {exList.length > 0 && (
                              <p className="text-xs text-muted-foreground/80 mt-1">{truncate(exList.map(e => e.name).join(', '), 80)}</p>
                            )}
                          </div>
                          <div className="flex gap-2">
                            <Button type="button" size="sm" onClick={() => handleUsePreset(preset)} className="flex-1">Load to Plan</Button>
                            <Button type="button" size="sm" variant="outline" onClick={() => openNewPresetPanel(preset)}>Edit</Button>
                            <Button type="button" size="sm" variant="outline" onClick={() => handleDeletePreset(preset.id)} className="text-destructive">Delete</Button>
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
              <SheetHeader className="flex-row items-center gap-3 border-b pr-12">
                <Button type="button" size="icon-sm" variant="ghost" onClick={() => setPanelMode('presets')} aria-label="Back to presets">
                  <ArrowLeft />
                </Button>
                <SheetTitle className="flex-1">{editingPreset ? 'Edit Preset' : 'New Preset'}</SheetTitle>
              </SheetHeader>
              <div className="flex-1 overflow-y-auto p-5 space-y-4">
                <Input type="text" placeholder="Preset name..." value={presetName} onChange={e => setPresetName(e.target.value)} className="h-9" />

                {/* Selected exercises */}
                {presetPlan.length > 0 && (
                  <div className="bg-muted/50 rounded-xl p-3 space-y-1.5">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Selected ({presetPlan.length})</p>
                    {presetPlan.map(e => {
                      const colors = CATEGORY_COLORS[e.category] || {}
                      return (
                        <div key={e.id} className="flex items-center gap-2">
                          <span className={cn('size-2 rounded-full shrink-0', colors.dot || 'bg-muted-foreground')} />
                          <span className="text-sm flex-1">{e.name}</span>
                          <button type="button" onClick={() => togglePresetExercise(e)} className="text-muted-foreground hover:text-destructive transition-colors">
                            <X className="size-3.5" />
                          </button>
                        </div>
                      )
                    })}
                  </div>
                )}

                {/* Category tabs (mini) */}
                <div className="flex gap-0 border-b border-border overflow-x-auto">
                  {['All', ...CATEGORIES].map(cat => {
                    const isActive = presetCategory === cat
                    const colors = cat !== 'All' ? CATEGORY_COLORS[cat] : null
                    return (
                      <button key={cat} type="button" onClick={() => setPresetCategory(cat)}
                        className={cn('px-3 py-2 text-xs font-medium whitespace-nowrap border-b-2 -mb-px transition-colors',
                          isActive && colors ? colors.tab : isActive ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground')}>
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
                        className={cn('flex items-center gap-3 rounded-lg px-3 py-2.5 cursor-pointer border transition-colors',
                          isAdded ? 'bg-primary/10 border-primary/30' : 'border-border hover:bg-accent')}
                        onClick={() => togglePresetExercise(exercise)}>
                        <span className={cn('size-2 rounded-full shrink-0', colors.dot || 'bg-muted-foreground')} />
                        <span className="text-sm flex-1">{exercise.name}</span>
                        {exercise.isCustom && <span className="text-xs text-muted-foreground">Custom</span>}
                        {isAdded && <Check className="size-4 text-primary shrink-0" />}
                      </div>
                    )
                  })}
                </div>

                {presetError && <p className="text-sm text-destructive">{presetError}</p>}
              </div>

              <div className="px-5 py-4 border-t border-border shrink-0">
                <Button type="button" onClick={handleSavePreset} disabled={presetSaving} className="w-full h-10">
                  {presetSaving ? 'Saving...' : (editingPreset ? 'Update Preset' : 'Save Preset')}
                </Button>
              </div>
            </>
          )}

          {/* Panel: New custom exercise */}
          {panelMode === 'new-exercise' && (
            <>
              <SheetHeader className="border-b pr-12">
                <SheetTitle>New Custom Exercise</SheetTitle>
              </SheetHeader>
              <div className="flex-1 overflow-y-auto p-5 space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="ex-name">Exercise Name</Label>
                  <Input id="ex-name" type="text" placeholder="e.g. Bulgarian Split Squat" value={exForm.name} onChange={e => setExForm(f => ({ ...f, name: e.target.value }))} className="h-9" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ex-category">Category</Label>
                  <select id="ex-category" value={exForm.category} onChange={e => setExForm(f => ({ ...f, category: e.target.value }))} className={SELECT_CLASS}>
                    {CATEGORIES.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ex-muscles">Muscles Targeted</Label>
                  <Input id="ex-muscles" type="text" placeholder="e.g. Quads, Glutes, Hamstrings" value={exForm.muscles} onChange={e => setExForm(f => ({ ...f, muscles: e.target.value }))} className="h-9" />
                  <p className="text-xs text-muted-foreground">Separate multiple muscles with commas</p>
                </div>
                {exError && <p className="text-sm text-destructive">{exError}</p>}
              </div>
              <div className="px-5 py-4 border-t border-border shrink-0">
                <Button type="button" onClick={handleCreateExercise} disabled={exSaving} className="w-full h-10">
                  {exSaving ? 'Saving...' : 'Create Exercise'}
                </Button>
              </div>
            </>
          )}

        </SheetContent>
      </Sheet>
    </div>
  )
}
