import { Navigate } from 'react-router-dom'
import { isLoggedIn } from '../lib/api.js'

export default function ProtectedRoute({ children }) {
  if (!isLoggedIn()) return <Navigate to="/login" replace />
  return children
}
