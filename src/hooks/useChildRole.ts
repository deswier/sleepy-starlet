import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useChildren } from "@/contexts/ChildContext";

export type ChildRole = "viewer" | "user" | "admin" | null;

export function useChildRole(): { role: ChildRole; loading: boolean } {
  const { user } = useAuth();
  const { activeChild } = useChildren();
  const [role, setRole] = useState<ChildRole>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    if (!user || !activeChild) { setRole(null); setLoading(false); return; }
    setLoading(true);
    supabase
      .from("child_user_roles")
      .select("role")
      .eq("child_id", activeChild.id)
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return;
        setRole((data?.role as ChildRole) ?? "user");
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, [user?.id, activeChild?.id]);

  return { role, loading };
}

export const canCreateSleep = (r: ChildRole) => r === "user" || r === "admin";
export const canEditOwnSleep = (r: ChildRole) => r === "user" || r === "admin";
export const canEditAnySleep = (r: ChildRole) => r === "admin";
export const canEditChild = (r: ChildRole) => r === "admin";
export const canManageMembers = (r: ChildRole) => r === "admin";