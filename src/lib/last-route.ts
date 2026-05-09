const KEY = "last_route_v1";
const USER_KEY = "last_route_user_v1";

export interface LastRoute {
  path: string;
  childId?: string | null;
}

// Explicit allowlist: only restore paths that belong to known app screens.
// Any path not in this set (including /auth, /child/new, external URLs,
// or future one-off flows) is silently dropped.
const ALLOWED = new Set<string>([
  "/", "/history", "/analytics", "/heatmap", "/profile",
  "/settings", "/conflicts", "/deleted-children",
]);

function isAllowed(path: string): boolean {
  return ALLOWED.has(path.split("?")[0]);
}

export function saveLastRoute(path: string, userId: string | null | undefined, childId?: string | null) {
  if (!userId) return;
  if (!isAllowed(path)) return;
  try {
    localStorage.setItem(KEY, JSON.stringify({ path, childId: childId ?? null }));
    localStorage.setItem(USER_KEY, userId);
  } catch { /* ignore */ }
}

export function readLastRoute(userId: string): LastRoute | null {
  try {
    const u = localStorage.getItem(USER_KEY);
    if (u !== userId) return null;
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as LastRoute;
    if (!parsed?.path || !isAllowed(parsed.path)) return null;
    return parsed;
  } catch { return null; }
}

export function clearLastRoute() {
  try {
    localStorage.removeItem(KEY);
    localStorage.removeItem(USER_KEY);
  } catch { /* ignore */ }
}
