const KEY = "last_route_v1";
const USER_KEY = "last_route_user_v1";

export interface LastRoute {
  path: string;
  childId?: string | null;
}

// Routes that should never be restored on resume.
const EXCLUDED = new Set<string>(["/auth", "/child/new"]);

export function saveLastRoute(path: string, userId: string | null | undefined, childId?: string | null) {
  if (!userId) return;
  if (EXCLUDED.has(path)) return;
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
    if (!parsed?.path || EXCLUDED.has(parsed.path)) return null;
    return parsed;
  } catch { return null; }
}

export function clearLastRoute() {
  try {
    localStorage.removeItem(KEY);
    localStorage.removeItem(USER_KEY);
  } catch { /* ignore */ }
}