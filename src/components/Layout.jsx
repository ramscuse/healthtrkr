import { NavLink, useNavigate } from 'react-router-dom'
import { clearToken, logout } from '../lib/api.js'

function HomeIcon({ className = 'w-5 h-5' }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M11.47 3.841a.75.75 0 0 1 1.06 0l8.69 8.69a.75.75 0 1 0 1.06-1.061l-8.689-8.69a2.25 2.25 0 0 0-3.182 0l-8.69 8.69a.75.75 0 1 0 1.061 1.06l8.69-8.689Z" />
      <path d="m12 5.432 8.159 8.159c.03.03.06.058.091.086v6.198c0 1.035-.84 1.875-1.875 1.875H15a.75.75 0 0 1-.75-.75v-4.5a.75.75 0 0 0-.75-.75h-3a.75.75 0 0 0-.75.75V21a.75.75 0 0 1-.75.75H5.625a1.875 1.875 0 0 1-1.875-1.875v-6.198a2.29 2.29 0 0 0 .091-.086L12 5.432Z" />
    </svg>
  )
}

function MealsIcon({ className = 'w-5 h-5' }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M12.963 2.286a.75.75 0 0 0-1.071-.136 9.742 9.742 0 0 0-3.539 6.176 7.547 7.547 0 0 1-1.705-1.715.75.75 0 0 0-1.152-.082A9 9 0 1 0 15.68 4.534a7.46 7.46 0 0 1-2.717-2.248ZM15.75 14.25a3.75 3.75 0 1 1-7.313-1.172c.628.465 1.35.81 2.133 1a5.99 5.99 0 0 1 1.925-3.546 3.75 3.75 0 0 1 3.255 3.718Z" />
    </svg>
  )
}

function WorkoutsIcon({ className = 'w-5 h-5' }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path fillRule="evenodd" d="M14.615 1.595a.75.75 0 0 1 .359.852L12.982 9.75h7.268a.75.75 0 0 1 .548 1.262l-10.5 11.25a.75.75 0 0 1-1.272-.71l1.992-7.302H3.75a.75.75 0 0 1-.548-1.262l10.5-11.25a.75.75 0 0 1 .913-.143Z" clipRule="evenodd" />
    </svg>
  )
}

function WaterIcon({ className = 'w-5 h-5' }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path fillRule="evenodd" d="M12 2.25c-.53 0-.902.41-1.122.86C9.006 6.23 6.75 10.07 6.75 12.75a5.25 5.25 0 0 0 10.5 0c0-2.68-2.256-6.52-4.128-9.64C12.902 2.66 12.53 2.25 12 2.25Zm0 16.5a4 4 0 0 1-4-4c0-.414.336-.75.75-.75s.75.336.75.75a2.5 2.5 0 0 0 2.5 2.5c.414 0 .75.336.75.75s-.336.75-.75.75Z" clipRule="evenodd" />
    </svg>
  )
}

function ProgressIcon({ className = 'w-5 h-5' }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M18.375 2.25c-1.035 0-1.875.84-1.875 1.875v15.75c0 1.035.84 1.875 1.875 1.875h.75c1.035 0 1.875-.84 1.875-1.875V4.125c0-1.036-.84-1.875-1.875-1.875h-.75ZM9.75 8.625c0-1.036.84-1.875 1.875-1.875h.75c1.036 0 1.875.84 1.875 1.875v11.25c0 1.035-.84 1.875-1.875 1.875h-.75a1.875 1.875 0 0 1-1.875-1.875V8.625ZM3 13.125c0-1.036.84-1.875 1.875-1.875h.75c1.036 0 1.875.84 1.875 1.875v6.75c0 1.035-.84 1.875-1.875 1.875h-.75A1.875 1.875 0 0 1 3 19.875v-6.75Z" />
    </svg>
  )
}

function AccountIcon({ className = 'w-5 h-5' }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path fillRule="evenodd" d="M7.5 6a4.5 4.5 0 1 1 9 0 4.5 4.5 0 0 1-9 0ZM3.751 20.105a8.25 8.25 0 0 1 16.498 0 .75.75 0 0 1-.437.695A18.683 18.683 0 0 1 12 22.5c-2.786 0-5.433-.608-7.812-1.7a.75.75 0 0 1-.437-.695Z" clipRule="evenodd" />
    </svg>
  )
}

const navItems = [
  { to: '/',          label: 'Dashboard', mobileLabel: 'Home',      Icon: HomeIcon },
  { to: '/meals',     label: 'Meals',     mobileLabel: 'Meals',     Icon: MealsIcon },
  { to: '/workouts',  label: 'Workouts',  mobileLabel: 'Workouts',  Icon: WorkoutsIcon },
  { to: '/water',     label: 'Water',     mobileLabel: 'Water',     Icon: WaterIcon },
  { to: '/progress',  label: 'Progress',  mobileLabel: 'Progress',  Icon: ProgressIcon },
]

const mobileNavItems = [
  ...navItems,
  { to: '/account', label: 'Account', mobileLabel: 'Account', Icon: AccountIcon },
]

export default function Layout({ children }) {
  const navigate = useNavigate()

  async function handleLogout() {
    try { await logout() } catch { /* ignore */ }
    clearToken()
    navigate('/login')
  }

  return (
    <div className="flex h-[100dvh] overflow-hidden">
      {/* Sidebar — desktop only */}
      <aside className="hidden md:flex flex-col w-56 bg-gray-900 text-white flex-shrink-0">
        <div className="px-6 py-5 border-b border-gray-700">
          <span className="text-xl font-bold tracking-tight text-indigo-400">healthtrkr</span>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1">
          {navItems.map(({ to, label, Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                `flex items-center gap-2.5 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-indigo-700 text-white'
                    : 'text-gray-300 hover:bg-gray-800 hover:text-white'
                }`
              }
            >
              <Icon className="w-4 h-4 flex-shrink-0" />
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="px-3 py-4 border-t border-gray-700 space-y-1">
          <NavLink
            to="/account"
            className={({ isActive }) =>
              `flex items-center px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-indigo-700 text-white'
                  : 'text-gray-400 hover:bg-gray-800 hover:text-white'
              }`
            }
          >
            Account
          </NavLink>
          <button
            onClick={handleLogout}
            className="w-full flex items-center px-3 py-2 rounded-md text-sm font-medium text-gray-400 hover:bg-gray-800 hover:text-white transition-colors"
          >
            Log out
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto bg-white dark:bg-gray-900 pt-[env(safe-area-inset-top)]">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 pb-24 md:pb-8">
          {children}
        </div>
      </main>

      {/* Bottom tab bar — mobile only */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-20 bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700 flex pb-[env(safe-area-inset-bottom)]">
        {mobileNavItems.map(({ to, mobileLabel, Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              `flex-1 flex flex-col items-center justify-center py-2 gap-0.5 transition-colors ${
                isActive ? 'text-indigo-600' : 'text-gray-400 dark:text-gray-500'
              }`
            }
          >
            <Icon className="w-5 h-5" />
            <span className="text-[10px] font-medium leading-none">{mobileLabel}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
