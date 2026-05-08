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

  it("saves routes other than excluded ones", () => {
    saveLastRoute("/history", USER);
    expect(readLastRoute(USER)?.path).toBe("/history");
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
