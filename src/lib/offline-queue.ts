import Dexie, { Table } from "dexie";
import { supabase } from "@/integrations/supabase/client";

export type Op = "insert" | "update" | "delete";
export interface QueuedMutation {
  id?: number;
  table: string;
  op: Op;
  payload: any;          // for insert/update
  match?: Record<string, any>; // for update/delete
  baseUpdatedAt?: string | null; // optimistic lock for update
  createdAt: number;
  attempts: number;
  lastError?: string;
}

export interface ConflictRow {
  id?: number;
  table: string;
  rowId: string;
  mine: any;
  theirs: any;
  baseUpdatedAt: string | null;
  createdAt: number;
}

class LullabyDB extends Dexie {
  mutations!: Table<QueuedMutation, number>;
  conflicts!: Table<ConflictRow, number>;
  sleep_sessions_cache!: Table<any, string>;
  sleep_interruptions_cache!: Table<any, string>;
  cache_meta!: Table<{ key: string; value: string }, string>;
  child_settings_cache!: Table<any, string>;
  child_user_roles_cache!: Table<any, string>;
  sleep_places_cache!: Table<any, string>;
  settling_methods_cache!: Table<any, string>;

  constructor() {
    super("lullaby_offline");
    this.version(1).stores({
      mutations: "++id, table, createdAt",
      conflicts: "++id, table, rowId, createdAt",
    });
    // v2: read-cache tables for offline access to History / Analytics / Heatmap.
    this.version(2).stores({
      sleep_sessions_cache: "id, child_id, start_time, [child_id+start_time]",
      sleep_interruptions_cache: "id, sleep_session_id, start_time",
      cache_meta: "key",
    });
    // v3: read-cache for per-child context (settings, current user's role,
    // places, methods) — enables CurrentSleep and SleepForm to render offline
    // without falsely disabling gated UI due to a null role.
    this.version(3).stores({
      child_settings_cache: "child_id",
      child_user_roles_cache: "[child_id+user_id], child_id, user_id",
      sleep_places_cache: "id, child_id, deleted_at, [child_id+deleted_at]",
      settling_methods_cache: "id, child_id, deleted_at, [child_id+deleted_at]",
    });
  }
}

export const db = new LullabyDB();

const listeners = new Set<() => void>();
export const onQueueChange = (fn: () => void): (() => void) => {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
};
const emit = () => listeners.forEach((fn) => fn());

export async function enqueue(m: Omit<QueuedMutation, "id" | "createdAt" | "attempts">) {
  await db.mutations.add({ ...m, createdAt: Date.now(), attempts: 0 });
  emit();
  if (navigator.onLine) flush();
}

export async function pendingCount() {
  return db.mutations.count();
}

export async function conflictCount() {
  return db.conflicts.count();
}

let flushing = false;
export async function flush() {
  if (flushing || !navigator.onLine) return;
  flushing = true;
  try {
    while (true) {
      const next = await db.mutations.orderBy("createdAt").first();
      if (!next) break;
      try {
        await applyMutation(next);
        await db.mutations.delete(next.id!);
        emit();
      } catch (e: any) {
        const isConflict = e?.__conflict === true;
        if (isConflict) {
          // recorded already; remove the mutation, surface in UI
          await db.mutations.delete(next.id!);
          emit();
          continue;
        }
        // permanent vs transient: stop trying for now
        await db.mutations.update(next.id!, { attempts: (next.attempts ?? 0) + 1, lastError: String(e?.message ?? e) });
        emit();
        break;
      }
    }
  } finally {
    flushing = false;
  }
}

async function applyMutation(m: QueuedMutation) {
  if (m.op === "insert") {
    const { error } = await (supabase.from(m.table as any) as any).insert(m.payload);
    if (error) throw error;
    return;
  }
  if (m.op === "delete") {
    let q: any = supabase.from(m.table as any).delete();
    for (const [k, v] of Object.entries(m.match ?? {})) q = q.eq(k, v);
    const { error } = await q;
    if (error) throw error;
    return;
  }
  // update with optimistic lock
  const idCol = "id";
  const id = m.match?.[idCol];
  if (id && m.baseUpdatedAt) {
    const { data: server } = await supabase.from(m.table as any).select("*").eq(idCol, id).maybeSingle();
    if (server && (server as any).updated_at && (server as any).updated_at !== m.baseUpdatedAt) {
      // record conflict
      await db.conflicts.add({
        table: m.table, rowId: id,
        mine: m.payload, theirs: server,
        baseUpdatedAt: m.baseUpdatedAt, createdAt: Date.now(),
      });
      const err: any = new Error("conflict");
      err.__conflict = true;
      throw err;
    }
  }
  let q: any = supabase.from(m.table as any).update(m.payload);
  for (const [k, v] of Object.entries(m.match ?? {})) q = q.eq(k, v);
  const { error } = await q;
  if (error) throw error;
}

export async function resolveConflict(conflictId: number, choice: "mine" | "theirs") {
  const c = await db.conflicts.get(conflictId);
  if (!c) return;
  if (choice === "mine") {
    await (supabase.from(c.table as any) as any).update(c.mine).eq("id", c.rowId);
  }
  await db.conflicts.delete(conflictId);
  emit();
}

window.addEventListener("online", () => flush());
