import { Routes, Route, Navigate } from 'react-router-dom'
import { ThemeProvider } from './context/ThemeContext.jsx'
import Auth from './pages/Auth.jsx'
import Dashboard from './pages/Dashboard.jsx'
import Meals from './pages/Meals.jsx'
import Workouts from './pages/Workouts.jsx'
import Progress from './pages/Progress.jsx'
import Water from './pages/Water.jsx'
import Account from './pages/Account.jsx'
import Layout from './components/Layout.jsx'
import ProtectedRoute from './components/ProtectedRoute.jsx'

export default function App() {
  return (
    <ThemeProvider>
    <Routes>
      <Route path="/login" element={<Auth />} />

      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Layout>
              <Dashboard />
            </Layout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/meals"
        element={
          <ProtectedRoute>
            <Layout>
              <Meals />
            </Layout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/workouts"
        element={
          <ProtectedRoute>
            <Layout>
              <Workouts />
            </Layout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/water"
        element={
          <ProtectedRoute>
            <Layout>
              <Water />
            </Layout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/progress"
        element={
          <ProtectedRoute>
            <Layout>
              <Progress />
            </Layout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/account"
        element={
          <ProtectedRoute>
            <Layout>
              <Account />
            </Layout>
          </ProtectedRoute>
        }
      />

      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
    </ThemeProvider>
  )
}
