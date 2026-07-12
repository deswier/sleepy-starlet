import { lazy, Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useSwipeBack, SWIPE_BACK_EDGE_THRESHOLD_PX } from "@/hooks/use-swipe-back";
import { devError } from "@/lib/logger";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ChevronLeft, ChevronRight, Minus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { putSessions, putInterruptions, getSessions, getInterruptionsForRange } from "@/lib/sessions-cache";
import { useChildren } from "@/contexts/ChildContext";
import { useTranslation } from "react-i18next";
import { SleepSession } from "@/lib/sleep-utils";
import { startOfDay, addDays, subDays, format } from "date-fns";
import { enUS, ru } from "date-fns/locale";
import i18n from "@/i18n";
import { iconForMethod } from "@/lib/method-icons";
import { toast } from "sonner";

const SleepDetail = lazy(() => import("@/components/sleep/SleepDetail"));

const HOURS = 24;
const ROW_PX = 22;
const GRID_HEIGHT = HOURS * ROW_PX;
// Extra vertical space so icons at the top/bottom extremes are not clipped.
// Must be ≥ half the rendered icon button height (~7 px).
const CHART_PAD_PX = 12;
const ICON_OVERLAP_PCT = 1.0;
const VISIBLE = 7;
const BUFFER = 14; // extra days rendered off-screen on each side
const TOTAL = BUFFER + VISIBLE + BUFFER; // 35
const DEFAULT_NIGHT_START = "19:00";

const pad2 = (n: number) => String(n).padStart(2, "0");
// "HH:MM[:SS]" → minutes since midnight.
function parseHM(hm: string): number {
  const [h, m] = hm.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}
// Minutes since midnight → "HH:MM" clock label (wraps past 24h).
function minsToClock(min: number): string {
  const m = ((min % 1440) + 1440) % 1440;
  return `${pad2(Math.floor(m / 60))}:${pad2(m % 60)}`;
}

type InterruptionLite = {
  id: string; sleep_session_id: string; start_time: string;
  settling_method_id: string | null; settling_method_name: string | null;
};

export default function Heatmap() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const handleBack = () => navigate(-1);
  const { activeChild, settings } = useChildren();
  const [searchParams] = useSearchParams();
  const [sessions, setSessions] = useState<SleepSession[]>([]);
  const [interruptions, setInterruptions] = useState<InterruptionLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasFetched, setHasFetched] = useState(false);
  const [openSession, setOpenSession] = useState<SleepSession | null>(null);
  const [fetchKey, setFetchKey] = useState(0);

  useSwipeBack({ enabled: openSession === null, onBack: handleBack });

  const today = startOfDay(new Date());
  // Hard ceiling: last visible day = today.
  const hardMaxAnchorMs = today.getTime() - (VISIBLE - 1) * 86400000;

  const [anchor, setAnchorState] = useState<Date>(() => {
    const a = searchParams.get("anchor");
    if (a) {
      const d = startOfDay(new Date(a));
      if (!isNaN(d.getTime())) return d;
    }
    // Default: yesterday + 6 past days (matches Analytics weekOffset=0).
    return subDays(today, 7);
  });

  // Effective right boundary: the anchor that puts the last day with data
  // as the rightmost visible column (but never past today).
  // Stored in a ref so drag-move closures always see the current value.
  const effectiveMaxAnchorMsRef = useRef(hardMaxAnchorMs);

  const setAnchor = (d: Date) => {
    const ms = Math.min(d.getTime(), effectiveMaxAnchorMsRef.current);
    setAnchorState(startOfDay(new Date(ms)));
  };

  const locale = i18n.language?.startsWith("ru") ? ru : enUS;

  // Variant A: when night sleep is NOT split by calendar date, anchor each
  // column's vertical axis at night_start so a cross-midnight night renders as
  // one continuous block instead of two midnight-clipped pieces. A column for
  // date D then spans [D night_start, D+1 night_start) — its night plus the
  // following day's naps. When split-by-date is on, origin stays at midnight
  // and the night is clipped into two pieces (legacy behaviour).
  const nightStartMin = parseHM((settings?.night_start_time ?? DEFAULT_NIGHT_START).slice(0, 5));
  const splitByDate = !!settings?.split_night_sleep_by_date;
  const originMin = splitByDate ? 0 : nightStartMin;

  const renderStart = useMemo(() => subDays(anchor, BUFFER), [anchor]);
  const allDays = useMemo(
    () => Array.from({ length: TOTAL }, (_, i) => addDays(renderStart, i)),
    [renderStart],
  );

  // ── drag refs ────────────────────────────────────────────────────────────
  const trackRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const rangeLabelRef = useRef<HTMLDivElement>(null);
  const dragContainerRef = useRef<HTMLDivElement>(null);
  const colWidthRef = useRef(0);
  const dragStartX = useRef<number | null>(null);
  const dragStartY = useRef<number | null>(null);
  const dragStartAnchorMs = useRef(anchor.getTime());
  const isDraggingHoriz = useRef(false);

  const measureColWidth = () => {
    if (trackRef.current?.parentElement)
      colWidthRef.current = trackRef.current.parentElement.offsetWidth / VISIBLE;
  };

  const applyTranslate = (px: number) => {
    if (trackRef.current) trackRef.current.style.transform = `translateX(${px}px)`;
    if (headerRef.current) headerRef.current.style.transform = `translateX(${px}px)`;
  };

  const baseTranslatePx = () => -BUFFER * colWidthRef.current;

  // Measure + apply base once the grid is mounted; re-run on resize.
  useLayoutEffect(() => {
    if (!hasFetched) return;
    measureColWidth();
    applyTranslate(baseTranslatePx());
    const onResize = () => { measureColWidth(); applyTranslate(baseTranslatePx()); };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasFetched]);

  useLayoutEffect(() => {
    measureColWidth();
    applyTranslate(baseTranslatePx());
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anchor]);

  // ── drag handlers ────────────────────────────────────────────────────────
  // fromTouch=true activates the edge-zone guard so the left-edge swipe-back
  // gesture is never claimed by the date-drag. Mouse drag skips the guard.
  const startDrag = (clientX: number, clientY: number, fromTouch = false) => {
    if (fromTouch && clientX <= SWIPE_BACK_EDGE_THRESHOLD_PX) return;
    dragStartX.current = clientX;
    dragStartY.current = clientY;
    dragStartAnchorMs.current = anchor.getTime();
    isDraggingHoriz.current = false;
  };

  const moveDrag = (clientX: number, clientY: number) => {
    if (dragStartX.current === null) return;
    const dx = clientX - dragStartX.current;
    const dy = clientY - (dragStartY.current ?? clientY);

    if (!isDraggingHoriz.current) {
      if (Math.abs(dx) < 5 && Math.abs(dy) < 5) return;
      isDraggingHoriz.current = Math.abs(dx) >= Math.abs(dy);
      if (!isDraggingHoriz.current) return;
    }

    const colW = colWidthRef.current || 1;
    // Clamp dx so the anchor cannot exceed the effective right boundary.
    // dx < 0 = dragging left = going to newer dates; minDx caps that direction.
    const minDx = (dragStartAnchorMs.current - effectiveMaxAnchorMsRef.current) / 86400000 * colW;
    const clampedDx = Math.max(dx, minDx);

    applyTranslate(baseTranslatePx() + clampedDx);

    if (rangeLabelRef.current) {
      const newMs = dragStartAnchorMs.current - Math.round(clampedDx / colW) * 86400000;
      const first = startOfDay(new Date(newMs));
      const last = addDays(first, VISIBLE - 1);
      rangeLabelRef.current.textContent =
        `${format(first, "d MMM", { locale })} – ${format(last, "d MMM", { locale })}`;
    }
  };

  const endDrag = (clientX: number) => {
    if (dragStartX.current === null) return;
    const dx = clientX - dragStartX.current;
    dragStartX.current = null;
    dragStartY.current = null;
    if (!isDraggingHoriz.current) { isDraggingHoriz.current = false; return; }
    isDraggingHoriz.current = false;
    const colW = colWidthRef.current || 1;
    setAnchor(new Date(dragStartAnchorMs.current - Math.round(dx / colW) * 86400000));
  };

  // Non-passive touchmove to prevent page scroll while swiping horizontally.
  // Runs after hasFetched so dragContainerRef is guaranteed to be in the DOM.
  useEffect(() => {
    if (!hasFetched) return;
    const el = dragContainerRef.current;
    if (!el) return;
    const onTM = (e: TouchEvent) => {
      if (dragStartX.current === null) return;
      const touch = e.touches[0];
      moveDrag(touch.clientX, touch.clientY);
      if (isDraggingHoriz.current) e.preventDefault();
    };
    el.addEventListener("touchmove", onTM, { passive: false });
    return () => el.removeEventListener("touchmove", onTM);
  // moveDrag only uses refs — stable across renders
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasFetched]);

  // ── data fetch ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (!activeChild) return;
    if (!hasFetched) setLoading(true);
    const sinceDate = subDays(renderStart, 1);
    const untilDate = addDays(renderStart, TOTAL + 1);
    const since = sinceDate.toISOString();
    const until = untilDate.toISOString();
    const childId = activeChild.id;
    let cancelled = false;

    const mapInterruptions = (rows: any[]): InterruptionLite[] =>
      rows.map((r) => ({
        id: r.id,
        sleep_session_id: r.sleep_session_id,
        start_time: r.start_time,
        settling_method_id: r.settling_method_id,
        settling_method_name: r.settling_methods?.name ?? r.settling_method_name ?? null,
      }));

    (async () => {
      try {
        const [{ data: sessData, error: e1 }, { data: intData, error: e2 }] = await Promise.all([
          supabase.from("sleep_sessions").select("*")
            .eq("child_id", childId)
            .gte("start_time", since)
            .lt("start_time", until)
            .order("start_time"),
          supabase.from("sleep_interruptions")
            .select("id, sleep_session_id, start_time, settling_method_id, settling_methods(name)")
            .gte("start_time", since)
            .lt("start_time", until),
        ]);
        if (cancelled) return;
        if (e1) throw e1;
        if (e2) throw e2;
        const sess = (sessData ?? []) as SleepSession[];
        const intrs = mapInterruptions((intData ?? []) as any[]);
        await Promise.all([
          putSessions(sess),
          putInterruptions(intrs.map((i) => ({ ...i, end_time: null }))),
        ]);
        if (!cancelled) { setSessions(sess); setInterruptions(intrs); }
      } catch (e) {
        if (cancelled) return;
        if (!navigator.onLine) {
          const [cachedSess, cachedIntrs] = await Promise.all([
            getSessions(childId, sinceDate, untilDate),
            getInterruptionsForRange(sinceDate, untilDate),
          ]);
          if (!cancelled) {
            setSessions(cachedSess);
            setInterruptions(mapInterruptions(cachedIntrs));
          }
        } else {
          devError("[Heatmap] load failed", e);
          toast.error(t("common.loadFailed"));
        }
      } finally {
        if (!cancelled) { setLoading(false); setHasFetched(true); }
      }
    })();

    return () => { cancelled = true; };
  }, [activeChild?.id, renderStart.getTime(), fetchKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Update the effective right boundary whenever sessions change.
  useEffect(() => {
    if (!sessions.length) {
      effectiveMaxAnchorMsRef.current = hardMaxAnchorMs;
      return;
    }
    const lastDayMs = Math.max(...sessions.map((s) => startOfDay(new Date(s.start_time)).getTime()));
    // Anchor that puts the last data day as the rightmost visible column.
    const dataBasedMax = lastDayMs - (VISIBLE - 1) * 86400000;
    effectiveMaxAnchorMsRef.current = Math.min(hardMaxAnchorMs, dataBasedMax);
  }, [sessions]);

  // ── sleep blocks ─────────────────────────────────────────────────────────
  const blocksPerDay = useMemo(() => {
    const now = new Date();
    return allDays.map((day) => {
      const windowStart = startOfDay(day).getTime() + originMin * 60000;
      const windowEnd = windowStart + 86400000;
      const out: { topPct: number; heightPct: number; type: "day" | "night"; sessionId: string }[] = [];
      for (const s of sessions) {
        const start = new Date(s.start_time).getTime();
        const end = (s.end_time ? new Date(s.end_time) : now).getTime();
        const lo = Math.max(start, windowStart);
        const hi = Math.min(end, windowEnd);
        if (hi <= lo) continue;
        out.push({
          topPct: ((lo - windowStart) / 86400000) * 100,
          heightPct: ((hi - lo) / 86400000) * 100,
          type: s.sleep_type,
          sessionId: s.id,
        });
      }
      return out;
    });
  }, [sessions, allDays, originMin]);

  const interruptionsPerDay = useMemo(() => {
    return allDays.map((day) => {
      const windowStart = startOfDay(day).getTime() + originMin * 60000;
      const windowEnd = windowStart + 86400000;
      const items = interruptions
        .map((i) => {
          const ts = new Date(i.start_time).getTime();
          if (ts < windowStart || ts >= windowEnd) return null;
          const session = sessions.find((s) => s.id === i.sleep_session_id);
          if (!session) return null;
          const sStart = new Date(session.start_time).getTime();
          const sEnd = session.end_time ? new Date(session.end_time).getTime() : Date.now();
          if (ts < sStart || ts > sEnd) return null;
          return {
            id: i.id,
            topPct: ((ts - windowStart) / 86400000) * 100,
            name: i.settling_method_name,
            session,
          };
        })
        .filter(Boolean) as { id: string; topPct: number; name: string | null; session: SleepSession }[];

      items.sort((a, b) => a.topPct - b.topPct);

      const clusters: { topPct: number; items: typeof items; session: SleepSession }[] = [];
      for (const it of items) {
        const last = clusters[clusters.length - 1];
        if (last && it.topPct - last.topPct < ICON_OVERLAP_PCT) {
          last.items.push(it);
        } else {
          clusters.push({ topPct: it.topPct, items: [it], session: it.session });
        }
      }
      return clusters;
    });
  }, [interruptions, sessions, allDays, originMin]);

  // Gridline / axis marks every 6h, labelled from the axis origin (night_start
  // when not splitting by date, else midnight). `pos` is the 0–1 fraction down
  // the grid; `label` is the wall-clock time at that line.
  const axisMarks = useMemo(
    () => [0, 6, 12, 18, 24].map((offset) => ({
      pos: offset / 24,
      label: minsToClock(originMin + offset * 60),
    })),
    [originMin],
  );

  if (!activeChild) {
    return <div className="px-4 text-center text-muted-foreground mt-12">{t("sleep.noChildSelected")}</div>;
  }

  const canGoNext = anchor.getTime() < effectiveMaxAnchorMsRef.current;
  const rangeLabel = `${format(anchor, "d MMM", { locale })} – ${format(addDays(anchor, VISIBLE - 1), "d MMM", { locale })}`;
  // Percentage-based fallback transform (used before useLayoutEffect fires).
  const pctTransform = `translateX(-${(BUFFER / TOTAL) * 100}%)`;

  return (
    <main className="min-h-screen bg-hero p-4">
      <div className="max-w-2xl mx-auto py-4">
        <Button type="button" variant="ghost" size="sm" onClick={handleBack} className="mb-4">
          <ArrowLeft className="w-4 h-4 mr-1" /> {t("common.back")}
        </Button>
        <h1 className="font-display text-2xl font-semibold mb-1">{t("analytics.heatmapTitle")}</h1>
        <p className="text-xs text-muted-foreground mb-1">{t("analytics.heatmapHelp")}</p>

        <div className="flex items-center justify-between mb-3">
          <Button variant="ghost" size="icon" onClick={() => setAnchor(subDays(anchor, 7))}>
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <div ref={rangeLabelRef} className="text-sm font-medium">{rangeLabel}</div>
          <Button variant="ghost" size="icon" disabled={!canGoNext}
            onClick={() => setAnchor(addDays(anchor, 7))}>
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>

        <Card className="p-3 shadow-card overflow-hidden">
          {/* Initial loading skeleton */}
          {loading && !hasFetched && (
            <div className="flex pl-10 gap-1" style={{ height: GRID_HEIGHT + 32 }}>
              {Array.from({ length: VISIBLE }).map((_, i) => (
                <div key={i} className="flex-1 flex flex-col gap-1 pt-6">
                  <div className="h-3 bg-muted animate-pulse rounded mb-2" />
                  <div className="flex-1 bg-muted/60 animate-pulse rounded-md" />
                </div>
              ))}
            </div>
          )}

          {hasFetched && (
            <div
              ref={dragContainerRef}
              className="select-none"
              onTouchStart={(e) => startDrag(e.touches[0].clientX, e.touches[0].clientY, true)}
              onTouchEnd={(e) => endDrag(e.changedTouches[0].clientX)}
              onMouseDown={(e) => { e.preventDefault(); startDrag(e.clientX, e.clientY); }}
              onMouseMove={(e) => { if (dragStartX.current !== null) moveDrag(e.clientX, e.clientY); }}
              onMouseUp={(e) => { if (dragStartX.current !== null) endDrag(e.clientX); }}
              onMouseLeave={(e) => { if (dragStartX.current !== null) endDrag(e.clientX); }}
              style={{ cursor: "grab" }}
            >
              {/* Scrollable day headers */}
              <div className="pl-10 mb-1 overflow-hidden">
                <div
                  ref={headerRef}
                  className="flex"
                  style={{
                    width: `${(TOTAL / VISIBLE) * 100}%`,
                    transform: pctTransform,
                    willChange: "transform",
                  }}
                >
                  {allDays.map((d, i) => {
                    const isToday = d.getTime() === today.getTime();
                    return (
                      <div
                        key={i}
                        className="text-center flex-shrink-0"
                        style={{ width: `${100 / TOTAL}%` }}
                      >
                        <div className={`text-[10px] uppercase tracking-wide ${isToday ? "text-primary font-semibold" : "text-muted-foreground"}`}>
                          {format(d, "EEE", { locale })}
                        </div>
                        <div className={`text-xs ${isToday ? "text-primary font-semibold" : ""}`}>
                          {format(d, "d")}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Grid: fixed time axis + draggable columns */}
              <div className="flex" style={{ height: GRID_HEIGHT + 2 * CHART_PAD_PX }}>
                {/* Time axis — never moves */}
                <div className="relative w-10 flex-shrink-0" style={{ height: GRID_HEIGHT + 2 * CHART_PAD_PX }}>
                  {axisMarks.map((m, i) => (
                    <div key={i}
                      className="absolute right-1 text-[10px] text-muted-foreground leading-none"
                      style={{ top: CHART_PAD_PX + m.pos * GRID_HEIGHT, transform: "translateY(-50%)" }}>
                      {m.label}
                    </div>
                  ))}
                </div>

                {/* Clipping container for day columns */}
                <div className="flex-1 overflow-hidden relative">
                  {/* Horizontal grid lines — static, pixel-aligned with time scale */}
                  {axisMarks.map((m, i) => (
                    <div key={i}
                      className="absolute left-0 right-0 border-t border-border/60 z-10 pointer-events-none"
                      style={{ top: CHART_PAD_PX + m.pos * GRID_HEIGHT }} />
                  ))}

                  {/* Track: all TOTAL columns, translated to show BUFFER offset */}
                  <div
                    ref={trackRef}
                    className="flex h-full absolute top-0 left-0"
                    style={{
                      width: `${(TOTAL / VISIBLE) * 100}%`,
                      transform: pctTransform,
                      willChange: "transform",
                    }}
                  >
                    {allDays.map((d, di) => (
                      <div
                        key={di}
                        className="h-full relative border-l border-border/40 first:border-l-0 flex-shrink-0"
                        style={{ width: `${100 / TOTAL}%` }}
                      >
                        {blocksPerDay[di].map((b, bi) => (
                          <div
                            key={bi}
                            className="absolute left-[10%] right-[10%] rounded-md"
                            style={{
                              top: CHART_PAD_PX + b.topPct * GRID_HEIGHT / 100,
                              height: b.heightPct * GRID_HEIGHT / 100,
                              background: b.type === "night"
                                ? "hsl(var(--primary) / 0.85)"
                                : "hsl(var(--primary) / 0.55)",
                            }}
                            onClick={() => {
                              const sess = sessions.find((s) => s.id === b.sessionId);
                              if (sess) setOpenSession(sess);
                            }}
                            role="button"
                          />
                        ))}
                        {interruptionsPerDay[di].map((cl, ci) => {
                          const vis = cl.items.slice(0, 2);
                          const extra = cl.items.length - vis.length;
                          return (
                            <button
                              key={ci}
                              type="button"
                              aria-label="open sleep"
                              className="absolute left-1/2 flex items-center gap-0.5 rounded-full bg-background/80 backdrop-blur-sm border border-border/60 px-1 py-0.5 shadow-sm hover:bg-background z-20"
                              style={{ top: CHART_PAD_PX + cl.topPct * GRID_HEIGHT / 100, transform: "translate(-50%, -50%)" }}
                              onClick={(e) => { e.stopPropagation(); setOpenSession(cl.session); }}
                            >
                              {vis.map((it) => {
                                const Icon = it.name ? iconForMethod(it.name) : Minus;
                                return <Icon key={it.id} className="w-2.5 h-2.5 text-muted-foreground" strokeWidth={2} />;
                              })}
                              {extra > 0 && (
                                <span className="text-[8px] leading-none text-muted-foreground font-medium pl-0.5">+{extra}</span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </Card>

        {openSession && (
          <Suspense fallback={null}>
            <SleepDetail
              session={openSession}
              onClose={() => setOpenSession(null)}
              onChange={() => setFetchKey((k) => k + 1)}
            />
          </Suspense>
        )}
      </div>
    </main>
  );
}
