import { useEffect, useRef } from "react";
import { useSwipeBackController } from "@/components/SwipeBackHost";

export const SWIPE_BACK_EDGE_THRESHOLD_PX = 32;

type UseSwipeBackOptions = {
  enabled?: boolean;
  onBack: () => void;
  edgeThreshold?: number;
  minSwipeDistance?: number;
  maxVerticalDrift?: number;
};

type Candidate = {
  startX: number;
  startY: number;
  directionLocked: "horizontal" | "vertical" | null;
  // True once the host has been engaged for this gesture — only then are
  // updateSwipeBack / endSwipeBack calls valid.
  engaged: boolean;
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
  const controller = useSwipeBackController();

  // Refs let the document-level handlers always read the latest option values
  // without being re-registered on every render.
  const enabledRef = useRef(options.enabled ?? true);
  const onBackRef = useRef(options.onBack);
  const edgeThresholdRef = useRef(options.edgeThreshold ?? SWIPE_BACK_EDGE_THRESHOLD_PX);
  const minSwipeDistanceRef = useRef(options.minSwipeDistance ?? 80);
  const maxVerticalDriftRef = useRef(options.maxVerticalDrift ?? 60);

  enabledRef.current = options.enabled ?? true;
  onBackRef.current = options.onBack;
  edgeThresholdRef.current = options.edgeThreshold ?? SWIPE_BACK_EDGE_THRESHOLD_PX;
  minSwipeDistanceRef.current = options.minSwipeDistance ?? 80;
  maxVerticalDriftRef.current = options.maxVerticalDrift ?? 60;

  const candidateRef = useRef<Candidate | null>(null);

  useEffect(() => {
    if (!isTouchEnvironment()) return;

    const onTouchMove = (e: TouchEvent) => {
      const candidate = candidateRef.current;
      if (!candidate) return;
      const touch = e.touches[0];
      if (!touch) return;

      const dx = touch.clientX - candidate.startX;
      const dy = touch.clientY - candidate.startY;

      // Lock direction on first meaningful movement (5px).
      if (candidate.directionLocked === null) {
        if (Math.abs(dx) < 5 && Math.abs(dy) < 5) return;
        candidate.directionLocked = Math.abs(dx) >= Math.abs(dy) ? "horizontal" : "vertical";

        if (candidate.directionLocked === "horizontal") {
          // Ask host to mount the behind layer. If no previous location is
          // tracked, abort silently — no transform, no navigation, page stays.
          const ok = controller.beginSwipeBack(onBackRef.current);
          if (!ok) {
            candidateRef.current = null;
            return;
          }
          candidate.engaged = true;
        }
      }

      // Vertical scroll — release the gesture so the browser scrolls normally.
      if (candidate.directionLocked === "vertical") return;

      // Confirmed horizontal: claim the event so the page does not scroll.
      e.preventDefault();

      if (candidate.engaged) {
        controller.updateSwipeBack(dx);
      }
    };

    const onTouchCancel = () => {
      document.removeEventListener("touchmove", onTouchMove);
      document.removeEventListener("touchcancel", onTouchCancel);
      const candidate = candidateRef.current;
      candidateRef.current = null;
      if (candidate?.engaged) controller.endSwipeBack(false);
    };

    const onTouchEnd = (e: TouchEvent) => {
      document.removeEventListener("touchmove", onTouchMove);
      document.removeEventListener("touchcancel", onTouchCancel);
      const candidate = candidateRef.current;
      candidateRef.current = null;
      if (!candidate || !candidate.engaged) return;

      const touch = e.changedTouches[0];
      if (!touch) {
        controller.endSwipeBack(false);
        return;
      }

      const dx = touch.clientX - candidate.startX;
      const dy = touch.clientY - candidate.startY;
      const success =
        dx >= minSwipeDistanceRef.current &&
        Math.abs(dy) <= maxVerticalDriftRef.current &&
        dx > Math.abs(dy);

      controller.endSwipeBack(success);
    };

    const onTouchStart = (e: TouchEvent) => {
      candidateRef.current = null;
      if (!enabledRef.current) return;
      if (e.touches.length !== 1) return;
      const touch = e.touches[0];
      if (touch.clientX > edgeThresholdRef.current) return;
      if (hasOpenBlockingOverlay()) return;
      if (shouldIgnoreSwipeBackTarget(e.target)) return;

      candidateRef.current = {
        startX: touch.clientX,
        startY: touch.clientY,
        directionLocked: null,
        engaged: false,
      };

      document.addEventListener("touchmove", onTouchMove, { passive: false });
      document.addEventListener("touchcancel", onTouchCancel, { passive: true });
    };

    document.addEventListener("touchstart", onTouchStart, { passive: true });
    document.addEventListener("touchend", onTouchEnd, { passive: true });

    return () => {
      document.removeEventListener("touchstart", onTouchStart);
      document.removeEventListener("touchend", onTouchEnd);
      document.removeEventListener("touchmove", onTouchMove);
      document.removeEventListener("touchcancel", onTouchCancel);
    };
  }, [controller]);
}
