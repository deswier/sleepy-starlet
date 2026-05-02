import { Baby, Footprints, Music, Moon, Hand, Circle, type LucideIcon } from "lucide-react";

/**
 * Pick a small lucide icon for a settling method by its (default) name.
 * Custom user-created methods fall back to a neutral dot icon.
 */
export function iconForMethod(name: string | null | undefined): LucideIcon {
  if (!name) return Circle;
  const n = name.toLowerCase();
  if (n.includes("nurs") || n.includes("корм") || n.includes("груд")) return Baby;
  if (n.includes("rock") || n.includes("укач")) return Music;
  if (n.includes("walk") || n.includes("прогул") || n.includes("ходьб")) return Footprints;
  if (n.includes("indep") || n.includes("самост")) return Moon;
  if (n.includes("pat") || n.includes("hold") || n.includes("держ")) return Hand;
  return Circle;
}