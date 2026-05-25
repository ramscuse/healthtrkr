import { NavLink, useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { Home, Utensils, Dumbbell, Droplet, BarChart3, User, Shield, LogOut } from 'lucide-react'
import { logout } from '../lib/api.js'
import { useUser } from '../context/UserContext.jsx'
import { cn } from '@/lib/utils'

const baseNavItems = [
  { to: '/',          label: 'Dashboard', mobileLabel: 'Home',     Icon: Home },
  { to: '/meals',     label: 'Meals',     mobileLabel: 'Meals',    Icon: Utensils },
  { to: '/workouts',  label: 'Workouts',  mobileLabel: 'Workouts', Icon: Dumbbell },
  { to: '/water',     label: 'Water',     mobileLabel: 'Water',    Icon: Droplet },
  { to: '/progress',  label: 'Progress',  mobileLabel: 'Progress', Icon: BarChart3 },
]

const adminNavItem = { to: '/admin', label: 'Admin', mobileLabel: 'Admin', Icon: Shield }

// Active = solid violet pill; inactive = muted sidebar foreground with a subtle hover.
const navItemClass = ({ isActive }) =>
  cn(
    'flex items-center gap-2.5 px-3 py-2 rounded-md text-sm font-medium transition-colors',
    isActive
      ? 'bg-primary text-primary-foreground'
      : 'text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground'
  )

export default function Layout({ children }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { user } = useUser()

  const isAdmin = user?.role === 'admin'
  const navItems = isAdmin ? [...baseNavItems, adminNavItem] : baseNavItems
  const mobileNavItems = [...navItems, { to: '/account', label: 'Account', mobileLabel: 'Account', Icon: User }]

  async function handleLogout() {
    try { await logout() } catch { /* ignore */ }
    // Drop the previous session's cached data so a same-tab login doesn't
    // briefly show stale account/meals/water/progress for the prior user.
    queryClient.clear()
    navigate('/login')
  }

  return (
    <div className="flex h-dvh overflow-hidden bg-background text-foreground">
      {/* Sidebar — desktop only */}
      <aside className="hidden md:flex flex-col w-56 bg-sidebar text-sidebar-foreground border-r border-sidebar-border shrink-0">
        <div className="px-6 py-5 border-b border-sidebar-border">
          <span className="text-xl font-bold tracking-tight text-primary">healthtrkr</span>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1">
          {navItems.map(({ to, label, Icon }) => (
            <NavLink key={to} to={to} end={to === '/'} className={navItemClass}>
              <Icon className="size-4 shrink-0" />
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="px-3 py-4 border-t border-sidebar-border space-y-1">
          <NavLink to="/account" className={navItemClass}>
            <User className="size-4 shrink-0" />
            Account
          </NavLink>
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-sm font-medium text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground transition-colors"
          >
            <LogOut className="size-4 shrink-0" />
            Log out
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto bg-background pt-[env(safe-area-inset-top)]">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 pb-24 md:pb-8">
          {children}
        </div>
      </main>

      {/* Bottom tab bar — mobile only */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-20 bg-background border-t border-border flex pb-[env(safe-area-inset-bottom)]">
        {mobileNavItems.map(({ to, mobileLabel, Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              cn(
                'flex-1 flex flex-col items-center justify-center py-2 gap-0.5 transition-colors',
                isActive ? 'text-primary' : 'text-muted-foreground'
              )
            }
          >
            <Icon className="size-5" />
            <span className="text-[10px] font-medium leading-none">{mobileLabel}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
