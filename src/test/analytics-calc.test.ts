import { describe, it, expect } from "vitest";
import { calcTotalWake, calcTotalDaySleep, calcNapsCount, calcNightSleep, calcNightTimes, calcDayNightTimes, avgNightTimes, type CalcSession } from "@/lib/analytics-calc";

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

// ─── week score metric parity ─────────────────────────────────────────────────
// Verifies that the calc functions produce the same per-day metrics in both
// DayView and WeekView (the weekly perDay useMemo now delegates to these same
// functions instead of reimplementing the logic independently).

describe("week/day score metric parity", () => {
  it("totalWake is period minus clipped sleep, not 24h minus totalSleep", () => {
    // Night: 21:00 yesterday → 07:00 today (10h full, 7h within today's 00:00–24:00)
    // Day: 09:00–10:00 (60m)
    // totalSleep = 600 + 60 = 660m
    // 24h − 660 = 780 (wrong formula used in old weekly code)
    // calcTotalWake clips everything to calendar day → period=1440, sleep=420+60=480, wake=960
    const now = at(0, 0, 1);
    const sessions: CalcSession[] = [
      s(at(21, 0, -1), at(7, 0),   "night"),
      s(at(9, 0),      at(10, 0),  "day"),
    ];
    const night = calcNightSleep(sessions, startOfDay(), false, NIGHT);
    const day   = calcTotalDaySleep(sessions, startOfDay(), now);
    const wake  = calcTotalWake(sessions, startOfDay(), now);
    expect(night).toBe(600);
    expect(day).toBe(60);
    // calcTotalWake uses clipped sleep (420 night + 60 day = 480), not full totalSleep (660)
    expect(wake).toBe(1440 - 480); // 960, not 1440 - 660 = 780
  });

  it("napsCount counts calendar-day intersections, not attribution-bucket membership", () => {
    // Day nap crosses midnight: 23:30 yesterday → 00:30 today.
    // Attribution (sessionDay) puts it on yesterday (day sleep stays on start date).
    // calcNapsCount uses intersection: the nap overlaps today [00:00, 00:30) → count=1.
    const now = at(12, 0, 1);
    const sessions: CalcSession[] = [
      s(at(23, 30, -1), at(0, 30), "day"),
    ];
    // calcNapsCount: intersection-based → 1
    expect(calcNapsCount(sessions, startOfDay(), now)).toBe(1);
  });

  it("all four metrics are consistent for a typical past day", () => {
    // Night: 20:30 yesterday → 06:30 today (10h = 600m)
    // Nap 1: 09:00–09:45 (45m)
    // Nap 2: 13:00–14:30 (90m)
    // totalDaySleep = 135m, totalSleep = 735m
    // totalWake: clipped sleep within calendar day = 390m (night 00:00–06:30) + 135m = 525m
    //            wake = 1440 − 525 = 915m
    const now = at(0, 0, 1);
    const sessions: CalcSession[] = [
      s(at(20, 30, -1), at(6, 30),  "night"),
      s(at(9, 0),       at(9, 45),  "day"),
      s(at(13, 0),      at(14, 30), "day"),
    ];
    const night = calcNightSleep(sessions, startOfDay(), false, NIGHT);
    const day   = calcTotalDaySleep(sessions, startOfDay(), now);
    const wake  = calcTotalWake(sessions, startOfDay(), now);
    const naps  = calcNapsCount(sessions, startOfDay(), now);
    expect(night).toBe(600);
    expect(day).toBe(135);
    expect(night + day).toBe(735); // totalSleep used by getScoreDetails
    expect(wake).toBe(915);        // 1440 − (390 + 135)
    expect(naps).toBe(2);
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

// ─── calcNightTimes ───────────────────────────────────────────────────────────

describe("calcNightTimes", () => {
  it("returns start and end times of the attributed night session", () => {
    const bedtime = at(21, 0, -1); // 21:00 yesterday
    const wakeup  = at(7, 0);      // 07:00 today
    const sessions: CalcSession[] = [s(bedtime, wakeup, "night")];
    const result = calcNightTimes(sessions, startOfDay(), false, NIGHT);
    expect(result.bedtime?.getHours()).toBe(21);
    expect(result.bedtime?.getMinutes()).toBe(0);
    expect(result.wakeup?.getHours()).toBe(7);
    expect(result.wakeup?.getMinutes()).toBe(0);
  });

  it("returns null wakeup for an ongoing session", () => {
    const sessions: CalcSession[] = [s(at(21, 0, -1), null, "night")];
    const result = calcNightTimes(sessions, startOfDay(), false, NIGHT);
    expect(result.bedtime).not.toBeNull();
    expect(result.wakeup).toBeNull();
  });

  it("returns null for both when no night session attributed to the day", () => {
    const sessions: CalcSession[] = [s(at(9, 0), at(10, 0), "day")];
    const result = calcNightTimes(sessions, startOfDay(), false, NIGHT);
    expect(result.bedtime).toBeNull();
    expect(result.wakeup).toBeNull();
  });

  it("does not clip bedtime to calendar day — preserves exact session start", () => {
    // Session starts yesterday at 20:30; bedtime must be 20:30, not 00:00.
    const sessions: CalcSession[] = [s(at(20, 30, -1), at(6, 30), "night")];
    const result = calcNightTimes(sessions, startOfDay(), false, NIGHT);
    expect(result.bedtime?.getHours()).toBe(20);
    expect(result.bedtime?.getMinutes()).toBe(30);
    expect(result.wakeup?.getHours()).toBe(6);
    expect(result.wakeup?.getMinutes()).toBe(30);
  });

  it("picks the same session as calcNightSleep when an ongoing and a completed session coexist", () => {
    // now = 22:00; ongoing started 21:30 (30 min elapsed), completed 21:00→07:00 (10h)
    // calcNightSleep: max(30, 600) = 600 → picks completed session
    // calcNightTimes must also pick the completed session (bedtime 21:00)
    const now = at(22, 0);
    const sessions: CalcSession[] = [
      s(at(21, 0, -1), at(7, 0), "night"),  // completed: 10h
      s(at(21, 30), null, "night"),          // ongoing: 30 min so far
    ];
    const duration = calcNightSleep(sessions, startOfDay(), false, NIGHT, now);
    const times = calcNightTimes(sessions, startOfDay(), false, NIGHT, now);
    expect(duration).toBe(600); // 10h = completed session
    // bedtime must correspond to the same 10h session, not the 30-min ongoing one
    expect(times.bedtime?.getHours()).toBe(21);
    expect(times.bedtime?.getMinutes()).toBe(0);
    expect(times.wakeup?.getHours()).toBe(7);
  });

  it("splitByDate: attributes by start date, not end date", () => {
    // Session starts today 22:00 → ends tomorrow 06:00.
    // splitByDate=true → attributed to today by start date.
    const sessions: CalcSession[] = [s(at(22, 0), at(6, 0, 1), "night")];
    const today = calcNightTimes(sessions, startOfDay(), true, NIGHT);
    expect(today.bedtime?.getHours()).toBe(22);
    // Not attributed to tomorrow in splitByDate mode.
    const tomorrow = calcNightTimes(sessions, startOfDay(at(0, 0, 1)), true, NIGHT);
    expect(tomorrow.bedtime).toBeNull();
  });
});

// ─── calcDayNightTimes ──────────────────────────────────────────────────────────

describe("calcDayNightTimes", () => {
  it("returns bedtime and wakeup of the overnight block", () => {
    const sessions: CalcSession[] = [s(at(21, 0, -1), at(7, 0), "night")];
    const r = calcDayNightTimes(sessions, startOfDay(), false, NIGHT);
    expect(r.bedtime?.getHours()).toBe(21);
    expect(r.wakeup?.getHours()).toBe(7);
    expect(r.wakeup?.getMinutes()).toBe(0);
  });

  it("aggregates a fragmented night: bedtime of first segment, wakeup of last", () => {
    // Night logged as two segments after a 3am rousing.
    const sessions: CalcSession[] = [
      s(at(21, 0, -1), at(3, 0), "night"), // 21:00 → 03:00
      s(at(3, 30), at(7, 0), "night"),     // 03:30 → 07:00
    ];
    const r = calcDayNightTimes(sessions, startOfDay(), false, NIGHT);
    expect(r.bedtime?.getHours()).toBe(21);
    expect(r.wakeup?.getHours()).toBe(7);
  });

  it("ignores an evening night micro-sleep when picking the wake-up time", () => {
    // Real overnight ends at 07:00. Later the same evening a short "night" sleep
    // 20:30→20:50 is logged; it does not cross midnight, so it is attributed to
    // this day. Its end must NOT become the day's wake-up time.
    const sessions: CalcSession[] = [
      s(at(21, 0, -1), at(7, 0), "night"), // overnight → wakeup 07:00
      s(at(20, 30), at(20, 50), "night"),  // evening micro-sleep, same day
    ];
    const r = calcDayNightTimes(sessions, startOfDay(), false, NIGHT);
    expect(r.bedtime?.getHours()).toBe(21);
    expect(r.wakeup?.getHours()).toBe(7);
    expect(r.wakeup?.getMinutes()).toBe(0);
  });

  it("splitByDate: evening micro-sleep does not steal bedtime/wakeup", () => {
    // Both the main night (22:00 → 06:00 next day) and an evening micro-sleep
    // (19:30 → 19:50) start today, so both are attributed to today by start date.
    const sessions: CalcSession[] = [
      s(at(22, 0), at(6, 0, 1), "night"), // main night, crosses midnight
      s(at(19, 30), at(19, 50), "night"), // evening micro-sleep
    ];
    const r = calcDayNightTimes(sessions, startOfDay(), true, NIGHT);
    expect(r.bedtime?.getHours()).toBe(22); // not 19:30
    expect(r.wakeup?.getHours()).toBe(6);   // not 19:50
  });

  it("keeps an ongoing night as bedtime with null wakeup", () => {
    const sessions: CalcSession[] = [s(at(21, 0, -1), null, "night")];
    const r = calcDayNightTimes(sessions, startOfDay(), false, NIGHT);
    expect(r.bedtime?.getHours()).toBe(21);
    expect(r.wakeup).toBeNull();
  });
});

// ─── avgNightTimes ────────────────────────────────────────────────────────────

describe("avgNightTimes", () => {
  function makeDate(h: number, m: number): Date {
    const d = new Date(BASE);
    d.setHours(h, m, 0, 0);
    return d;
  }

  it("returns null when given empty array", () => {
    const result = avgNightTimes([]);
    expect(result.avgBedtime).toBeNull();
    expect(result.avgWakeup).toBeNull();
  });

  it("returns the single value when given one entry", () => {
    const result = avgNightTimes([{ bedtime: makeDate(21, 30), wakeup: makeDate(7, 0) }]);
    expect(result.avgBedtime?.getHours()).toBe(21);
    expect(result.avgBedtime?.getMinutes()).toBe(30);
    expect(result.avgWakeup?.getHours()).toBe(7);
    expect(result.avgWakeup?.getMinutes()).toBe(0);
  });

  it("averages symmetric bedtimes correctly", () => {
    // 20:00 and 22:00 → avg 21:00
    const result = avgNightTimes([
      { bedtime: makeDate(20, 0), wakeup: null },
      { bedtime: makeDate(22, 0), wakeup: null },
    ]);
    expect(result.avgBedtime?.getHours()).toBe(21);
    expect(result.avgBedtime?.getMinutes()).toBe(0);
  });

  it("averages wakeup times correctly", () => {
    // 06:00 and 08:00 → avg 07:00
    const result = avgNightTimes([
      { bedtime: null, wakeup: makeDate(6, 0) },
      { bedtime: null, wakeup: makeDate(8, 0) },
    ]);
    expect(result.avgWakeup?.getHours()).toBe(7);
    expect(result.avgWakeup?.getMinutes()).toBe(0);
  });

  it("handles midnight-crossing bedtimes with noon anchor", () => {
    // 23:00 and 01:00 → avg 00:00
    const result = avgNightTimes([
      { bedtime: makeDate(23, 0), wakeup: null },
      { bedtime: makeDate(1, 0), wakeup: null },
    ]);
    expect(result.avgBedtime?.getHours()).toBe(0);
    expect(result.avgBedtime?.getMinutes()).toBe(0);
  });

  it("ignores null bedtimes when averaging", () => {
    const result = avgNightTimes([
      { bedtime: makeDate(21, 0), wakeup: null },
      { bedtime: null, wakeup: null },
    ]);
    expect(result.avgBedtime?.getHours()).toBe(21);
  });
});
