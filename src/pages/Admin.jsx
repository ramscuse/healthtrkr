import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { useUser } from '../context/UserContext.jsx'
import { useAdminUsers, useUpdateUser, useResetUserPassword, useDeleteUser } from '../hooks/useAdmin.js'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'

const SELECT_CLASS =
  'h-9 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-60 dark:bg-input/30'

function formatDate(value) {
  if (!value) return ''
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString()
}

export default function Admin() {
  const { user: me } = useUser()
  const usersQuery = useAdminUsers()
  const users = usersQuery.data || []
  const loading = usersQuery.isPending
  const listError = (usersQuery.error && usersQuery.error.message) || ''

  const [selectedId, setSelectedId] = useState(null)

  const adminCount = useMemo(
    () => users.filter(u => u.role === 'admin').length,
    [users]
  )
  const selected = useMemo(
    () => users.find(u => u.id === selectedId) || null,
    [users, selectedId]
  )

  return (
    <div className="space-y-6">
      <div className="flex items-baseline justify-between">
        <h1 className="text-2xl font-bold">Admin</h1>
        <span className="text-sm text-muted-foreground">
          {users.length} user{users.length === 1 ? '' : 's'}
        </span>
      </div>

      {listError && (
        <Alert variant="destructive" className="bg-destructive/10 border-destructive/20">
          <AlertDescription className="text-destructive">{listError}</AlertDescription>
        </Alert>
      )}

      {loading ? (
        <div className="space-y-2">
          {[0, 1, 2].map(i => <Skeleton key={i} className="h-16 rounded-xl" />)}
        </div>
      ) : (
        <Card className="py-0 overflow-hidden">
          {users.length === 0 ? (
            <div className="px-5 py-6 text-sm text-muted-foreground">No users yet.</div>
          ) : (
            <ul className="divide-y divide-border">
              {users.map(u => (
                <li key={u.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(u.id)}
                    className="w-full flex items-center gap-3 px-5 py-3 text-left hover:bg-accent transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium truncate">{u.name || '(no name)'}</span>
                        {u.role === 'admin' && <Badge className="text-[10px] uppercase tracking-wide">Admin</Badge>}
                        {me?.id === u.id && <Badge variant="secondary" className="text-[10px] uppercase tracking-wide">You</Badge>}
                      </div>
                      <div className="text-xs text-muted-foreground truncate">{u.email}</div>
                      <div className="text-[11px] text-muted-foreground/80 mt-0.5">
                        Joined {formatDate(u.createdAt)} ·{' '}
                        {u._count?.meals ?? 0} meals · {u._count?.workouts ?? 0} workouts ·{' '}
                        {u._count?.waterEntries ?? 0} water · {u._count?.healthData ?? 0} health
                      </div>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      <Sheet open={!!selectedId} onOpenChange={(open) => { if (!open) setSelectedId(null) }}>
        <SheetContent className="w-full sm:max-w-[420px] p-0 gap-0">
          <SheetHeader className="border-b pr-12">
            <SheetTitle>Edit user</SheetTitle>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto px-5 py-5">
            {selected && (
              <EditorPanel
                key={selected.id}
                target={selected}
                isSelf={me?.id === selected.id}
                isLastAdmin={selected.role === 'admin' && adminCount <= 1}
                onDeleted={() => setSelectedId(null)}
              />
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  )
}

function EditorPanel({ target, isSelf, isLastAdmin, onDeleted }) {
  const updateMutation = useUpdateUser()
  const resetMutation = useResetUserPassword()
  const deleteMutation = useDeleteUser()

  const [form, setForm] = useState({
    name: target.name || '',
    role: target.role || 'user',
    darkMode: !!target.darkMode,
  })
  const [saveError, setSaveError] = useState('')

  const [newPassword, setNewPassword] = useState('')
  const [pwError, setPwError] = useState('')
  const [showPassword, setShowPassword] = useState(false)

  const [deleteError, setDeleteError] = useState('')
  const [confirmOpen, setConfirmOpen] = useState(false)

  const saving = updateMutation.isPending
  const pwLoading = resetMutation.isPending
  const deleting = deleteMutation.isPending
  const demotingLastAdmin = isLastAdmin && form.role !== 'admin'

  function handleSave() {
    setSaveError('')
    const patch = {}
    const trimmedName = form.name.trim()
    if (trimmedName !== target.name) patch.name = trimmedName
    if (form.role !== target.role) patch.role = form.role
    if (form.darkMode !== !!target.darkMode) patch.darkMode = form.darkMode

    if (Object.keys(patch).length === 0) {
      toast.success('Already up to date')
      return
    }
    updateMutation.mutate({ id: target.id, patch }, {
      onSuccess: () => toast.success('Changes saved'),
      onError: (err) => setSaveError(err.message || 'Failed to save changes.'),
    })
  }

  function handleResetPassword(e) {
    e.preventDefault()
    setPwError('')
    if (newPassword.length < 6) {
      setPwError('New password must be at least 6 characters.')
      return
    }
    resetMutation.mutate({ id: target.id, newPassword }, {
      onSuccess: () => { setNewPassword(''); toast.success('Password updated. Share it out of band.') },
      onError: (err) => setPwError(err.message || 'Failed to reset password.'),
    })
  }

  function handleConfirmDelete() {
    if (deleting) return
    setConfirmOpen(false)
    setDeleteError('')
    deleteMutation.mutate(target.id, {
      onSuccess: () => { toast.success('User deleted'); onDeleted() },
      onError: (err) => setDeleteError(err.message || 'Failed to delete user.'),
    })
  }

  return (
    <div className="space-y-6">
      {/* Profile */}
      <section className="space-y-4">
        <div className="text-xs font-semibold text-muted-foreground">{target.email}</div>

        {saveError && (
          <Alert variant="destructive" className="bg-destructive/10 border-destructive/20">
            <AlertDescription className="text-destructive">{saveError}</AlertDescription>
          </Alert>
        )}

        <div className="space-y-1.5">
          <Label htmlFor="admin-name">Name</Label>
          <Input id="admin-name" type="text" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className="h-9" />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="admin-role">Role</Label>
          <select
            id="admin-role"
            value={form.role}
            onChange={e => setForm(f => ({ ...f, role: e.target.value }))}
            disabled={isLastAdmin}
            className={SELECT_CLASS}
          >
            <option value="user">user</option>
            <option value="admin">admin</option>
          </select>
          {isLastAdmin && (
            <p className="text-[11px] text-muted-foreground">
              This is the only admin — promote another user first before demoting.
            </p>
          )}
        </div>

        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">Dark mode</p>
            <p className="text-xs text-muted-foreground">Their preference</p>
          </div>
          <Switch
            checked={form.darkMode}
            onCheckedChange={v => setForm(f => ({ ...f, darkMode: v === true }))}
            aria-label="Toggle user dark mode preference"
          />
        </div>

        <Button type="button" onClick={handleSave} disabled={saving || demotingLastAdmin} className="w-full">
          {saving ? 'Saving…' : 'Save changes'}
        </Button>
      </section>

      {/* Reset password */}
      <section className="space-y-3 pt-6 border-t border-border">
        <h3 className="text-sm font-semibold">Reset password</h3>

        {pwError && (
          <Alert variant="destructive" className="bg-destructive/10 border-destructive/20">
            <AlertDescription className="text-destructive">{pwError}</AlertDescription>
          </Alert>
        )}

        <form onSubmit={handleResetPassword} className="space-y-3">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="admin-newpw">New password</Label>
              <button type="button" onClick={() => setShowPassword(s => !s)} className="text-[11px] text-primary hover:underline">
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </div>
            <Input
              id="admin-newpw"
              type={showPassword ? 'text' : 'password'}
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
              autoComplete="new-password"
              className="h-9"
            />
          </div>
          <Button type="submit" disabled={pwLoading} className="w-full">
            {pwLoading ? 'Setting…' : 'Set password'}
          </Button>
        </form>
      </section>

      {/* Delete */}
      <section className="pt-6 border-t border-border space-y-3">
        <h3 className="text-sm font-semibold">Danger zone</h3>
        {deleteError && (
          <Alert variant="destructive" className="bg-destructive/10 border-destructive/20">
            <AlertDescription className="text-destructive">{deleteError}</AlertDescription>
          </Alert>
        )}
        <Button
          type="button"
          variant="destructive"
          onClick={() => setConfirmOpen(true)}
          disabled={deleting || isSelf || isLastAdmin}
          className="w-full"
        >
          {deleting ? 'Deleting…' : 'Delete user'}
        </Button>
        {isSelf && (
          <p className="text-[11px] text-muted-foreground">You can't delete your own admin account from here.</p>
        )}
        {!isSelf && isLastAdmin && (
          <p className="text-[11px] text-muted-foreground">Can't delete the only remaining admin.</p>
        )}

        <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete {target.email}?</AlertDialogTitle>
              <AlertDialogDescription>
                This permanently removes the user and all of their data. This can't be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction variant="destructive" onClick={handleConfirmDelete}>Delete user</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </section>
    </div>
  )
}
