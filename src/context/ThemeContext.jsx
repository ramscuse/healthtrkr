import { createContext, useContext, useEffect, useState } from 'react'
import { getAccount, updateAccount } from '../lib/api.js'

const ThemeContext = createContext({ darkMode: false, toggleDarkMode: () => {} })

function applyThemeColor(dark) {
  const fallback = document.getElementById('theme-color-fallback')
  if (fallback) fallback.setAttribute('content', dark ? '#0f172a' : '#ffffff')
}

export function ThemeProvider({ children }) {
  const [darkMode, setDarkMode] = useState(false)

  useEffect(() => {
    const token = localStorage.getItem('token')
    if (!token) return
    getAccount()
      .then(user => {
        const dm = user.darkMode || false
        setDarkMode(dm)
        document.documentElement.classList.toggle('dark', dm)
        applyThemeColor(dm)
      })
      .catch(() => {})
  }, [])

  async function toggleDarkMode() {
    const next = !darkMode
    setDarkMode(next)
    document.documentElement.classList.toggle('dark', next)
    applyThemeColor(next)
    try {
      await updateAccount({ darkMode: next })
    } catch {
      // revert on failure
      setDarkMode(!next)
      document.documentElement.classList.toggle('dark', !next)
      applyThemeColor(!next)
    }
  }

  return (
    <ThemeContext.Provider value={{ darkMode, toggleDarkMode }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useDarkMode() {
  return useContext(ThemeContext)
}
