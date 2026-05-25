import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { login, register, forgotPassword, resetPassword } from '../lib/api.js'
import { useUser } from '../context/UserContext.jsx'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Alert, AlertDescription } from '@/components/ui/alert'

function AuthShell({ children }) {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-primary">healthtrkr</h1>
          <p className="text-muted-foreground mt-1 text-sm">Your personal fitness companion</p>
        </div>
        {children}
      </div>
    </div>
  )
}

function ErrorAlert({ children }) {
  return (
    <Alert variant="destructive" className="bg-destructive/10 border-destructive/20">
      <AlertDescription className="text-destructive">{children}</AlertDescription>
    </Alert>
  )
}

function SuccessAlert({ children }) {
  return (
    <Alert className="bg-emerald-500/10 border-emerald-500/30">
      <AlertDescription className="text-emerald-700 dark:text-emerald-400">{children}</AlertDescription>
    </Alert>
  )
}

// view: 'login' | 'register' | 'forgot' | 'reset'
export default function Auth() {
  const navigate = useNavigate()
  const { refresh: refreshUser } = useUser()
  const [view, setView] = useState('login')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [rememberMe, setRememberMe] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  function switchTab(tab) {
    setView(tab)
    setError('')
    setSuccess('')
    setName('')
    setEmail('')
    setPassword('')
    setCode('')
    setNewPassword('')
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      if (view === 'login') {
        await login(email, password, rememberMe)
      } else {
        await register(email, password, name)
      }
      await refreshUser()
      navigate('/')
    } catch (err) {
      setError(err.message || 'Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  async function handleForgot(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await forgotPassword(email)
      setSuccess('Check your email — a 6-digit code is on its way.')
      setView('reset')
    } catch (err) {
      setError(err.message || 'Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  async function handleReset(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await resetPassword(email, code.trim(), newPassword)
      setSuccess('Password reset! You can now log in.')
      switchTab('login')
    } catch (err) {
      setError(err.message || 'Invalid or expired code.')
    } finally {
      setLoading(false)
    }
  }

  // ── Forgot Password view ─────────────────────────────────────────────────
  if (view === 'forgot') {
    return (
      <AuthShell>
        <Card>
          <CardHeader>
            <CardTitle>Reset your password</CardTitle>
            <CardDescription>Enter your email and we'll send you a 6-digit code.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleForgot} className="space-y-4">
              {error && <ErrorAlert>{error}</ErrorAlert>}
              <div className="space-y-1.5">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                  placeholder="you@example.com"
                  className="h-10"
                />
              </div>
              <Button type="submit" disabled={loading} className="w-full h-10">
                {loading ? 'Sending…' : 'Send Code'}
              </Button>
              <Button type="button" variant="ghost" onClick={() => switchTab('login')} className="w-full">
                Back to Log In
              </Button>
            </form>
          </CardContent>
        </Card>
      </AuthShell>
    )
  }

  // ── Reset Password view ──────────────────────────────────────────────────
  if (view === 'reset') {
    return (
      <AuthShell>
        <Card>
          <CardHeader>
            <CardTitle>Enter your reset code</CardTitle>
            <CardDescription>
              {success ? success : 'Check your email for a 6-digit code.'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleReset} className="space-y-4">
              {error && <ErrorAlert>{error}</ErrorAlert>}
              <div className="space-y-1.5">
                <Label htmlFor="reset-email">Email</Label>
                <Input
                  id="reset-email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                  placeholder="you@example.com"
                  className="h-10"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="code">6-digit code</Label>
                <Input
                  id="code"
                  type="text"
                  inputMode="numeric"
                  value={code}
                  onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  required
                  placeholder="123456"
                  className="h-10 text-center font-mono tracking-widest"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="new-password">New password</Label>
                <Input
                  id="new-password"
                  type="password"
                  autoComplete="new-password"
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  required
                  placeholder="Min 6 characters"
                  className="h-10"
                />
              </div>
              <Button type="submit" disabled={loading || code.length !== 6} className="w-full h-10">
                {loading ? 'Resetting…' : 'Reset Password'}
              </Button>
              <div className="flex justify-between text-sm">
                <button
                  type="button"
                  onClick={() => { setError(''); setView('forgot') }}
                  className="text-muted-foreground hover:text-foreground transition-colors"
                >
                  Resend code
                </button>
                <button
                  type="button"
                  onClick={() => switchTab('login')}
                  className="text-muted-foreground hover:text-foreground transition-colors"
                >
                  Back to Log In
                </button>
              </div>
            </form>
          </CardContent>
        </Card>
      </AuthShell>
    )
  }

  // ── Login / Register view ────────────────────────────────────────────────
  return (
    <AuthShell>
      <Card>
        <CardContent>
          <Tabs value={view} onValueChange={switchTab}>
            <TabsList className="w-full">
              <TabsTrigger value="login" className="flex-1">Log In</TabsTrigger>
              <TabsTrigger value="register" className="flex-1">Register</TabsTrigger>
            </TabsList>
          </Tabs>

          <form onSubmit={handleSubmit} className="space-y-4 mt-4">
            {success && <SuccessAlert>{success}</SuccessAlert>}
            {error && <ErrorAlert>{error}</ErrorAlert>}

            {view === 'register' && (
              <div className="space-y-1.5">
                <Label htmlFor="name">Name</Label>
                <Input
                  id="name"
                  name="name"
                  type="text"
                  autoComplete="name"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  required
                  placeholder="Your name"
                  className="h-10"
                />
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                placeholder="you@example.com"
                className="h-10"
              />
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Password</Label>
                {view === 'login' && (
                  <button
                    type="button"
                    onClick={() => { setError(''); setSuccess(''); setView('forgot') }}
                    className="text-xs text-primary hover:underline"
                  >
                    Forgot password?
                  </button>
                )}
              </div>
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete={view === 'login' ? 'current-password' : 'new-password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                placeholder="Min 6 characters"
                className="h-10"
              />
            </div>

            {view === 'login' && (
              <div className="flex items-center gap-2">
                <Checkbox
                  id="remember"
                  checked={rememberMe}
                  onCheckedChange={checked => setRememberMe(checked === true)}
                />
                <Label htmlFor="remember" className="text-muted-foreground font-normal cursor-pointer">
                  Remember me
                </Label>
              </div>
            )}

            <Button type="submit" disabled={loading} className="w-full h-10">
              {loading
                ? 'Please wait...'
                : view === 'login'
                ? 'Log In'
                : 'Create Account'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </AuthShell>
  )
}
