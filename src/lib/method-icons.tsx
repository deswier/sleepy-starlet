import { Baby, Milk, ArrowDownUp, Footprints, Circle, type LucideIcon } from "lucide-react";

/**
 * Pick a small lucide icon for a settling method by its (default) name.
 * Custom user-created methods fall back to a neutral dot icon.
 *
 * Mapping (agreed with product):
 *  - Independent / Самостоятельно → Baby (детская голова)
 *  - Nursing / Кормление → Milk (бутылочка)
 *  - Rocking / Укачивание → ArrowDownUp (амплитуда)
 *  - Walking / Прогулка → Footprints
 */
export function iconForMethod(name: string | null | undefined): LucideIcon {
  if (!name) return Circle;
  const n = name.toLowerCase();
  if (n.includes("indep") || n.includes("самост")) return Baby;
  if (n.includes("nurs") || n.includes("feed") || n.includes("корм") || n.includes("груд")) return Milk;
  if (n.includes("rock") || n.includes("укач")) return ArrowDownUp;
  if (n.includes("walk") || n.includes("stroll") || n.includes("прогул") || n.includes("ходьб") || n.includes("коляск")) return Footprints;
  return Circle;
}