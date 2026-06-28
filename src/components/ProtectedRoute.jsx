import { Navigate } from "react-router-dom";
import { isLoggedIn } from "../lib/api.js";
import { useUser } from "../context/UserContext.jsx";

export default function ProtectedRoute({ children }) {
  if (!isLoggedIn()) return <Navigate to="/login" replace />;
  return children;
}

export function AdminRoute({ children }) {
  const { user, loading } = useUser();
  if (!isLoggedIn()) return <Navigate to="/login" replace />;
  if (loading) return null;
  if (user?.role !== "admin") return <Navigate to="/" replace />;
  return children;
}
