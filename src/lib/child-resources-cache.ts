import { db } from "./offline-queue";

// Per-child resource caches: settings, current user's role, and the
// active (non-deleted) places / methods. Populated as a write-through side
// effect of network fetches so CurrentSleep / SleepForm / gated UI can
// render meaningfully on cold-start offline. Wiped on signOut.

export interface CachedChildSettings {
  child_id: string;
  night_start_time: string;
  night_end_time: string;
  split_night_sleep_by_date: boolean;
  show_sleep_place: boolean;
  show_falling_asleep_method: boolean;
  show_interruptions: boolean;
}

export type CachedChildRole = "viewer" | "user" | "admin";

export interface CachedNamedResource {
  id: string;
  child_id: string;
  name: string;
  deleted_at: string | null;
}

// ─── settings ────────────────────────────────────────────────────────────────

export async function putChildSettings(s: CachedChildSettings): Promise<void> {
  await db.child_settings_cache.put(s);
}

export async function getChildSettings(childId: string): Promise<CachedChildSettings | null> {
  return (await db.child_settings_cache.get(childId)) ?? null;
}

// ─── role (per child, per user) ──────────────────────────────────────────────

export async function putChildRole(childId: string, userId: string, role: CachedChildRole): Promise<void> {
  await db.child_user_roles_cache.put({ child_id: childId, user_id: userId, role });
}

export async function getChildRole(childId: string, userId: string): Promise<CachedChildRole | null> {
  const row = await db.child_user_roles_cache.get([childId, userId]);
  return (row?.role as CachedChildRole | undefined) ?? null;
}

// ─── places ──────────────────────────────────────────────────────────────────

export async function putPlaces(childId: string, active: { id: string; name: string }[]): Promise<void> {
  // Replace the child's cached place set atomically so soft-deletes elsewhere
  // vanish here too. Existing rows for other children are left alone.
  await db.transaction("rw", db.sleep_places_cache, async () => {
    const existing = await db.sleep_places_cache.where("child_id").equals(childId).primaryKeys();
    const fresh = new Set(active.map((p) => p.id));
    const toDelete = (existing as string[]).filter((id) => !fresh.has(id));
    if (toDelete.length) await db.sleep_places_cache.bulkDelete(toDelete);
    await db.sleep_places_cache.bulkPut(
      active.map((p) => ({ id: p.id, child_id: childId, name: p.name, deleted_at: null })),
    );
  });
}

export async function getActivePlaces(childId: string): Promise<{ id: string; name: string }[]> {
  // Compound `[child_id+deleted_at]` skips rows where deleted_at is null
  // (Dexie doesn't index null in compound keys). Query by child_id then
  // filter — per-child list is small (dozens at most).
  const rows = await db.sleep_places_cache.where("child_id").equals(childId).toArray();
  return rows
    .filter((r) => r.deleted_at == null)
    .map((r) => ({ id: r.id, name: r.name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

// Optimistic mutation of the cache after a Settings-side insert / soft-delete
// so the next SleepForm / CurrentSleep open sees the change without waiting
// for the next network refresh.
export async function upsertPlace(childId: string, row: { id: string; name: string }): Promise<void> {
  await db.sleep_places_cache.put({ id: row.id, child_id: childId, name: row.name, deleted_at: null });
}

export async function markPlaceDeleted(id: string): Promise<void> {
  await db.sleep_places_cache.update(id, { deleted_at: new Date().toISOString() });
}

// ─── methods ─────────────────────────────────────────────────────────────────

export async function putMethods(childId: string, active: { id: string; name: string }[]): Promise<void> {
  await db.transaction("rw", db.settling_methods_cache, async () => {
    const existing = await db.settling_methods_cache.where("child_id").equals(childId).primaryKeys();
    const fresh = new Set(active.map((m) => m.id));
    const toDelete = (existing as string[]).filter((id) => !fresh.has(id));
    if (toDelete.length) await db.settling_methods_cache.bulkDelete(toDelete);
    await db.settling_methods_cache.bulkPut(
      active.map((m) => ({ id: m.id, child_id: childId, name: m.name, deleted_at: null })),
    );
  });
}

export async function getActiveMethods(childId: string): Promise<{ id: string; name: string }[]> {
  const rows = await db.settling_methods_cache.where("child_id").equals(childId).toArray();
  return rows
    .filter((r) => r.deleted_at == null)
    .map((r) => ({ id: r.id, name: r.name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function upsertMethod(childId: string, row: { id: string; name: string }): Promise<void> {
  await db.settling_methods_cache.put({ id: row.id, child_id: childId, name: row.name, deleted_at: null });
}

export async function markMethodDeleted(id: string): Promise<void> {
  await db.settling_methods_cache.update(id, { deleted_at: new Date().toISOString() });
}

// ─── wipe on signOut ────────────────────────────────────────────────────────

export async function wipeChildResourceCaches(): Promise<void> {
  await Promise.all([
    db.child_settings_cache.clear(),
    db.child_user_roles_cache.clear(),
    db.sleep_places_cache.clear(),
    db.settling_methods_cache.clear(),
  ]);
}
