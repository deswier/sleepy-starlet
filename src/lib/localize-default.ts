import i18n from "@/i18n";

/** Localize default seeded place/method names; pass through any custom name. */
export function localizePlace(name: string): string {
  const k = `defaults.places.${name}`;
  const v = i18n.t(k);
  return v && v !== k ? v : name;
}
export function localizeMethod(name: string): string {
  const k = `defaults.methods.${name}`;
  const v = i18n.t(k);
  return v && v !== k ? v : name;
}