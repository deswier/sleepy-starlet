import { describe, it, expect } from "vitest";
import { calcTotalWake, calcTotalDaySleep, calcNapsCount, calcNightSleep, type CalcSession } from "@/lib/analytics-calc";

// All times are constructed in LOCAL timezone to match how the component works.
// Using Date(year, month, day, h, m) avoids UTC-offset ambiguity.

const BASE = new Date(2024, 4, 14); // May 14 2024 local
function at(h: number, m: number, dayOffset = 0): Date {
  return new Date(BASE.getFullYear(), BASE.getMonth(), BASE.getDate() + dayOffset, h, m, 0, 0);
}
function startOfDay(d = BASE): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}

const s = (start: Date, end: Date | null, type: "day" | "night"): CalcSession => ({
  start_time: start.toISOString(),
  end_time: end ? end.toISOString() : null,
  sleep_type: type,
});

// ─── calcTotalWake ────────────────────────────────────────────────────────────

describe("calcTotalWake", () => {
  it("past day: 24h period minus total sleep", () => {
    // 24*60 - 833 = 607 min = 10h07m
    const sessions: CalcSession[] = [
      s(at(0, 0),  at(7, 30), "night"),  // 7h30m = 450m
      s(at(12, 0), at(13, 53), "day"),   // 1h53m = 113m
      s(at(16, 0), at(20, 30), "day"),   // 4h30m = 270m
    ];
    // total sleep = 450 + 113 + 270 = 833m, wake = 1440 - 833 = 607
    const now = at(23, 59, 1); // well after the day ended
    expect(calcTotalWake(sessions, startOfDay(), now)).toBe(607);
  });

  it("current day: elapsed period minus sleep so far", () => {
    // now = 15:30 → period = 930 min
    // sleep = 8h = 480 min → wake = 930 - 480 = 450 = 7h30m
    const now = at(15, 30);
    const sessions: CalcSession[] = [
      s(at(0, 0), at(8, 0), "night"), // 8h = 480m
    ];
    expect(calcTotalWake(sessions, startOfDay(), now)).toBe(450);
  });

  it("sleep crossing start of day: only counts portion after 00:00", () => {
    // night sleep 23:00 prev day → 01:00 today; today contribution = 60m
    // period = 24h for a past day, so wake = 1440 - 60 = 1380
    const now = at(12, 0, 1); // next day, so the chosen day is fully elapsed
    const sessions: CalcSession[] = [
      s(at(23, 0, -1), at(1, 0), "night"), // starts yesterday, ends 01:00 today
    ];
    expect(calcTotalWake(sessions, startOfDay(), now)).toBe(1440 - 60);
  });

  it("sleep crossing end of day: only counts portion before 24:00", () => {
    // night sleep 23:00 → 01:00 next day; today contribution = 60m (23:00–24:00)
    const now = at(12, 0, 1);
    const sessions: CalcSession[] = [
      s(at(23, 0), at(1, 0, 1), "night"), // ends next day
    ];
    expect(calcTotalWake(sessions, startOfDay(), now)).toBe(1440 - 60);
  });

  it("does not use first-event to last-event period", () => {
    // First sleep at 09:00, last ends at 20:00 — window would be 11h.
    // Must still use 00:00–24:00 for a past day.
    const now = at(0, 0, 1);
    const sessions: CalcSession[] = [
      s(at(9, 0),  at(9, 30), "day"),  // 30m
      s(at(19, 30), at(20, 0), "day"), // 30m
    ];
    // total sleep = 60m, wake = 1440 - 60 = 1380
    expect(calcTotalWake(sessions, startOfDay(), now)).toBe(1380);
  });

  it("uses calendar date, not rolling 24-hour window", () => {
    // Verify the day is anchored at startOfDay(BASE), not at now-24h.
    const yesterday = new Date(BASE.getFullYear(), BASE.getMonth(), BASE.getDate() - 1);
    const now = at(12, 0); // noon today
    const sessions: CalcSession[] = [
      // This session is entirely yesterday — must NOT affect today's wake time
      s(at(10, 0, -1), at(11, 0, -1), "day"),
    ];
    // No sleep within today's calendar boundaries → wake = elapsed (720m)
    expect(calcTotalWake(sessions, startOfDay(), now)).toBe(720);
  });
});

// ─── calcTotalDaySleep ────────────────────────────────────────────────────────

describe("calcTotalDaySleep", () => {
  it("sums multiple day sessions in one calendar day", () => {
    const now = at(0, 0, 1);
    const sessions: CalcSession[] = [
      s(at(9, 30),  at(10, 10), "day"), // 40m
      s(at(13, 0),  at(14, 20), "day"), // 80m
      s(at(17, 0),  at(17, 30), "day"), // 30m
    ];
    expect(calcTotalDaySleep(sessions, startOfDay(), now)).toBe(150); // 2h30m
  });

  it("ignores night sessions", () => {
    const now = at(0, 0, 1);
    const sessions: CalcSession[] = [
      s(at(0, 0),  at(8, 0),  "night"), // 480m — must not count
      s(at(12, 0), at(13, 0), "day"),   // 60m
    ];
    expect(calcTotalDaySleep(sessions, startOfDay(), now)).toBe(60);
  });

  it("day session crossing start of day: counts only portion from 00:00", () => {
    // day nap: yesterday 23:30 → today 00:30; today portion = 30m
    const now = at(12, 0, 1);
    const sessions: CalcSession[] = [
      s(at(23, 30, -1), at(0, 30), "day"),
    ];
    expect(calcTotalDaySleep(sessions, startOfDay(), now)).toBe(30);
  });

  it("day session crossing end of day: counts only portion before 24:00", () => {
    // day nap: 23:30 → next day 00:30; today portion = 30m
    const now = at(12, 0, 1);
    const sessions: CalcSession[] = [
      s(at(23, 30), at(0, 30, 1), "day"),
    ];
    expect(calcTotalDaySleep(sessions, startOfDay(), now)).toBe(30);
  });

  it("current day: caps ongoing session at now", () => {
    // now = 15:30, day session 14:00–16:00 (ongoing past now) → 90m
    const now = at(15, 30);
    const sessions: CalcSession[] = [
      s(at(14, 0), at(16, 0), "day"),
    ];
    expect(calcTotalDaySleep(sessions, startOfDay(), now)).toBe(90);
  });

  it("is independent of totalSleepInWindow and nightSleepInWindow", () => {
    // Even if total sleep = 10h and night sleep = 8h, day sleep is 1h15m
    // because only the actual day sessions are summed.
    const now = at(0, 0, 1);
    const sessions: CalcSession[] = [
      s(at(21, 0, -1), at(7, 0), "night"), // night: spans midnight, 10h total
      s(at(9, 0),      at(10, 15), "day"), // day: 75m = 1h15m
    ];
    expect(calcTotalDaySleep(sessions, startOfDay(), now)).toBe(75);
  });
});

// ─── calcNapsCount ────────────────────────────────────────────────────────────

describe("calcNapsCount", () => {
  it("counts three day sessions", () => {
    const now = at(0, 0, 1);
    const sessions: CalcSession[] = [
      s(at(9, 0),  at(9, 30),  "day"),
      s(at(12, 0), at(13, 0),  "day"),
      s(at(16, 0), at(16, 45), "day"),
    ];
    expect(calcNapsCount(sessions, startOfDay(), now)).toBe(3);
  });

  it("does not count night sessions", () => {
    const now = at(0, 0, 1);
    const sessions: CalcSession[] = [
      s(at(21, 0, -1), at(7, 0), "night"),
      s(at(10, 0),     at(11, 0), "day"),
      s(at(14, 0),     at(15, 0), "day"),
    ];
    expect(calcNapsCount(sessions, startOfDay(), now)).toBe(2);
  });

  it("day session crossing start of day is counted for the new day", () => {
    // nap starts yesterday 23:30, ends today 00:30 → intersects today → count 1
    const now = at(12, 0, 1);
    const sessions: CalcSession[] = [
      s(at(23, 30, -1), at(0, 30), "day"),
    ];
    expect(calcNapsCount(sessions, startOfDay(), now)).toBe(1);
  });

  it("future session not yet within period is not counted", () => {
    // now = 15:30, session 16:00–17:00 is entirely after now → not counted
    const now = at(15, 30);
    const sessions: CalcSession[] = [
      s(at(16, 0), at(17, 0), "day"),
    ];
    expect(calcNapsCount(sessions, startOfDay(), now)).toBe(0);
  });
});

// ─── calcNightSleep ───────────────────────────────────────────────────────────

const NIGHT = { start: "20:00", end: "07:00" };

describe("calcNightSleep", () => {
  it("returns full session duration, not clipped to calendar day", () => {
    // Night sleep 21:00 yesterday → 07:00 today = 10h = 600min.
    // Only 7h falls within today's calendar boundaries, but nightSleep must be 10h.
    const sessions: CalcSession[] = [
      s(at(21, 0, -1), at(7, 0), "night"),
    ];
    expect(calcNightSleep(sessions, startOfDay(), false, NIGHT)).toBe(600);
  });

  it("counts ongoing night session using now as effective end time", () => {
    // Session started previous day at 21:00, still sleeping at 07:00 today = 10h = 600min.
    const now = at(7, 0);
    const sessions: CalcSession[] = [
      s(at(21, 0, -1), null, "night"),
    ];
    expect(calcNightSleep(sessions, startOfDay(), false, NIGHT, now)).toBe(600);
  });

  it("ignores day sessions", () => {
    const sessions: CalcSession[] = [
      s(at(9, 0), at(10, 0), "day"),
    ];
    expect(calcNightSleep(sessions, startOfDay(), false, NIGHT)).toBe(0);
  });

  it("splitByDate=true: uses start date, not end date, for attribution", () => {
    // Night sleep starts today 22:00 → ends tomorrow 06:00 = 8h = 480min.
    // splitByDate attributes by start date → belongs to today.
    const sessions: CalcSession[] = [
      s(at(22, 0), at(6, 0, 1), "night"),
    ];
    expect(calcNightSleep(sessions, startOfDay(), true, NIGHT)).toBe(480);
    // The same session belongs to yesterday in splitByDate mode for tomorrow's view.
    const tomorrow = startOfDay(at(0, 0, 1));
    expect(calcNightSleep(sessions, tomorrow, true, NIGHT)).toBe(0);
  });
});

// ─── totalSleep = nightSleep + totalDaySleep ─────────────────────────────────

describe("totalSleep formula", () => {
  it("equals nightSleep + totalDaySleep, not physical session intersection", () => {
    // Night: 21:00 yesterday → 07:00 today = 10h (600min full duration)
    // Physical today portion of night: 00:00–07:00 = 7h (420min)
    // Day naps: 09:30–10:10 (40min) + 14:00–15:00 (60min) = 100min
    const now = at(0, 0, 1); // well past end of day
    const sessions: CalcSession[] = [
      s(at(21, 0, -1), at(7, 0),  "night"),
      s(at(9, 30),     at(10, 10), "day"),
      s(at(14, 0),     at(15, 0),  "day"),
    ];
    const night = calcNightSleep(sessions, startOfDay(), false, NIGHT);
    const day   = calcTotalDaySleep(sessions, startOfDay(), now);
    expect(night).toBe(600);  // full duration, not 420
    expect(day).toBe(100);
    expect(night + day).toBe(700); // 11h40m — NOT 420 + 100 = 520
  });

  it("no night sleep: totalSleep equals totalDaySleep", () => {
    const now = at(0, 0, 1);
    const sessions: CalcSession[] = [
      s(at(9, 0), at(10, 0), "day"), // 60min
      s(at(13, 0), at(14, 0), "day"), // 60min
    ];
    const night = calcNightSleep(sessions, startOfDay(), false, NIGHT);
    const day   = calcTotalDaySleep(sessions, startOfDay(), now);
    expect(night).toBe(0);
    expect(night + day).toBe(120);
  });
});
