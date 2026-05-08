import { describe, it, expect } from "vitest";
import { cn } from "@/lib/utils";

describe("cn", () => {
  it("joins class strings", () => {
    expect(cn("a", "b")).toBe("a b");
  });

  it("ignores falsy values", () => {
    expect(cn("a", false, undefined, null, "b")).toBe("a b");
  });

  it("merges conflicting Tailwind classes (last wins)", () => {
    // twMerge: p-4 overrides p-2
    expect(cn("p-2", "p-4")).toBe("p-4");
  });

  it("handles conditional object syntax", () => {
    expect(cn({ "font-bold": true, italic: false })).toBe("font-bold");
  });

  it("handles array syntax", () => {
    expect(cn(["a", "b"])).toBe("a b");
  });

  it("returns empty string for no args", () => {
    expect(cn()).toBe("");
  });
});
