import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { flushSync } from "react-dom";
import { type Location, useLocation, useNavigationType } from "react-router-dom";

// "committing" sits between settling-success and idle: the front is already
// off-screen at 100vw and the behind layer stays visible while we wait for
// navigate(-1) to update the router location. Only once the location matches
// behindLocation do we tear down both layers in a single React commit —
// preventing the Heatmap snap-back flicker.
type GesturePhase = "idle" | "dragging" | "settling-success" | "settling-cancel" | "committing";

type SwipeBackController = {
  // Returns false if there is no previous location to reveal — the hook then
  // aborts the gesture silently (no transform, no navigation).
  beginSwipeBack: (onBack: () => void) => boolean;
  updateSwipeBack: (dx: number) => void;
  endSwipeBack: (success: boolean) => void;
};

const SwipeBackContext = createContext<SwipeBackController | null>(null);

export function useSwipeBackController(): SwipeBackController {
  const ctx = useContext(SwipeBackContext);
  if (!ctx) throw new Error("useSwipeBackController must be used inside <SwipeBackHost>");
  return ctx;
}

const SETTLE_MS = 180;
const SETTLE_FALLBACK_MS = SETTLE_MS + 120;
// Maximum time we wait for navigate(-1) to reflect in useLocation before
// forcing cleanup. Should never fire in normal use.
const COMMIT_FALLBACK_MS = 300;

type Props = {
  // Called with no argument to render the front (current) layer, and with a
  // frozen previous location to render the behind layer during a gesture.
  renderRoutes: (location?: Location) => ReactNode;
};

export default function SwipeBackHost({ renderRoutes }: Props) {
  const location = useLocation();
  const navType = useNavigationType();

  // History stack that mirrors PUSH / POP / REPLACE so the behind layer always
  // renders the page the user came from — even after a back navigation has
  // already happened in the session.
  const stackRef = useRef<Location[]>([location]);
  const stackInitializedRef = useRef(false);

  useEffect(() => {
    const stack = stackRef.current;
    if (!stackInitializedRef.current) {
      stackInitializedRef.current = true;
      stackRef.current = [location];
      return;
    }
    const top = stack[stack.length - 1];
    if (top && top.key === location.key) return;

    if (navType === "POP") {
      const idx = stack.findIndex((l) => l.key === location.key);
      if (idx >= 0) stack.length = idx + 1;
      else stack.push(location);
    } else if (navType === "REPLACE") {
      stack[stack.length - 1] = location;
    } else {
      stack.push(location);
    }
  }, [location, navType]);

  // Keep locationKeyRef in sync so the scroll listener (registered once) always
  // saves under the current page's key.
  useEffect(() => {
    locationKeyRef.current = location.key;
  }, [location.key]);

  // Persist window.scrollY for each location so the behind layer can match it.
  useEffect(() => {
    const save = () => {
      scrollMapRef.current.set(locationKeyRef.current, window.scrollY);
    };
    window.addEventListener("scroll", save, { passive: true });
    return () => window.removeEventListener("scroll", save);
  }, []);

  const [phase, setPhase] = useState<GesturePhase>("idle");
  // Frozen at gesture start so the navigate(-1) at success completion does
  // not change what the behind layer renders mid-animation.
  const [behindLocation, setBehindLocation] = useState<Location | null>(null);

  const frontRef = useRef<HTMLDivElement>(null);
  const behindContainerRef = useRef<HTMLDivElement>(null);
  // Scroll position saved per location.key so the behind layer can match it.
  const scrollMapRef = useRef<Map<string, number>>(new Map());
  // Saved at gesture start; read by resetFront to restore window scroll.
  const behindScrollYRef = useRef(0);
  // Stable ref to the current location key, used inside the scroll listener.
  const locationKeyRef = useRef(location.key);
  const onBackRef = useRef<(() => void) | null>(null);
  const settleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const settleGenRef = useRef(0);
  // Holds the active transitionend handler so beginSwipeBack and the unmount
  // cleanup can remove it explicitly — prevents listener accumulation when a
  // new gesture starts before the previous settling animation finishes.
  const settleListenerRef = useRef<((e: TransitionEvent) => void) | null>(null);
  // Timer for the committing-phase fallback (forces cleanup if navigate(-1)
  // never resolves to the expected location).
  const commitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // rAF handle used to defer behind-layer removal by one frame after location
  // matches so the browser paints the front in its final position first.
  const commitRafRef = useRef(0);

  const clearCommitTimer = () => {
    if (commitTimerRef.current !== null) {
      clearTimeout(commitTimerRef.current);
      commitTimerRef.current = null;
    }
  };

  const resetFront = () => {
    // Restore the real window scroll to match what was shown in the behind layer.
    // Called only on the success path (navigate(-1) committed or fallback timer).
    window.scrollTo(0, behindScrollYRef.current);
    if (frontRef.current) {
      frontRef.current.style.transform = "";
      frontRef.current.style.transition = "";
    }
    setBehindLocation(null);
    setPhase("idle");
  };

  // Once navigate(-1) resolves, location updates to match behindLocation.
  // We snap the front to its final position immediately (it is covered by the
  // behind layer which is at z-index:3 during committing) then wait one rAF
  // before removing the behind. This guarantees the browser paints the front
  // at least once in its correct position — under the behind — so when the
  // behind disappears there is no jump, skeleton flash, or loading-state blink.
  useEffect(() => {
    if (phase !== "committing" || !behindLocation) return;
    if (location.key !== behindLocation.key) return;
    clearCommitTimer();

    window.scrollTo(0, behindScrollYRef.current);
    if (frontRef.current) {
      frontRef.current.style.transform = "";
      frontRef.current.style.transition = "";
    }

    const rafId = requestAnimationFrame(() => {
      commitRafRef.current = 0;
      setBehindLocation(null);
      setPhase("idle");
    });
    commitRafRef.current = rafId;
    return () => {
      cancelAnimationFrame(rafId);
      commitRafRef.current = 0;
    };
  // clearCommitTimer / scroll / DOM refs are stable; setState setters are stable.
  }, [location, phase, behindLocation]);

  const beginSwipeBack = useCallback((onBack: () => void): boolean => {
    const stack = stackRef.current;
    if (stack.length < 2) return false;
    const prev = stack[stack.length - 2];
    if (!prev) return false;

    // Cancel any in-progress settle / commit from a prior gesture.
    if (settleTimerRef.current !== null) {
      clearTimeout(settleTimerRef.current);
      settleTimerRef.current = null;
    }
    if (settleListenerRef.current) {
      frontRef.current?.removeEventListener("transitionend", settleListenerRef.current);
      settleListenerRef.current = null;
    }
    if (commitTimerRef.current !== null) {
      clearTimeout(commitTimerRef.current);
      commitTimerRef.current = null;
    }
    if (commitRafRef.current !== 0) {
      cancelAnimationFrame(commitRafRef.current);
      commitRafRef.current = 0;
    }
    settleGenRef.current++;

    onBackRef.current = onBack;

    // Capture the scroll position the user was at when they left that page.
    const scrollY = scrollMapRef.current.get(prev.key) ?? 0;
    behindScrollYRef.current = scrollY;

    // flushSync forces a synchronous React commit before returning so the
    // behind layer (with AppShell / child header) is in the DOM by the time
    // updateSwipeBack runs immediately after this call. Without this, React
    // schedules the commit via MessageChannel (macrotask) which can race with
    // requestAnimationFrame, letting the front translate over a blank bg-hero
    // background for the first few frames.
    flushSync(() => {
      setBehindLocation(prev);
      setPhase("dragging");
    });

    // Scroll the behind container to match the saved position. Refs are
    // attached synchronously during flushSync's commit, so this is safe.
    if (scrollY > 0 && behindContainerRef.current) {
      behindContainerRef.current.scrollTop = scrollY;
    }

    const el = frontRef.current;
    if (el) {
      el.style.transition = "none";
      el.style.transform = "translate3d(0, 0, 0)";
    }
    return true;
  }, []);

  const updateSwipeBack = useCallback((dx: number) => {
    const el = frontRef.current;
    if (!el) return;
    const clamped = Math.max(0, Math.min(dx, window.innerWidth));
    el.style.transition = "none";
    el.style.transform = `translate3d(${clamped}px, 0, 0)`;
  }, []);

  const endSwipeBack = useCallback((success: boolean) => {
    const el = frontRef.current;

    const finish = () => {
      if (settleTimerRef.current !== null) {
        clearTimeout(settleTimerRef.current);
        settleTimerRef.current = null;
      }
      const onBack = onBackRef.current;
      onBackRef.current = null;

      if (!success) {
        // Cancel: clear DOM immediately and return to idle in the same commit.
        if (el) {
          el.style.transform = "";
          el.style.transition = "";
        }
        setBehindLocation(null);
        setPhase("idle");
        return;
      }

      // Success: enter committing phase — front is already off-screen at 100vw,
      // behind stays visible. Do NOT clear el.style.transform here; clearing it
      // before the navigate(-1) commit would snap the front back for one frame.
      // The useEffect above detects when the location matches and does final cleanup.
      setPhase("committing");
      commitTimerRef.current = setTimeout(() => {
        commitTimerRef.current = null;
        resetFront();
      }, COMMIT_FALLBACK_MS);
      onBack?.();
    };

    if (!el) {
      const onBack = onBackRef.current;
      onBackRef.current = null;
      setBehindLocation(null);
      setPhase("idle");
      if (success && onBack) onBack();
      return;
    }

    const gen = ++settleGenRef.current;
    setPhase(success ? "settling-success" : "settling-cancel");

    // Force layout so the transition starts from the current transform.
    void el.offsetWidth;
    el.style.transition = `transform ${SETTLE_MS}ms ease-out`;
    el.style.transform = success
      ? `translate3d(${window.innerWidth}px, 0, 0)`
      : "translate3d(0, 0, 0)";

    const onTransitionEnd = (e: TransitionEvent) => {
      if (e.propertyName !== "transform") return;
      if (gen !== settleGenRef.current) return;
      el.removeEventListener("transitionend", onTransitionEnd);
      settleListenerRef.current = null;
      finish();
    };
    settleListenerRef.current = onTransitionEnd;
    el.addEventListener("transitionend", onTransitionEnd);
    settleTimerRef.current = setTimeout(() => {
      if (gen !== settleGenRef.current) return;
      el.removeEventListener("transitionend", onTransitionEnd);
      settleListenerRef.current = null;
      finish();
    }, SETTLE_FALLBACK_MS);
  }, []);

  useEffect(() => {
    return () => {
      if (settleTimerRef.current !== null) {
        clearTimeout(settleTimerRef.current);
        settleTimerRef.current = null;
      }
      if (settleListenerRef.current) {
        // eslint-disable-next-line react-hooks/exhaustive-deps
        frontRef.current?.removeEventListener("transitionend", settleListenerRef.current);
        settleListenerRef.current = null;
      }
      if (commitTimerRef.current !== null) {
        clearTimeout(commitTimerRef.current);
        commitTimerRef.current = null;
      }
      if (commitRafRef.current !== 0) {
        // eslint-disable-next-line react-hooks/exhaustive-deps
        cancelAnimationFrame(commitRafRef.current);
        commitRafRef.current = 0;
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
      settleGenRef.current++;
    };
  }, []);

  const controllerValue = useMemo<SwipeBackController>(
    () => ({ beginSwipeBack, updateSwipeBack, endSwipeBack }),
    [beginSwipeBack, updateSwipeBack, endSwipeBack],
  );

  const isActive = phase !== "idle";

  const frontStyle: CSSProperties | undefined = isActive
    ? {
        position: "relative",
        zIndex: 2,
        // During committing the front is at translate3d(100vw,0,0) — off-screen.
        // Omit will-change so the new route's position:fixed children (e.g.
        // AppShell's bottom nav) are NOT contained within the off-screen div,
        // preventing a layout shift when the layers swap on cleanup.
        // Omit box-shadow too: it would appear as a thin sliver at the right edge.
        ...(phase !== "committing" && {
          willChange: "transform",
          boxShadow: "-12px 0 28px hsl(var(--foreground) / 0.12)",
        }),
      }
    : undefined;

  return (
    <SwipeBackContext.Provider value={controllerValue}>
      {isActive && behindLocation && (
        <div
          ref={behindContainerRef}
          style={{
            position: "fixed",
            inset: 0,
            // Raised to 3 during committing so it sits above the front layer
            // (z-index:2). After navigate(-1) resolves the front is snapped to
            // x:0 while still covered here; the rAF-delayed removal then
            // reveals the front cleanly with no skeleton/loading-state flash.
            zIndex: phase === "committing" ? 3 : 1,
            paddingTop: "env(safe-area-inset-top)",
            // Scrollable so scrollTop can be set to match window.scrollY of the
            // behind page. overflow-x is hidden to prevent horizontal artefacts.
            overflowY: "auto",
            overflowX: "hidden",
          }}
        >
          {renderRoutes(behindLocation)}
        </div>
      )}
      <div ref={frontRef} style={frontStyle}>
        {renderRoutes()}
      </div>
    </SwipeBackContext.Provider>
  );
}
