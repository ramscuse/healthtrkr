import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { changePassword, logout } from '../lib/api.js'
import { useAccount } from '../hooks/useAccount.js'
import { useGoals, useUpdateGoals } from '../hooks/useGoals.js'
import { useDarkMode } from '../context/ThemeContext.jsx'
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Alert, AlertDescription } from '@/components/ui/alert'

const GOAL_FIELDS = [
  { key: 'calorieMin', label: 'Calorie Min', unit: 'kcal' },
  { key: 'calorieMax', label: 'Calorie Max', unit: 'kcal' },
  { key: 'proteinMin', label: 'Protein Min', unit: 'g' },
  { key: 'proteinMax', label: 'Protein Max', unit: 'g' },
  { key: 'waterGoal',  label: 'Water Goal',  unit: 'oz' },
]

export default function Account() {
  const { darkMode, toggleDarkMode } = useDarkMode()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const accountQuery = useAccount()
  const goalsQuery = useGoals()
  const updateGoalsMutation = useUpdateGoals()

  const profile = accountQuery.data
  const goals = goalsQuery.data

  // Goals form state — local because it's edit-buffer, not server state.
  const [goalsEditing, setGoalsEditing] = useState(false)
  const [goalsForm, setGoalsForm] = useState({})
  const [goalsClientError, setGoalsClientError] = useState('')

  // Sync the form buffer to the loaded goals (once they arrive, and again
  // if the cached goals change from elsewhere). Skip while editing so a
  // background refetch can't clobber unsaved input.
  useEffect(() => {
    if (!goals || goalsEditing) return
    setGoalsForm({
      calorieMin: goals.calorieMin ?? '',
      calorieMax: goals.calorieMax ?? '',
      proteinMin: goals.proteinMin ?? '',
      proteinMax: goals.proteinMax ?? '',
      waterGoal:  goals.waterGoal  ?? '',
    })
  }, [goals, goalsEditing])

  // Password state — direct call (one-shot, not cached).
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [pwdSaving, setPwdSaving] = useState(false)
  const [pwdError, setPwdError] = useState('')

  const goalsSaving = updateGoalsMutation.isPending
  const goalsError = goalsClientError || (updateGoalsMutation.error && updateGoalsMutation.error.message) || ''

  function handleSaveGoals() {
    setGoalsClientError('')
    const payload = {}
    for (const [key, val] of Object.entries(goalsForm)) {
      const n = Number(val)
      if (val !== '' && Number.isFinite(n)) payload[key] = n
    }
    updateGoalsMutation.mutate(payload, {
      onSuccess: () => {
        setGoalsEditing(false)
        toast.success('Goals saved')
      },
    })
  }

  function cancelGoalsEdit() {
    setGoalsEditing(false)
    setGoalsClientError('')
    setGoalsForm({
      calorieMin: goals?.calorieMin ?? '',
      calorieMax: goals?.calorieMax ?? '',
      proteinMin: goals?.proteinMin ?? '',
      proteinMax: goals?.proteinMax ?? '',
      waterGoal:  goals?.waterGoal  ?? '',
    })
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setPwdError('')

    if (next !== confirm) {
      setPwdError('New passwords do not match.')
      return
    }
    if (next.length < 6) {
      setPwdError('New password must be at least 6 characters.')
      return
    }

    setPwdSaving(true)
    try {
      await changePassword(current, next)
      toast.success('Password updated successfully')
      setCurrent('')
      setNext('')
      setConfirm('')
    } catch (err) {
      setPwdError(err.message || 'Failed to update password.')
    } finally {
      setPwdSaving(false)
    }
  }

  async function handleLogout() {
    try { await logout() } catch { /* ignore */ }
    queryClient.clear()
    navigate('/login')
  }

  return (
    <div className="max-w-md space-y-6">
      <h1 className="text-2xl font-bold">Account</h1>

      {/* Profile Info */}
      {profile && (
        <Card>
          <CardHeader>
            <CardTitle>Profile</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {profile.name && (
              <div className="flex items-center gap-3">
                <span className="text-xs font-semibold text-muted-foreground w-16">Name</span>
                <span className="text-sm">{profile.name}</span>
              </div>
            )}
            <div className="flex items-center gap-3">
              <span className="text-xs font-semibold text-muted-foreground w-16">Email</span>
              <span className="text-sm">{profile.email}</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Goals */}
      <Card>
        <CardHeader>
          <CardTitle>Goals</CardTitle>
          <CardAction>
            {!goalsEditing ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => { setGoalsEditing(true); setGoalsClientError('') }}
              >
                Edit
              </Button>
            ) : (
              <div className="flex gap-2">
                <Button type="button" size="sm" onClick={handleSaveGoals} disabled={goalsSaving}>
                  {goalsSaving ? 'Saving…' : 'Save'}
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={cancelGoalsEdit}>
                  Cancel
                </Button>
              </div>
            )}
          </CardAction>
        </CardHeader>
        <CardContent>
          {goalsEditing ? (
            <div className="space-y-3">
              {GOAL_FIELDS.map(({ key, label, unit }) => (
                <div key={key} className="flex items-center gap-3">
                  <Label htmlFor={`goal-${key}`} className="text-muted-foreground w-28 shrink-0">{label}</Label>
                  <div className="flex items-center gap-1.5 flex-1">
                    <Input
                      id={`goal-${key}`}
                      type="number"
                      min="0"
                      inputMode="numeric"
                      value={goalsForm[key] ?? ''}
                      onChange={e => setGoalsForm(f => ({ ...f, [key]: e.target.value }))}
                      className="flex-1"
                    />
                    <span className="text-xs text-muted-foreground shrink-0">{unit}</span>
                  </div>
                </div>
              ))}
              {goalsError && <p className="text-xs text-destructive">{goalsError}</p>}
            </div>
          ) : goals ? (
            <div className="space-y-2">
              {[
                { label: 'Calories', value: goals.calorieMin != null && goals.calorieMax != null ? `${goals.calorieMin}–${goals.calorieMax} kcal` : goals.calorieMax ? `${goals.calorieMax} kcal max` : null },
                { label: 'Protein',  value: goals.proteinMin != null && goals.proteinMax != null ? `${goals.proteinMin}–${goals.proteinMax} g` : goals.proteinMax ? `${goals.proteinMax} g max` : null },
                { label: 'Water',    value: goals.waterGoal ? `${goals.waterGoal} oz / day` : null },
              ].map(({ label, value }) => (
                <div key={label} className="flex items-center gap-3">
                  <span className="text-xs font-semibold text-muted-foreground w-16">{label}</span>
                  <span className="text-sm">{value ?? <span className="text-muted-foreground">Not set</span>}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Loading goals…</p>
          )}
        </CardContent>
      </Card>

      {/* Appearance */}
      <Card>
        <CardHeader>
          <CardTitle>Appearance</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">Dark Mode</p>
            <p className="text-xs text-muted-foreground mt-0.5">Switch between light and dark theme</p>
          </div>
          <Switch
            checked={darkMode}
            onCheckedChange={() => toggleDarkMode()}
            aria-label="Toggle dark mode"
          />
        </CardContent>
      </Card>

      {/* Change Password */}
      <Card>
        <CardHeader>
          <CardTitle>Change Password</CardTitle>
        </CardHeader>
        <CardContent>
          {pwdError && (
            <Alert variant="destructive" className="bg-destructive/10 border-destructive/20 mb-4">
              <AlertDescription className="text-destructive">{pwdError}</AlertDescription>
            </Alert>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="current-password">Current Password</Label>
              <Input
                id="current-password"
                type="password"
                value={current}
                onChange={e => setCurrent(e.target.value)}
                required
                autoComplete="current-password"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="next-password">New Password</Label>
              <Input
                id="next-password"
                type="password"
                value={next}
                onChange={e => setNext(e.target.value)}
                required
                autoComplete="new-password"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="confirm-password">Confirm New Password</Label>
              <Input
                id="confirm-password"
                type="password"
                value={confirm}
                onChange={e => setConfirm(e.target.value)}
                required
                autoComplete="new-password"
              />
            </div>

            <Button type="submit" disabled={pwdSaving} className="w-full">
              {pwdSaving ? 'Updating...' : 'Update Password'}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Log Out */}
      <Card>
        <CardHeader>
          <CardTitle>Session</CardTitle>
        </CardHeader>
        <CardContent>
          <Button type="button" variant="destructive" onClick={handleLogout} className="w-full">
            Log Out
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
