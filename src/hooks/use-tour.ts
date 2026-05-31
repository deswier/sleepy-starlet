import { useCallback, useEffect, useRef, useState } from "react";
import type { TourId } from "@/lib/tours";
import { TOURS } from "@/lib/tours";
import { getTourProgress, setTourProgress } from "@/lib/tour-storage";
import { useAuth } from "@/contexts/AuthContext";

export interface TourState {
  /** Whether the spotlight overlay should be rendered. */
  active: boolean;
  /** Current step index. */
  step: number;
  /** Total number of steps in this tour. */
  total: number;
  /** The anchor string of the current step (e.g. "history.day-nav"). */
  anchor: string;
  next: () => void;
  prev: () => void;
  skip: () => void;
  finish: () => void;
}

/**
 * Controls a named tour.
 *
 * `ready` must be true before the tour is allowed to start/resume.
 * When the current step's anchor element is absent from the DOM the overlay
 * hides and a MutationObserver waits for it to appear — the tour resumes
 * automatically. Progress (step index) is persisted in localStorage so the
 * tour can resume across page visits.
 */
export function useTour(tourId: TourId, ready: boolean): TourState {
  const { user } = useAuth();
  const def = TOURS[tourId];
  const userId = user?.id ?? "";

  // Load initial step from persisted progress (or 0 for first visit).
  const [step, setStep] = useState<number>(() => {
    if (!userId) return 0;
    const p = getTourProgress(userId, tourId);
    if (!p) return 0;       // no stored progress → show tour from the start
    if (p.done) return -1;  // -1 = tour already completed
    return p.step;
  });

  // -1 means the tour is fully done — nothing to show.
  const done = step === -1;

  // Whether the anchor element for the current step exists in the DOM right now.
  const [anchorPresent, setAnchorPresent] = useState(false);

  const observerRef = useRef<MutationObserver | null>(null);
  const syncedUserRef = useRef<string>("");

  // Re-read persisted progress once userId becomes available (auth may load
  // after the component mounts, making the useState initializer see userId="").
  useEffect(() => {
    if (!userId || syncedUserRef.current === userId) return;
    syncedUserRef.current = userId;
    const p = getTourProgress(userId, tourId);
    if (!p) return;          // no stored progress → keep step 0
    if (p.done) { setStep(-1); return; }
    setStep(p.step);
  }, [userId, tourId]);

  const currentAnchor = done ? "" : def.steps[step]?.anchor ?? "";

  // Check if the anchor element is present and set up a MutationObserver if not.
  useEffect(() => {
    if (!ready || done || !currentAnchor) {
      setAnchorPresent(false);
      return;
    }

    function check() {
      const el = document.querySelector(`[data-tour="${currentAnchor}"]`);
      setAnchorPresent(!!el);
      return !!el;
    }

    if (check()) {
      // Already present — no observer needed.
      return;
    }

    // Not present — observe the subtree for DOM mutations.
    const observer = new MutationObserver(() => {
      if (check()) {
        observer.disconnect();
        observerRef.current = null;
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    observerRef.current = observer;

    return () => {
      observer.disconnect();
      observerRef.current = null;
    };
  }, [ready, done, currentAnchor]);

  // Persist intermediate step advances so the tour can resume after a page refresh.
  // step 0 = initial (nothing to save yet); step -1 = done (markDone/next already wrote it).
  useEffect(() => {
    if (!userId || step <= 0) return;
    setTourProgress(userId, tourId, { step, done: false });
  }, [userId, tourId, step]);

  const markDone = useCallback(() => {
    setStep(-1);
    if (userId) setTourProgress(userId, tourId, { step: 0, done: true });
  }, [userId, tourId]);

  const next = useCallback(() => {
    setStep((s) => {
      if (s === -1) return -1;
      const nextStep = s + 1;
      if (nextStep >= def.steps.length) {
        if (userId) setTourProgress(userId, tourId, { step: 0, done: true });
        return -1;
      }
      if (userId) setTourProgress(userId, tourId, { step: nextStep, done: false });
      return nextStep;
    });
  }, [def.steps.length, userId, tourId]);

  const prev = useCallback(() => {
    setStep((s) => {
      if (s <= 0) return s;
      const prevStep = s - 1;
      if (userId) setTourProgress(userId, tourId, { step: prevStep, done: false });
      return prevStep;
    });
  }, [userId, tourId]);

  const active = ready && !done && anchorPresent;

  return {
    active,
    step: done ? 0 : step,
    total: def.steps.length,
    anchor: currentAnchor,
    next,
    prev,
    skip: markDone,
    finish: markDone,
  };
}
