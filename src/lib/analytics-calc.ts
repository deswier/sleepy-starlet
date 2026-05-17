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

export interface NightTimes {
  bedtime: Date | null;
  wakeup: Date | null;
}

/**
 * Bedtime and wake-up time for the night session attributed to the given calendar day.
 * Uses the same attribution logic as calcNightSleep.
 * Bedtime = session start (evening); wakeup = session end (morning, may be null if ongoing).
 * Cross-midnight sessions are handled correctly — no calendar clipping.
 */
export function calcNightTimes(
  sessions: CalcSession[],
  day: Date,
  splitByDate: boolean,
  night: NightWindowConfig,
  now: Date = new Date(),
): NightTimes {
  const dayMs = day.getTime();
  const nowMs = now.getTime();
  let best: CalcSession | null = null;
  let bestDuration = -1;

  for (const s of sessions) {
    if (s.sleep_type !== "night") continue;
    const attributed = splitByDate
      ? localDayStart(new Date(s.start_time)).getTime() === dayMs
      : nightSessionDayMs(s, night) === dayMs;
    if (!attributed) continue;
    const startMs = new Date(s.start_time).getTime();
    const endMs = s.end_time ? new Date(s.end_time).getTime() : nowMs;
    const dur = endMs - startMs;
    if (dur > bestDuration) {
      bestDuration = dur;
      best = s;
    }
  }

  if (!best) return { bedtime: null, wakeup: null };
  return {
    bedtime: new Date(best.start_time),
    wakeup: best.end_time ? new Date(best.end_time) : null,
  };
}

/**
 * Night sleep duration for a calendar day — sums all attributed night sessions.
 * Used by both daily and weekly analytics.
 */
export function calcDayNightSleep(
  sessions: CalcSession[],
  day: Date,
  splitByDate: boolean,
  night: NightWindowConfig,
  now: Date = new Date(),
): number {
  const dayMs = day.getTime();
  const nowMs = now.getTime();
  let total = 0;
  for (const s of sessions) {
    if (s.sleep_type !== "night") continue;
    const startMs = new Date(s.start_time).getTime();
    const endMs = s.end_time ? new Date(s.end_time).getTime() : nowMs;
    const fullMins = Math.round((endMs - startMs) / 60000);
    const attributed = splitByDate
      ? localDayStart(new Date(startMs)).getTime() === dayMs
      : nightSessionDayMs(s, night) === dayMs;
    if (attributed) total += fullMins;
  }
  return total;
}

/**
 * Bedtime and wake-up time across all night sessions attributed to the given calendar day.
 * Bedtime = start of the first matching session.
 * Wakeup = end of the last completed (has end_time) matching session.
 */
export function calcDayNightTimes(
  sessions: CalcSession[],
  day: Date,
  splitByDate: boolean,
  night: NightWindowConfig,
): NightTimes {
  const dayMs = day.getTime();
  const matching: CalcSession[] = [];

  for (const s of sessions) {
    if (s.sleep_type !== "night") continue;
    const attributed = splitByDate
      ? localDayStart(new Date(s.start_time)).getTime() === dayMs
      : nightSessionDayMs(s, night) === dayMs;
    if (attributed) matching.push(s);
  }

  if (matching.length === 0) return { bedtime: null, wakeup: null };

  matching.sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());

  const first = matching[0];
  let lastCompleted: CalcSession | null = null;
  for (let i = matching.length - 1; i >= 0; i--) {
    if (matching[i].end_time) {
      lastCompleted = matching[i];
      break;
    }
  }

  return {
    bedtime: new Date(first.start_time),
    wakeup: lastCompleted ? new Date(lastCompleted.end_time!) : null,
  };
}

/**
 * Average bedtime and wake-up time across multiple days.
 * Days without night sleep data should be filtered out by the caller before passing.
 * Uses noon as anchor for bedtime averaging to correctly handle evening–midnight wrapping.
 */
export function avgNightTimes(perDayTimes: NightTimes[]): { avgBedtime: Date | null; avgWakeup: Date | null } {
  const bedtimes = perDayTimes.filter((t) => t.bedtime !== null).map((t) => t.bedtime!);
  const wakeups = perDayTimes.filter((t) => t.wakeup !== null).map((t) => t.wakeup!);
  return {
    avgBedtime: avgTimeOfDay(bedtimes, 12 * 60),
    avgWakeup: avgTimeOfDay(wakeups, 0),
  };
}

function avgTimeOfDay(dates: Date[], anchorMin: number): Date | null {
  if (dates.length === 0) return null;
  const offsets = dates.map((d) => {
    const m = d.getHours() * 60 + d.getMinutes();
    return ((m - anchorMin) + 24 * 60) % (24 * 60);
  });
  const avg = Math.round(offsets.reduce((a, b) => a + b, 0) / offsets.length);
  const total = (avg + anchorMin) % (24 * 60);
  const result = new Date();
  result.setHours(Math.floor(total / 60), total % 60, 0, 0);
  return result;
}
