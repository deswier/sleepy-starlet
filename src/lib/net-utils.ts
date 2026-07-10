/**
 * Races a promise against a timeout. Returns the promise result if it settles
 * before `ms` milliseconds, otherwise returns null. Never rejects.
 *
 * Use this for read-only network fetches that have a cached fallback — the
 * caller shows cached data immediately and calls withTimeout to try a silent
 * background refresh. If the network is "connected but no internet" (common
 * on mobile), navigator.onLine is unreliable and Supabase would otherwise
 * wait 30-90 s for a TCP timeout.
 */
export function withTimeout<T>(promise: Promise<{ data: T | null; error: any }>, ms: number) {
  return Promise.race([
    promise,
    new Promise<null>((resolve) => setTimeout(() => resolve(null), ms)),
  ]);
}
