import { useState, useEffect } from 'react'
import { Navigate } from 'react-router-dom'
import { getToken, tryRefreshFromCookie } from '../lib/api.js'

export default function ProtectedRoute({ children }) {
  // Start as 'ok' if localStorage already has a valid token (fast path, no flicker)
  const [authState, setAuthState] = useState(() =>
    getToken() ? 'ok' : 'checking'
  )

  useEffect(() => {
    if (authState !== 'checking') return
    // localStorage was empty — attempt cookie-based session recovery
    tryRefreshFromCookie().then(token => {
      setAuthState(token ? 'ok' : 'denied')
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  if (authState === 'checking') return null
  if (authState === 'denied') return <Navigate to="/login" replace />
  return children
}
