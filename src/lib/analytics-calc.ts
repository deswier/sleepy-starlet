export interface CalcSession {
  start_time: string;
  end_time: string | null;
  sleep_type: "day" | "night";
}

/** Returns [dayStart, dayEnd) in ms for the given calendar day and current time. */
function dayBounds(day: Date, now: Date): { dayStartMs: number; dayEndMs: number } {
  const dayStartMs = day.getTime();
  const nowMs = now.getTime();
  const nextDayMs = dayStartMs + 24 * 60 * 60 * 1000;
  const dayEndMs = nowMs >= dayStartMs && nowMs < nextDayMs ? nowMs : nextDayMs;
  return { dayStartMs, dayEndMs };
}

/**
 * Wake time for a calendar day.
 * Formula: period_duration − sum of all sleep clipped to [dayStart, dayEnd).
 */
export function calcTotalWake(sessions: CalcSession[], day: Date, now: Date): number {
  const nowMs = now.getTime();
  const { dayStartMs, dayEndMs } = dayBounds(day, now);
  const periodMin = Math.round((dayEndMs - dayStartMs) / 60000);
  let sleepMin = 0;
  for (const s of sessions) {
    const sStart = new Date(s.start_time).getTime();
    const sEnd = s.end_time ? new Date(s.end_time).getTime() : nowMs;
    const ov = Math.min(sEnd, dayEndMs) - Math.max(sStart, dayStartMs);
    if (ov > 0) sleepMin += Math.round(ov / 60000);
  }
  return Math.max(0, periodMin - sleepMin);
}

/**
 * Total day-sleep time for a calendar day.
 * Only sleep_type === "day" sessions, clipped to [dayStart, dayEnd).
 */
export function calcTotalDaySleep(sessions: CalcSession[], day: Date, now: Date): number {
  const nowMs = now.getTime();
  const { dayStartMs, dayEndMs } = dayBounds(day, now);
  let total = 0;
  for (const s of sessions) {
    if (s.sleep_type !== "day") continue;
    const sStart = new Date(s.start_time).getTime();
    const sEnd = s.end_time ? new Date(s.end_time).getTime() : nowMs;
    const ov = Math.min(sEnd, dayEndMs) - Math.max(sStart, dayStartMs);
    if (ov > 0) total += Math.round(ov / 60000);
  }
  return total;
}

/**
 * Number of day-sleep sessions that intersect the calendar day.
 * Uses physical calendar boundary, not attribution logic.
 */
export function calcNapsCount(sessions: CalcSession[], day: Date, now: Date): number {
  const nowMs = now.getTime();
  const { dayStartMs, dayEndMs } = dayBounds(day, now);
  let count = 0;
  for (const s of sessions) {
    if (s.sleep_type !== "day") continue;
    const sStart = new Date(s.start_time).getTime();
    const sEnd = s.end_time ? new Date(s.end_time).getTime() : nowMs;
    const ov = Math.min(sEnd, dayEndMs) - Math.max(sStart, dayStartMs);
    if (ov > 0) count++;
  }
  return count;
}
