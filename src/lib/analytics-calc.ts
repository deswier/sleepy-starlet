export interface CalcSession {
  start_time: string;
  end_time: string | null;
  sleep_type: "day" | "night";
}

export interface NightWindowConfig {
  start: string; // "HH:MM"
  end: string;
}

function localDayStart(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}

function parseHM(hm: string): [number, number] {
  const [h, m] = hm.split(":").map(Number);
  return [h || 0, m || 0];
}

// Mirrors sessionDay() in Analytics.tsx for night sessions only.
function nightSessionDayMs(s: CalcSession, night: NightWindowConfig): number {
  const start = new Date(s.start_time);
  const [nsH, nsM] = parseHM(night.start);
  const startMin = start.getHours() * 60 + start.getMinutes();
  const nsMin = nsH * 60 + nsM;
  if (startMin >= nsMin && startMin >= 12 * 60) {
    if (!s.end_time) return localDayStart(start).getTime() + 24 * 60 * 60 * 1000;
    const startDay = localDayStart(start).getTime();
    const endDay = localDayStart(new Date(s.end_time)).getTime();
    if (endDay !== startDay) return endDay;
  }
  return localDayStart(start).getTime();
}

/**
 * Night sleep for a calendar day — full session duration, not clipped to day boundary.
 * Mirrors the nightSleep useMemo in DayView.
 * Ongoing sessions (no end_time) use `now` as their effective end, matching the
 * pattern in calcTotalWake/calcTotalDaySleep, so the current day is never blank
 * when night sleep is still in progress.
 */
export function calcNightSleep(
  sessions: CalcSession[],
  day: Date,
  splitByDate: boolean,
  night: NightWindowConfig,
  now: Date = new Date(),
): number {
  const dayMs = day.getTime();
  const nowMs = now.getTime();
  let ns = 0;
  for (const s of sessions) {
    if (s.sleep_type !== "night") continue;
    const startMs = new Date(s.start_time).getTime();
    const endMs = s.end_time ? new Date(s.end_time).getTime() : nowMs;
    const fullMins = Math.round((endMs - startMs) / 60000);
    const attributed = splitByDate
      ? localDayStart(new Date(startMs)).getTime() === dayMs
      : nightSessionDayMs(s, night) === dayMs;
    if (attributed) ns = Math.max(ns, fullMins);
  }
  return ns;
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
