import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useChildren } from "@/contexts/ChildContext";
import { saveLastRoute } from "@/lib/last-route";

/**
 * Persists the current route per-user so the app can restore it on
 * cold start / resume from background. Excludes auth + onboarding routes.
 */
export default function RouteTracker() {
  const location = useLocation();
  const { user } = useAuth();
  const { activeChild } = useChildren();

  useEffect(() => {
    if (!user) return;
    const path = location.pathname + (location.search || "");
    saveLastRoute(path, user.id, activeChild?.id ?? null);
  }, [location.pathname, location.search, user, activeChild]);

  return null;
}