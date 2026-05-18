import { useEffect, useRef } from "react";

export const SWIPE_BACK_EDGE_THRESHOLD_PX = 32;

type UseSwipeBackOptions = {
  enabled?: boolean;
  onBack: () => void;
  edgeThreshold?: number;
  minSwipeDistance?: number;
  maxVerticalDrift?: number;
};

export function isTouchEnvironment(): boolean {
  return typeof window !== "undefined" && ("ontouchstart" in window || navigator.maxTouchPoints > 0);
}

// Returns true when the touch target (or any ancestor) is an interactive or
// overlay element that should own the gesture instead of swipe-back.
export function shouldIgnoreSwipeBackTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return !!target.closest(
    'input, textarea, select, button, a[href], [contenteditable="true"],' +
    ' [role="button"], [data-edge-swipe-back-ignore],' +
    ' [role="dialog"], [role="alertdialog"]',
  );
}

// Returns true when a modal/alertdialog overlay is currently open in the DOM.
export function hasOpenBlockingOverlay(): boolean {
  return !!document.querySelector('[role="dialog"], [role="alertdialog"]');
}

export function useSwipeBack(options: UseSwipeBackOptions): void {
  // Refs let the document-level handler always read the latest option values
  // without being re-registered on every render.
  const enabledRef = useRef(options.enabled ?? true);
  const onBackRef = useRef(options.onBack);
  const edgeThresholdRef = useRef(options.edgeThreshold ?? SWIPE_BACK_EDGE_THRESHOLD_PX);
  const minSwipeDistanceRef = useRef(options.minSwipeDistance ?? 80);
  const maxVerticalDriftRef = useRef(options.maxVerticalDrift ?? 60);

  // Synchronous ref updates — run every render before any effect.
  enabledRef.current = options.enabled ?? true;
  onBackRef.current = options.onBack;
  edgeThresholdRef.current = options.edgeThreshold ?? SWIPE_BACK_EDGE_THRESHOLD_PX;
  minSwipeDistanceRef.current = options.minSwipeDistance ?? 80;
  maxVerticalDriftRef.current = options.maxVerticalDrift ?? 60;

  // Tracks whether the current touch sequence started in the edge zone.
  const candidateRef = useRef<{ startX: number; startY: number } | null>(null);

  useEffect(() => {
    if (!isTouchEnvironment()) return;

    const onTouchStart = (e: TouchEvent) => {
      candidateRef.current = null;
      if (!enabledRef.current) return;
      if (e.touches.length !== 1) return;
      const touch = e.touches[0];
      if (touch.clientX > edgeThresholdRef.current) return;
      if (hasOpenBlockingOverlay()) return;
      if (shouldIgnoreSwipeBackTarget(e.target)) return;
      candidateRef.current = { startX: touch.clientX, startY: touch.clientY };
    };

    const onTouchEnd = (e: TouchEvent) => {
      const candidate = candidateRef.current;
      candidateRef.current = null;
      if (!candidate) return;
      const touch = e.changedTouches[0];
      if (!touch) return;
      const dx = touch.clientX - candidate.startX;
      const dy = touch.clientY - candidate.startY;
      if (
        dx >= minSwipeDistanceRef.current &&
        Math.abs(dy) <= maxVerticalDriftRef.current &&
        dx > Math.abs(dy)
      ) {
        onBackRef.current();
      }
    };

    document.addEventListener("touchstart", onTouchStart, { passive: true });
    document.addEventListener("touchend", onTouchEnd, { passive: true });

    return () => {
      document.removeEventListener("touchstart", onTouchStart);
      document.removeEventListener("touchend", onTouchEnd);
    };
  }, []); // Empty — all live values are accessed through refs above.
}
