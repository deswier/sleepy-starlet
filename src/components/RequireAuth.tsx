import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";

export default function RequireAuth({ children }: { children: JSX.Element }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="min-h-screen bg-hero" />;
  if (!user) return <Navigate to="/auth" replace />;
  // Gate unconfirmed email-provider accounts. OAuth providers (Google) always
  // mark email as confirmed, so this only blocks password signups that haven't
  // clicked their confirmation link yet.
  const isEmailProvider = user.app_metadata?.provider === "email";
  if (isEmailProvider && !user.email_confirmed_at) return <Navigate to="/auth" replace />;
  return children;
}
