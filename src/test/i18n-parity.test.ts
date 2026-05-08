import { describe, it, expect } from "vitest";
import en from "@/i18n/en";
import ru from "@/i18n/ru";

// Recursively collect all leaf key paths: { a: { b: "x" } } → ["a.b"]
function collectKeys(obj: Record<string, any>, prefix = ""): string[] {
  return Object.keys(obj).flatMap((k) => {
    const full = prefix ? `${prefix}.${k}` : k;
    const v = obj[k];
    return typeof v === "object" && v !== null && !Array.isArray(v)
      ? collectKeys(v, full)
      : [full];
  });
}

const enKeys = collectKeys(en as any);
const ruKeys = new Set(collectKeys(ru as any));
const enKeySet = new Set(enKeys);

// i18next plural suffixes differ by language:
//   EN: _other  |  RU: _one, _few, _many, _other
// Strip these suffixes before comparison so plural variants don't cause false mismatches.
const PLURAL_SUFFIXES = /_(one|other|few|many|zero|two)$/;
const normalize = (k: string) => k.replace(PLURAL_SUFFIXES, "");
const enBases = new Set(enKeys.map(normalize));
const ruBases = new Set([...ruKeys].map(normalize));

describe("i18n key parity", () => {
  it("every EN key (normalised) exists in RU", () => {
    const missing = enKeys.filter((k) => !ruBases.has(normalize(k)));
    expect(missing, `Keys in EN but missing in RU:\n${missing.join("\n")}`).toHaveLength(0);
  });

  it("every RU key (normalised) exists in EN", () => {
    const extra = [...ruKeys].filter((k) => !enBases.has(normalize(k)));
    expect(extra, `Keys in RU but missing in EN:\n${extra.join("\n")}`).toHaveLength(0);
  });

  it("all leaf values in EN are non-empty strings", () => {
    const empty = enKeys.filter((k) => {
      const parts = k.split(".");
      let v: any = en;
      for (const p of parts) v = v?.[p];
      return typeof v !== "string" || v.trim() === "";
    });
    expect(empty, `Empty EN values:\n${empty.join("\n")}`).toHaveLength(0);
  });

  it("all leaf values in RU are non-empty strings", () => {
    const empty = [...ruKeys].filter((k) => {
      const parts = k.split(".");
      let v: any = ru;
      for (const p of parts) v = v?.[p];
      return typeof v !== "string" || v.trim() === "";
    });
    expect(empty, `Empty RU values:\n${empty.join("\n")}`).toHaveLength(0);
  });

  it("has expected top-level namespaces", () => {
    const namespaces = ["app", "common", "auth", "child", "sleep", "history",
      "analytics", "settings", "defaults", "conflicts", "profile", "remove", "errors"];
    for (const ns of namespaces) {
      expect(enKeySet.has(ns) || enKeys.some((k) => k.startsWith(ns + ".")),
        `Missing namespace: ${ns}`).toBe(true);
    }
  });
});
