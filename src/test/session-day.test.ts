import { describe, it, expect } from "vitest";
import { sessionDay } from "@/pages/Analytics";
import type { SleepSession } from "@/lib/sleep-utils";
import { startOfDay, addDays } from "date-fns";

const night = { start: "20:00", end: "07:00" };

// Build a session using local Date objects — avoids timezone-offset ambiguity
// that arises when using ISO strings with explicit +HH:mm offsets.
const session = (startDate: Date, endDate: Date | null, type: "day" | "night"): SleepSession => ({
  id: "s", child_id: "c",
  start_time: startDate.toISOString(),
  end_time: endDate ? endDate.toISOString() : null,
  sleep_type: type,
  sleep_place_id: null, settling_method_id: null, comment: null,
  created_by_user_id: null,
});

const jan10 = new Date(2024, 0, 10); // Jan 10 local
const at = (d: Date, h: number, m = 0) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), h, m);

describe("sessionDay", () => {
  it("day sleep belongs to its start date", () => {
    const s = session(at(jan10, 13), at(jan10, 14), "day");
    expect(sessionDay(s, night)).toEqual(startOfDay(jan10));
  });

  it("night sleep starting at 21:00 is attributed to the next day (end day)", () => {
    // 21:00 → after night_start (20:00). Ends on Jan 11.
    const jan11 = addDays(jan10, 1);
    const s = session(at(jan10, 21), at(jan11, 6), "night");
    expect(sessionDay(s, night)).toEqual(startOfDay(jan11));
  });

  it("night sleep starting at 3:00 stays on start day", () => {
    // 3 AM: after midnight, before night_end (07:00) — night window wraps.
    // Start is already on Jan 10 (early morning), does not pre-attribute forward.
    const s = session(at(jan10, 3), at(jan10, 7), "night");
    expect(sessionDay(s, night)).toEqual(startOfDay(jan10));
  });

  it("ongoing evening night sleep (21:00, no end) is pre-attributed to next day", () => {
    const jan11 = addDays(jan10, 1);
    const s = session(at(jan10, 21), null, "night");
    expect(sessionDay(s, night)).toEqual(startOfDay(jan11));
  });

  it("night sleep that starts and ends on the same day is not moved", () => {
    // 21:00–22:00 — starts after night_start, but doesn't cross midnight
    const s = session(at(jan10, 21), at(jan10, 22), "night");
    // Same-day start and end → stays on Jan 10 (isSameDay check in sessionDay)
    expect(sessionDay(s, night)).toEqual(startOfDay(jan10));
  });
});
