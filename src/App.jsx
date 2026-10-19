import { Routes, Route, Navigate } from "react-router-dom";
import { ThemeProvider } from "./context/ThemeContext.jsx";
import Auth from "./pages/Auth.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import Meals from "./pages/Meals.jsx";
import Workouts from "./pages/Workouts.jsx";
import Progress from "./pages/Progress.jsx";
import Water from "./pages/Water.jsx";
import Account from "./pages/Account.jsx";
import Admin from "./pages/Admin.jsx";
import Layout from "./components/Layout.jsx";
import ProtectedRoute, { AdminRoute } from "./components/ProtectedRoute.jsx";
import { Toaster } from "./components/ui/sonner.jsx";
import { SpeedInsights } from "@vercel/speed-insights/react";
import { Analytics } from "@vercel/analytics/react";

// Flat routes on purpose: each gets its own <ProtectedRoute> element, so the
// session check re-runs on every navigation (a shared layout route would not).
const PAGES = {
  "/": Dashboard,
  "/meals": Meals,
  "/workouts": Workouts,
  "/water": Water,
  "/progress": Progress,
  "/account": Account,
};

export default function App() {
  return (
    <>
      <SpeedInsights />
      <Analytics />
      <ThemeProvider>
        <Routes>
          <Route path="/login" element={<Auth />} />
          {Object.entries(PAGES).map(([path, Page]) => (
            <Route
              key={path}
              path={path}
              element={
                <ProtectedRoute>
                  <Layout>
                    <Page />
                  </Layout>
                </ProtectedRoute>
              }
            />
          ))}
          <Route
            path="/admin"
            element={
              <AdminRoute>
                <Layout>
                  <Admin />
                </Layout>
              </AdminRoute>
            }
          />
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
        <Toaster />
      </ThemeProvider>
    </>
  );
}
