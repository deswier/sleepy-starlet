import type { TourId } from "./tours";
import { TOURS } from "./tours";

interface TourProgress {
  version: number;
  step: number;
  done: boolean;
}

function key(userId: string, tourId: TourId) {
  return `tour:${userId}:${tourId}`;
}

export function getTourProgress(userId: string, tourId: TourId): TourProgress | null {
  try {
    const raw = localStorage.getItem(key(userId, tourId));
    if (!raw) return null;
    const p = JSON.parse(raw) as TourProgress;
    // Version bump resets the tour.
    if (p.version !== TOURS[tourId].version) return null;
    return p;
  } catch {
    return null;
  }
}

export function setTourProgress(userId: string, tourId: TourId, progress: Omit<TourProgress, "version">) {
  try {
    const p: TourProgress = { version: TOURS[tourId].version, ...progress };
    localStorage.setItem(key(userId, tourId), JSON.stringify(p));
  } catch { /* ignore quota errors */ }
}

export function clearTourProgress(userId: string) {
  try {
    const prefix = `tour:${userId}:`;
    const toRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k?.startsWith(prefix)) toRemove.push(k);
    }
    toRemove.forEach((k) => localStorage.removeItem(k));
  } catch { /* ignore */ }
}
