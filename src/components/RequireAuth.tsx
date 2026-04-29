import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";

export default function RequireAuth({ children }: { children: JSX.Element }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="min-h-screen bg-hero" />;
  if (!user) return <Navigate to="/auth" replace />;
  return children;
}
