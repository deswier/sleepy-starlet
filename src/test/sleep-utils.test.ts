import { describe, it, expect } from "vitest";
import {
  formatDuration,
  formatClockTime,
  sessionDuration,
  wakeWindowMinutes,
  inferSleepType,
  wakeWindowForAge,
  ageInMonthsAt,
  wwStatus,
  type SleepSession,
  type TimeFormat,
} from "@/lib/sleep-utils";

// ─── formatDuration ────────────────────────────────────────────────────────

describe("formatDuration", () => {
  describe("EN", () => {
    it("returns 0m for 0 minutes", () => expect(formatDuration(0, "en")).toBe("0m"));
    it("returns 0m for negative minutes", () => expect(formatDuration(-5, "en")).toBe("0m"));
    it("returns minutes only when < 60", () => expect(formatDuration(45, "en")).toBe("45m"));
    it("returns hours only when no remainder", () => expect(formatDuration(60, "en")).toBe("1h"));
    it("zero-pads minutes when hours present", () => expect(formatDuration(65, "en")).toBe("1h05m"));
    it("does not pad when minutes >= 10", () => expect(formatDuration(75, "en")).toBe("1h15m"));
    it("handles large values", () => expect(formatDuration(315, "en")).toBe("5h15m"));
    it("does not produce HH:mm format", () => expect(formatDuration(90, "en")).not.toMatch(/^\d+:\d+/));
  });

  describe("RU", () => {
    it("returns 0м for 0 minutes", () => expect(formatDuration(0, "ru")).toBe("0м"));
    it("returns minutes with cyrillic suffix", () => expect(formatDuration(45, "ru")).toBe("45м"));
    it("returns hours with cyrillic suffix", () => expect(formatDuration(60, "ru")).toBe("1ч"));
    it("zero-pads minutes when hours present", () => expect(formatDuration(65, "ru")).toBe("1ч05м"));
    it("handles large values", () => expect(formatDuration(315, "ru")).toBe("5ч15м"));
  });
});

// ─── formatClockTime ───────────────────────────────────────────────────────

describe("formatClockTime", () => {
  const date = new Date(2024, 0, 1, 14, 30, 0); // 14:30 local

  it("h24 always returns 24-hour format", () => {
    const result = formatClockTime(date, "en", "h24");
    expect(result).toMatch(/14[: ]30/); // colon or narrow no-break space
  });

  it("h12 returns AM/PM format", () => {
    const result = formatClockTime(date, "en", "h12");
    expect(result).toMatch(/PM|pm/i);
    expect(result).toMatch(/2/); // 2 PM
  });

  it("accepts ISO string as input", () => {
    const iso = new Date(2024, 0, 1, 9, 5, 0).toISOString();
    const result = formatClockTime(iso, "en", "h24");
    expect(result).toMatch(/09[: ]05|9[: ]05/);
  });

  it("22:00 renders with hour 22 in h24", () => {
    const late = new Date(2024, 0, 1, 22, 0, 0);
    const result = formatClockTime(late, "en", "h24");
    expect(result).toMatch(/22/);
  });});

// ─── sessionDuration ───────────────────────────────────────────────────────

describe("sessionDuration", () => {
  const base: SleepSession = {
    id: "s1", child_id: "c1",
    start_time: "2024-01-01T08:00:00.000Z",
    end_time: null,
    sleep_type: "day",
    sleep_place_id: null, settling_method_id: null, comment: null,
    created_by_user_id: null,
  };

  it("calculates duration from start to end_time", () => {
    const s = { ...base, end_time: "2024-01-01T09:30:00.000Z" };
    expect(sessionDuration(s)).toBe(90);
  });

  it("uses `now` parameter for ongoing sessions", () => {
    const now = new Date("2024-01-01T09:00:00.000Z");
    expect(sessionDuration(base, now)).toBe(60);
  });

  it("returns 0 for zero-length session", () => {
    const s = { ...base, end_time: base.start_time };
    expect(sessionDuration(s)).toBe(0);
  });
});

// ─── wakeWindowMinutes ─────────────────────────────────────────────────────

describe("wakeWindowMinutes", () => {
  const make = (start: string, end: string | null): SleepSession => ({
    id: "x", child_id: "c",
    start_time: start, end_time: end,
    sleep_type: "day",
    sleep_place_id: null, settling_method_id: null, comment: null,
    created_by_user_id: null,
  });

  it("calculates minutes between two sessions", () => {
    const prev = make("2024-01-01T08:00:00Z", "2024-01-01T09:00:00Z");
    const curr = make("2024-01-01T10:30:00Z", "2024-01-01T11:30:00Z");
    expect(wakeWindowMinutes(prev, curr)).toBe(90);
  });

  it("returns null when previous session has no end_time", () => {
    const prev = make("2024-01-01T08:00:00Z", null);
    const curr = make("2024-01-01T10:00:00Z", null);
    expect(wakeWindowMinutes(prev, curr)).toBeNull();
  });
});

// ─── inferSleepType ────────────────────────────────────────────────────────

describe("inferSleepType", () => {
  const nightStart = "20:00";
  const nightEnd = "07:00";

  it("classifies as night when start is after night_start", () => {
    expect(inferSleepType(new Date(2024, 0, 1, 21, 0), nightStart, nightEnd)).toBe("night");
  });

  it("classifies as night when start is before night_end (early morning)", () => {
    expect(inferSleepType(new Date(2024, 0, 1, 3, 0), nightStart, nightEnd)).toBe("night");
  });

  it("classifies as day during daytime", () => {
    expect(inferSleepType(new Date(2024, 0, 1, 13, 0), nightStart, nightEnd)).toBe("day");
  });

  it("classifies exactly at night_start as night", () => {
    expect(inferSleepType(new Date(2024, 0, 1, 20, 0), nightStart, nightEnd)).toBe("night");
  });

  it("classifies exactly at night_end as day", () => {
    expect(inferSleepType(new Date(2024, 0, 1, 7, 0), nightStart, nightEnd)).toBe("day");
  });

  it("handles non-wrapping night window (e.g. 22:00–06:00 → same logic)", () => {
    expect(inferSleepType(new Date(2024, 0, 1, 14, 0), "22:00", "06:00")).toBe("day");
  });
});

// ─── wakeWindowForAge ──────────────────────────────────────────────────────

describe("wakeWindowForAge", () => {
  it("returns narrowest window for newborns (0 months)", () => {
    const ww = wakeWindowForAge(0);
    expect(ww.min).toBe(30);
    expect(ww.max).toBe(60);
  });

  it("returns wider window for 6-month-old", () => {
    const ww = wakeWindowForAge(6);
    expect(ww.min).toBeGreaterThan(60);
  });

  it("returns max range for toddlers (24+ months)", () => {
    const ww = wakeWindowForAge(30);
    expect(ww.min).toBe(300);
    expect(ww.max).toBe(360);
  });

  it("min is always less than max", () => {
    [0, 1, 2, 3, 6, 9, 12, 18, 24, 36].forEach((m) => {
      const ww = wakeWindowForAge(m);
      expect(ww.min).toBeLessThan(ww.max);
    });
  });
});

// ─── ageInMonthsAt ─────────────────────────────────────────────────────────

describe("ageInMonthsAt", () => {
  it("returns null for null birthDate", () => {
    expect(ageInMonthsAt(null, new Date())).toBeNull();
  });

  it("returns 0 on the day of birth", () => {
    const birth = "2024-01-15";
    const at = new Date(2024, 0, 15);
    expect(ageInMonthsAt(birth, at)).toBe(0);
  });

  it("returns 1 exactly one month later (same day)", () => {
    const birth = "2024-01-15";
    const at = new Date(2024, 1, 15); // Feb 15
    expect(ageInMonthsAt(birth, at)).toBe(1);
  });

  it("does not round up (month not yet complete)", () => {
    const birth = "2024-01-15";
    const at = new Date(2024, 1, 14); // Feb 14 = 30 days, not 1 month yet
    expect(ageInMonthsAt(birth, at)).toBe(0);
  });

  it("returns 12 at one year", () => {
    const birth = "2023-01-01";
    const at = new Date(2024, 0, 1);
    expect(ageInMonthsAt(birth, at)).toBe(12);
  });

  it("never returns negative", () => {
    // Future birth date
    const birth = "2099-01-01";
    const at = new Date(2024, 0, 1);
    expect(ageInMonthsAt(birth, at)).toBe(0);
  });
});

// ─── wwStatus ──────────────────────────────────────────────────────────────

describe("wwStatus", () => {
  it("good when within range", () => expect(wwStatus(90, 75, 120)).toBe("good"));
  it("good at lower bound", () => expect(wwStatus(75, 75, 120)).toBe("good"));
  it("good at upper bound", () => expect(wwStatus(120, 75, 120)).toBe("good"));
  it("warn when below range", () => expect(wwStatus(60, 75, 120)).toBe("warn"));
  it("warn when above range", () => expect(wwStatus(150, 75, 120)).toBe("warn"));
});
