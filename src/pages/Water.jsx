import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import { Trash2 } from 'lucide-react'
import { useWaterEntries, useLogWater, useDeleteWaterEntry } from '../hooks/useWater.js'
import { useGoals, useUpdateGoals } from '../hooks/useGoals.js'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'

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
  const [customAmt, setCustomAmt] = useState('')
  const [addClientError, setAddClientError] = useState('')

  const [goalEditing, setGoalEditing] = useState(false)
  const [goalInput, setGoalInput] = useState('')
  const [goalClientError, setGoalClientError] = useState('')

  const entriesQuery = useWaterEntries(selectedDate)
  const goalsQuery = useGoals()
  const logWaterMutation = useLogWater()
  const deleteWaterMutation = useDeleteWaterEntry()
  const updateGoalsMutation = useUpdateGoals()

  const entries = Array.isArray(entriesQuery.data) ? entriesQuery.data : []
  const loading = entriesQuery.isPending
  const total = entries.reduce((sum, e) => sum + e.amount, 0)
  const cups  = (total / 8).toFixed(1)
  const waterGoal = goalsQuery.data?.waterGoal ?? null

  // Sync the goal-editor input with the loaded goal (once it arrives, and
  // again whenever the persisted value changes from elsewhere). Skip while
  // the editor is open so a background refetch can't clobber the draft.
  useEffect(() => {
    if (goalEditing) return
    setGoalInput(waterGoal ?? '')
  }, [waterGoal, goalEditing])

  const adding = logWaterMutation.isPending
  const goalSaving = updateGoalsMutation.isPending
  const addError = addClientError
    || (logWaterMutation.error && logWaterMutation.error.message)
    || (deleteWaterMutation.error && deleteWaterMutation.error.message)
    || ''
  const goalError = goalClientError || (updateGoalsMutation.error && updateGoalsMutation.error.message) || ''

  function handleAdd(amount) {
    if (!amount || amount <= 0) return
    setAddClientError('')
    logWaterMutation.mutate(
      { date: selectedDate, amount },
      { onSuccess: () => toast.success(`Logged ${amount} oz`) },
    )
  }

  function handleDelete(id) {
    deleteWaterMutation.mutate(id, { onSuccess: () => toast.success('Entry removed') })
  }

  function handleSaveWaterGoal() {
    const n = parseFloat(goalInput)
    if (!n || n <= 0) { setGoalClientError('Enter a valid goal.'); return }
    setGoalClientError('')
    updateGoalsMutation.mutate(
      { waterGoal: n },
      { onSuccess: () => { setGoalEditing(false); toast.success('Water goal updated') } },
    )
  }

  function handleCustomAdd() {
    const n = parseFloat(customAmt)
    if (!n || n <= 0) { setAddClientError('Enter a valid amount.'); return }
    setCustomAmt('')
    handleAdd(n)
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold">Water</h1>
        <Input
          type="date"
          value={selectedDate}
          max={today}
          onChange={e => setSelectedDate(e.target.value)}
          className="w-auto"
        />
      </div>

      {/* Total card */}
      <Card className="bg-sky-500/10 ring-sky-500/20">
        <CardContent className="space-y-2">
          <div className="flex items-start justify-between">
            <p className="text-xs font-semibold uppercase tracking-wider text-sky-500">{selectedDate === today ? "Today's Intake" : selectedDate}</p>
            {!goalEditing ? (
              <button type="button" onClick={() => setGoalEditing(true)}
                className="text-xs font-semibold text-sky-500 hover:underline">
                {waterGoal ? `Goal: ${waterGoal} oz` : 'Set goal'}
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <Input type="number" min="1" value={goalInput} onChange={e => { setGoalInput(e.target.value); setGoalClientError('') }}
                  inputMode="numeric" className="w-20 h-7" />
                <span className="text-xs text-sky-500">oz</span>
                <Button type="button" size="sm" onClick={handleSaveWaterGoal} disabled={goalSaving}>
                  {goalSaving ? '…' : 'Save'}
                </Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => { setGoalEditing(false); setGoalInput(waterGoal ?? ''); setGoalClientError('') }}>✕</Button>
              </div>
            )}
          </div>
          {goalError && <p className="text-xs text-destructive">{goalError}</p>}
          <div className="text-center my-2">
            <p className="text-6xl font-bold text-sky-500 leading-none">{Math.round(total)}</p>
            <p className="text-base text-sky-500/80 mt-1 font-medium">oz &nbsp;·&nbsp; {cups} cups</p>
          </div>
          {waterGoal && waterGoal > 0 && (
            <div>
              <div className="flex justify-between text-xs text-sky-500 mb-1">
                <span>{Math.round((total / waterGoal) * 100)}% of goal</span>
                <span>{Math.round(Math.max(0, waterGoal - total))} oz remaining</span>
              </div>
              <div className="w-full bg-sky-500/15 rounded-full h-2">
                <div className="bg-sky-500 h-2 rounded-full transition-all"
                  style={{ width: `${Math.min(100, (total / waterGoal) * 100)}%` }} />
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Quick Add presets */}
      <Card>
        <CardContent className="space-y-4">
          <h2 className="text-sm font-bold">Quick Add</h2>
          <div className="grid grid-cols-5 gap-2">
            {PRESETS.map(oz => (
              <button key={oz} type="button" onClick={() => handleAdd(oz)} disabled={adding}
                className="flex flex-col items-center justify-center bg-sky-500/10 hover:bg-sky-500/20 border border-sky-500/20 rounded-xl py-3 transition-colors disabled:opacity-50">
                <span className="text-lg font-bold text-sky-500">{oz}</span>
                <span className="text-xs text-sky-500/80 font-medium">oz</span>
              </button>
            ))}
          </div>

          {/* Custom amount */}
          <div className="flex gap-2">
            <Input
              type="number"
              min="1"
              placeholder="Custom oz…"
              value={customAmt}
              onChange={e => { setCustomAmt(e.target.value); setAddClientError('') }}
              onKeyDown={e => e.key === 'Enter' && handleCustomAdd()}
              inputMode="decimal"
              className="flex-1 h-9"
            />
            <Button type="button" onClick={handleCustomAdd} disabled={adding} className="h-9">
              Add
            </Button>
          </div>
          {addError && <p className="text-sm text-destructive">{addError}</p>}
        </CardContent>
      </Card>

      {/* Today's log */}
      <div>
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">{selectedDate === today ? "Today's Log" : `Log — ${selectedDate}`}</h2>
        {loading ? (
          <div className="space-y-2">
            {[0, 1, 2].map(i => <Skeleton key={i} className="h-12 rounded-xl" />)}
          </div>
        ) : entries.length === 0 ? (
          <p className="text-sm text-muted-foreground">No water logged{selectedDate === today ? ' yet today' : ' on this day'}.</p>
        ) : (
          <Card className="py-0 overflow-hidden">
            <ul className="divide-y divide-border">
              {[...entries].reverse().map(entry => (
                <li key={entry.id} className="flex items-center justify-between px-5 py-3">
                  <div className="flex items-center gap-3">
                    <span className="size-2 rounded-full bg-sky-400 shrink-0" />
                    <span className="text-sm font-semibold">{entry.amount} oz</span>
                    <span className="text-xs text-muted-foreground">{(entry.amount / 8).toFixed(1)} cups</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">{formatTime(entry.createdAt)}</span>
                    <Button type="button" size="icon-sm" variant="ghost" onClick={() => handleDelete(entry.id)}
                      className="text-muted-foreground hover:text-destructive" aria-label="Delete">
                      <Trash2 />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
            <div className="px-5 py-3 bg-muted/50 border-t border-border flex justify-between">
              <span className="text-xs font-semibold text-muted-foreground">Total</span>
              <span className="text-xs font-bold text-sky-500">{Math.round(total)} oz · {cups} cups</span>
            </div>
          </Card>
        )}
      </div>
    </div>
  )
}
