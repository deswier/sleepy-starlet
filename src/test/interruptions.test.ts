import { describe, it, expect } from "vitest";
import { validateInterruptions } from "@/components/sleep/InterruptionsEditor";
import type { DraftInterruption } from "@/components/sleep/InterruptionsEditor";

const t = (h: number, m = 0) => new Date(2024, 0, 1, h, m, 0);

const sleepStart = t(8);
const sleepEnd = t(10);

const intr = (startH: number, endH: number | null): DraftInterruption => ({
  start_time: t(startH),
  end_time: endH !== null ? t(endH) : null,
  settling_method_id: null,
});

describe("validateInterruptions", () => {
  it("returns null for an empty list", () => {
    expect(validateInterruptions([], sleepStart, sleepEnd)).toBeNull();
  });

  it("returns null for a valid single interruption", () => {
    expect(validateInterruptions([intr(8, 9)], sleepStart, sleepEnd)).toBeNull();
  });

  it("returns null for two non-overlapping interruptions", () => {
    expect(validateInterruptions([intr(8, 9), intr(9, 10)], sleepStart, sleepEnd)).toBeNull();
  });

  it("detects interruption starting before sleep", () => {
    expect(validateInterruptions([intr(7, 9)], sleepStart, sleepEnd)).toBe("outside");
  });

  it("detects interruption starting after sleep end", () => {
    expect(validateInterruptions([intr(11, 12)], sleepStart, sleepEnd)).toBe("outside");
  });

  it("detects interruption ending after sleep end", () => {
    expect(validateInterruptions([intr(9, 11)], sleepStart, sleepEnd)).toBe("outside");
  });

  it("detects end before start", () => {
    expect(validateInterruptions([intr(9, 8)], sleepStart, sleepEnd)).toBe("endBeforeStart");
  });

  it("detects overlapping interruptions", () => {
    expect(validateInterruptions([intr(8, 9), intr(8, 9)], sleepStart, sleepEnd)).toBe("overlap");
  });

  it("detects partial overlap", () => {
    // 8:00–9:30 and 9:00–10:00 → overlap
    const a: DraftInterruption = { start_time: t(8), end_time: t(9, 30), settling_method_id: null };
    const b: DraftInterruption = { start_time: t(9), end_time: t(10), settling_method_id: null };
    expect(validateInterruptions([a, b], sleepStart, sleepEnd)).toBe("overlap");
  });

  it("allows interruption touching sleep boundaries", () => {
    // Starts exactly at sleep start, ends exactly at sleep end
    expect(validateInterruptions([intr(8, 10)], sleepStart, sleepEnd)).toBeNull();
  });

  it("allows open-ended interruption (no end_time) within sleep", () => {
    expect(validateInterruptions([intr(9, null)], sleepStart, null)).toBeNull();
  });
});
