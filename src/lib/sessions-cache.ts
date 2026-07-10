import { db, type QueuedMutation } from "./offline-queue";
import type { SleepSession } from "./sleep-utils";

// Minimal interruption shape needed for Heatmap offline display.
export interface CachedInterruption {
  id: string;
  sleep_session_id: string;
  start_time: string;
  end_time: string | null;
  settling_method_id: string | null;
  settling_method_name: string | null;
}

// ─── write ────────────────────────────────────────────────────────────────────

export async function putSessions(sessions: SleepSession[]): Promise<void> {
  if (!sessions.length) return;
  await db.sleep_sessions_cache.bulkPut(sessions);
}

export async function putInterruptions(interruptions: CachedInterruption[]): Promise<void> {
  if (!interruptions.length) return;
  await db.sleep_interruptions_cache.bulkPut(interruptions);
}

// ─── read ─────────────────────────────────────────────────────────────────────

export async function getSessions(
  childId: string,
  since: Date,
  until: Date,
): Promise<SleepSession[]> {
  return db.sleep_sessions_cache
    .where("[child_id+start_time]")
    .between([childId, since.toISOString()], [childId, until.toISOString()])
    .toArray() as Promise<SleepSession[]>;
}

export async function getInterruptionsForRange(
  since: Date,
  until: Date,
): Promise<CachedInterruption[]> {
  return db.sleep_interruptions_cache
    .where("start_time")
    .between(since.toISOString(), until.toISOString())
    .toArray() as Promise<CachedInterruption[]>;
}

// Returns the most recent active (no end_time) session for a child from cache.
export async function getActiveSession(childId: string): Promise<SleepSession | null> {
  const rows = await db.sleep_sessions_cache
    .where("child_id").equals(childId)
    .toArray();
  const active = rows.filter((s) => !s.end_time);
  if (!active.length) return null;
  return active.sort(
    (a, b) => new Date(b.start_time).getTime() - new Date(a.start_time).getTime(),
  )[0] as SleepSession;
}

// Returns all cached interruptions for a specific session.
export async function getInterruptionsForSession(sessionId: string): Promise<CachedInterruption[]> {
  return db.sleep_interruptions_cache
    .where("sleep_session_id").equals(sessionId)
    .toArray() as Promise<CachedInterruption[]>;
}

// ─── projection ───────────────────────────────────────────────────────────────

// Applies pending sleep_sessions mutations on top of cached rows so that
// offline edits/deletes are immediately visible before flush.
// Inserts are omitted until Phase 2 adds stable client-generated UUIDs.
export function projectSessionMutations(
  sessions: SleepSession[],
  pending: QueuedMutation[],
): SleepSession[] {
  const relevant = pending.filter((m) => m.table === "sleep_sessions");
  if (!relevant.length) return sessions;

  let result = [...sessions];
  for (const m of relevant) {
    const id = m.match?.id as string | undefined;
    if (m.op === "update" && id) {
      const idx = result.findIndex((s) => s.id === id);
      if (idx >= 0) result[idx] = { ...result[idx], ...m.payload } as SleepSession;
    } else if (m.op === "delete" && id) {
      result = result.filter((s) => s.id !== id);
    }
  }
  return result;
}
