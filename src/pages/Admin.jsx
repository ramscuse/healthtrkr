import { useCallback, useEffect, useMemo, useState } from 'react'
import { deleteUser, getUsers, resetUserPassword, updateUser } from '../lib/api.js'
import { useUser } from '../context/UserContext.jsx'

function CloseIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
      <path fillRule="evenodd" d="M5.47 5.47a.75.75 0 0 1 1.06 0L12 10.94l5.47-5.47a.75.75 0 1 1 1.06 1.06L13.06 12l5.47 5.47a.75.75 0 1 1-1.06 1.06L12 13.06l-5.47 5.47a.75.75 0 0 1-1.06-1.06L10.94 12 5.47 6.53a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
    </svg>
  )
}

function formatDate(value) {
  if (!value) return ''
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString()
}

export default function Admin() {
  const { user: me } = useUser()
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [listError, setListError] = useState('')

  const [selectedId, setSelectedId] = useState(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setListError('')
    try {
      const list = await getUsers()
      setUsers(list)
    } catch (err) {
      setListError(err.message || 'Failed to load users.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { refresh() }, [refresh])

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
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Admin</h1>
        <span className="text-sm text-gray-500 dark:text-gray-400">
          {users.length} user{users.length === 1 ? '' : 's'}
        </span>
      </div>

      {listError && (
        <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 text-red-700 dark:text-red-400 text-sm rounded-lg px-4 py-3">
          {listError}
        </div>
      )}

      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-sm divide-y divide-gray-100 dark:divide-gray-700 overflow-hidden">
        {loading ? (
          <div className="px-5 py-6 text-sm text-gray-400 dark:text-gray-500">Loading users…</div>
        ) : users.length === 0 ? (
          <div className="px-5 py-6 text-sm text-gray-400 dark:text-gray-500">No users yet.</div>
        ) : (
          users.map(u => (
            <button
              key={u.id}
              type="button"
              onClick={() => setSelectedId(u.id)}
              className="w-full flex items-center gap-3 px-5 py-3 text-left hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-gray-900 dark:text-white truncate">
                    {u.name || '(no name)'}
                  </span>
                  {u.role === 'admin' && (
                    <span className="text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300">
                      Admin
                    </span>
                  )}
                  {me?.id === u.id && (
                    <span className="text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded bg-gray-200 text-gray-600 dark:bg-gray-700 dark:text-gray-300">
                      You
                    </span>
                  )}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400 truncate">{u.email}</div>
                <div className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5">
                  Joined {formatDate(u.createdAt)} ·{' '}
                  {u._count?.meals ?? 0} meals · {u._count?.workouts ?? 0} workouts ·{' '}
                  {u._count?.waterEntries ?? 0} water · {u._count?.healthData ?? 0} health
                </div>
              </div>
            </button>
          ))
        )}
      </div>

      {selectedId && (
        <div
          className="fixed inset-0 bg-black/40 z-40"
          onClick={() => setSelectedId(null)}
          aria-hidden="true"
        />
      )}

      <div
        className={`fixed inset-y-0 right-0 w-full sm:w-[420px] bg-white dark:bg-gray-900 shadow-xl z-50 flex flex-col transition-transform duration-300 ${
          selectedId ? 'translate-x-0' : 'translate-x-full'
        }`}
        aria-modal={selectedId ? 'true' : undefined}
        aria-hidden={selectedId ? undefined : 'true'}
        inert={selectedId ? undefined : ''}
        role="dialog"
        aria-label="Edit user panel"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Edit user</h2>
          <button
            onClick={() => setSelectedId(null)}
            aria-label="Close panel"
            className="w-8 h-8 flex items-center justify-center rounded-md text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
          >
            <CloseIcon />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-5">
          {selected && (
            <EditorPanel
              key={selected.id}
              target={selected}
              isSelf={me?.id === selected.id}
              isLastAdmin={selected.role === 'admin' && adminCount <= 1}
              onChanged={refresh}
              onDeleted={() => { setSelectedId(null); refresh() }}
            />
          )}
        </div>
      </div>
    </div>
  )
}

function EditorPanel({ target, isSelf, isLastAdmin, onChanged, onDeleted }) {
  const [form, setForm] = useState({
    name: target.name || '',
    role: target.role || 'user',
    darkMode: !!target.darkMode,
  })
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [saved, setSaved] = useState(false)

  const [newPassword, setNewPassword] = useState('')
  const [pwLoading, setPwLoading] = useState(false)
  const [pwError, setPwError] = useState('')
  const [pwSuccess, setPwSuccess] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState('')

  async function handleSave() {
    setSaving(true); setSaveError(''); setSaved(false)
    try {
      const patch = {}
      const trimmedName = form.name.trim()
      if (trimmedName !== target.name) patch.name = trimmedName
      if (form.role !== target.role) patch.role = form.role
      if (form.darkMode !== !!target.darkMode) patch.darkMode = form.darkMode

      if (Object.keys(patch).length === 0) {
        setSaved(true)
        setTimeout(() => setSaved(false), 2500)
        return
      }

      await updateUser(target.id, patch)
      setSaved(true)
      await onChanged()
      setTimeout(() => setSaved(false), 2500)
    } catch (err) {
      setSaveError(err.message || 'Failed to save changes.')
    } finally {
      setSaving(false)
    }
  }

  async function handleResetPassword(e) {
    e.preventDefault()
    setPwError(''); setPwSuccess(false)
    if (newPassword.length < 6) {
      setPwError('New password must be at least 6 characters.')
      return
    }
    setPwLoading(true)
    try {
      await resetUserPassword(target.id, newPassword)
      setPwSuccess(true)
      setNewPassword('')
    } catch (err) {
      setPwError(err.message || 'Failed to reset password.')
    } finally {
      setPwLoading(false)
    }
  }

  async function handleDelete() {
    if (!window.confirm(`Delete ${target.email}? This permanently removes all of their data.`)) return
    setDeleting(true); setDeleteError('')
    try {
      await deleteUser(target.id)
      onDeleted()
    } catch (err) {
      setDeleteError(err.message || 'Failed to delete user.')
      setDeleting(false)
    }
  }

  const demotingLastAdmin = isLastAdmin && form.role !== 'admin'

  return (
    <div className="space-y-6">
      {/* Profile */}
      <section className="space-y-4">
        <div className="text-xs font-semibold text-gray-500 dark:text-gray-400">{target.email}</div>

        {saved && (
          <div className="bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-700 text-green-700 dark:text-green-400 text-sm rounded-lg px-4 py-3">
            Changes saved.
          </div>
        )}
        {saveError && (
          <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 text-red-700 dark:text-red-400 text-sm rounded-lg px-4 py-3">
            {saveError}
          </div>
        )}

        <div>
          <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">Name</label>
          <input
            type="text"
            value={form.name}
            onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            style={{ fontSize: '16px' }}
            className="w-full border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-white bg-white dark:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">Role</label>
          <select
            value={form.role}
            onChange={e => setForm(f => ({ ...f, role: e.target.value }))}
            disabled={isLastAdmin}
            style={{ fontSize: '16px' }}
            className="w-full border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-white bg-white dark:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-60"
          >
            <option value="user">user</option>
            <option value="admin">admin</option>
          </select>
          {isLastAdmin && (
            <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1">
              This is the only admin — promote another user first before demoting.
            </p>
          )}
        </div>

        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-gray-900 dark:text-white">Dark mode</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">Their preference</p>
          </div>
          <button
            type="button"
            onClick={() => setForm(f => ({ ...f, darkMode: !f.darkMode }))}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
              form.darkMode ? 'bg-indigo-600' : 'bg-gray-200 dark:bg-gray-600'
            }`}
            role="switch"
            aria-checked={form.darkMode}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                form.darkMode ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </div>

        <button
          type="button"
          onClick={handleSave}
          disabled={saving || demotingLastAdmin}
          className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-semibold rounded-lg px-4 py-2.5 transition-colors"
        >
          {saving ? 'Saving…' : 'Save changes'}
        </button>
      </section>

      {/* Reset password */}
      <section className="space-y-3 pt-6 border-t border-gray-200 dark:border-gray-700">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200">Reset password</h3>

        {pwSuccess && (
          <div className="bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-700 text-green-700 dark:text-green-400 text-sm rounded-lg px-4 py-3">
            Password updated. Share the new password with the user out of band.
          </div>
        )}
        {pwError && (
          <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 text-red-700 dark:text-red-400 text-sm rounded-lg px-4 py-3">
            {pwError}
          </div>
        )}

        <form onSubmit={handleResetPassword} className="space-y-3">
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400">New password</label>
              <button
                type="button"
                onClick={() => setShowPassword(s => !s)}
                className="text-[11px] text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300"
              >
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </div>
            <input
              type={showPassword ? 'text' : 'password'}
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
              autoComplete="new-password"
              style={{ fontSize: '16px' }}
              className="w-full border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-white bg-white dark:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <button
            type="submit"
            disabled={pwLoading}
            className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-semibold rounded-lg px-4 py-2.5 transition-colors"
          >
            {pwLoading ? 'Setting…' : 'Set password'}
          </button>
        </form>
      </section>

      {/* Delete */}
      <section className="pt-6 border-t border-gray-200 dark:border-gray-700 space-y-3">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200">Danger zone</h3>
        {deleteError && (
          <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 text-red-700 dark:text-red-400 text-sm rounded-lg px-4 py-3">
            {deleteError}
          </div>
        )}
        <button
          type="button"
          onClick={handleDelete}
          disabled={deleting || isSelf || isLastAdmin}
          className="w-full border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-semibold rounded-lg px-4 py-2.5 transition-colors"
        >
          {deleting ? 'Deleting…' : 'Delete user'}
        </button>
        {isSelf && (
          <p className="text-[11px] text-gray-500 dark:text-gray-400">
            You can't delete your own admin account from here.
          </p>
        )}
        {!isSelf && isLastAdmin && (
          <p className="text-[11px] text-gray-500 dark:text-gray-400">
            Can't delete the only remaining admin.
          </p>
        )}
      </section>
    </div>
  )
}
