import { describe, it, expect, beforeEach } from "vitest";
import { saveLastRoute, readLastRoute, clearLastRoute } from "@/lib/last-route";

const USER = "user-abc";

beforeEach(() => {
  localStorage.clear();
});

describe("saveLastRoute + readLastRoute", () => {
  it("saves and reads back a route", () => {
    saveLastRoute("/analytics", USER, "child-1");
    expect(readLastRoute(USER)).toEqual({ path: "/analytics", childId: "child-1" });
  });

  it("returns null for a different user", () => {
    saveLastRoute("/analytics", USER);
    expect(readLastRoute("other-user")).toBeNull();
  });

  it("does not save /auth", () => {
    saveLastRoute("/auth", USER);
    expect(readLastRoute(USER)).toBeNull();
  });

  it("does not save /auth with query params", () => {
    saveLastRoute("/auth?mode=reset", USER);
    expect(readLastRoute(USER)).toBeNull();
  });

  it("does not save /child/new", () => {
    saveLastRoute("/child/new", USER);
    expect(readLastRoute(USER)).toBeNull();
  });

  it("saves a known allowed route (/history)", () => {
    saveLastRoute("/history", USER);
    expect(readLastRoute(USER)?.path).toBe("/history");
  });

  // ── Allowlist (L-1): unknown paths are now rejected, not just excluded paths ──

  it("rejects a path not in the allowlist", () => {
    // Old behaviour (EXCLUDED denylist): /unknown-page would have been saved.
    // New behaviour (ALLOWED allowlist): only known app routes are accepted.
    saveLastRoute("/unknown-page", USER);
    expect(readLastRoute(USER)).toBeNull();
  });

  it("rejects a path with an allowed prefix but not an exact match", () => {
    // /history/april is not in the allowlist even though /history is
    saveLastRoute("/history/april", USER);
    expect(readLastRoute(USER)).toBeNull();
  });

  it.each([
    "/", "/history", "/analytics", "/heatmap",
    "/profile", "/settings", "/conflicts", "/deleted-children",
  ])("saves the allowed route %s", (path) => {
    saveLastRoute(path, USER, "child-1");
    expect(readLastRoute(USER)?.path).toBe(path);
    localStorage.clear();
  });

  it("overwrites previous saved route", () => {
    saveLastRoute("/history", USER);
    saveLastRoute("/analytics", USER);
    expect(readLastRoute(USER)?.path).toBe("/analytics");
  });

  it("returns null when userId is null", () => {
    saveLastRoute("/history", null);
    expect(readLastRoute(USER)).toBeNull();
  });
});

describe("clearLastRoute", () => {
  it("clears saved route", () => {
    saveLastRoute("/history", USER);
    clearLastRoute();
    expect(readLastRoute(USER)).toBeNull();
  });
});
