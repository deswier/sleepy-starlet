import { describe, it, expect, beforeEach } from "vitest";
import { getDeviceId } from "@/lib/device-id";

beforeEach(() => localStorage.clear());

describe("getDeviceId", () => {
  it("returns a non-empty string", () => {
    expect(getDeviceId().length).toBeGreaterThan(0);
  });

  it("returns the same id on repeated calls (persists to localStorage)", () => {
    const a = getDeviceId();
    const b = getDeviceId();
    expect(a).toBe(b);
  });

  it("stores the id in localStorage under 'device_id'", () => {
    const id = getDeviceId();
    expect(localStorage.getItem("device_id")).toBe(id);
  });

  it("reuses an existing id from localStorage", () => {
    localStorage.setItem("device_id", "my-existing-id");
    expect(getDeviceId()).toBe("my-existing-id");
  });

  it("generates a different id for a fresh localStorage", () => {
    const first = getDeviceId();
    localStorage.clear();
    const second = getDeviceId();
    expect(first).not.toBe(second);
  });
});
