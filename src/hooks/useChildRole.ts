import { useChildren, type ChildRole } from "@/contexts/ChildContext";

export type { ChildRole };

// Thin wrapper: role lives in ChildContext now (one fetch per child switch
// instead of per-component). Kept for backwards-compat of import paths.
export function useChildRole(): { role: ChildRole; loading: boolean } {
  const { role, loading } = useChildren();
  return { role, loading };
}

export const canCreateSleep = (r: ChildRole) => r === "user" || r === "admin";
export const canEditOwnSleep = (r: ChildRole) => r === "user" || r === "admin";
export const canEditAnySleep = (r: ChildRole) => r === "admin";
export const canEditChild = (r: ChildRole) => r === "admin";
export const canManageMembers = (r: ChildRole) => r === "admin";
