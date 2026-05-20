import { lazy, memo, Suspense, useEffect, useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
  ResponsiveDialogTrigger,
} from "@/components/ui/responsive-dialog";
import { Plus, ChevronLeft, ChevronRight } from "lucide-react";
import { useSearchParams, useLocation } from "react-router-dom";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useChildren } from "@/contexts/ChildContext";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { putSessions, getSessions, projectSessionMutations } from "@/lib/sessions-cache";
import { db } from "@/lib/offline-queue";
import { useNetworkStatus } from "@/hooks/use-network-status";
import { WifiOff } from "lucide-react";
import {
  sessionDuration, wakeWindowMinutes,
  wwStatus, SleepSession, wwThresholdsAt, fmtWeekday,
} from "@/lib/sleep-utils";
import { useTimeFormat } from "@/lib/use-time-format";
import { isToday, isYesterday, startOfDay, isSameDay, addDays, subDays, format, differenceInMinutes } from "date-fns";
import { useChildRole, canCreateSleep } from "@/hooks/useChildRole";
import { sessionDay, type NightWindow } from "@/pages/Analytics";
import { DiscardChangesDialog } from "@/components/ui/discard-changes-dialog";

// Both components are only used inside dialogs — lazy-loaded to keep
// the History page bundle minimal.
const SleepForm = lazy(() => import("@/components/sleep/SleepForm"));
const SleepDetail = lazy(() => import("@/components/sleep/SleepDetail"));

const SESSIONS_QUERY_KEY = ["history", "sessions"] as const;

export default function History() {
  const { activeChild, settings } = useChildren();
  const { t } = useTranslation();
  const { role } = useChildRole();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const realLocation = useLocation();
  // Unique per-mount suffix so two simultaneous History instances (front layer
  // + behind layer during swipe-back) never share the same Supabase channel
  // name. supabase.channel() is a singleton registry keyed by name; a shared
  // name returns the already-subscribed object and adding callbacks to it
  // after subscribe() throws.
  const instanceId = useRef(Math.random().toString(36).slice(2)).current;
  const splitByDate = !!settings?.split_night_sleep_by_date;
  const night: NightWindow = {
    start: settings?.night_start_time?.slice(0, 5) ?? "19:00",
    end: settings?.night_end_time?.slice(0, 5) ?? "07:00",
  };
  const [open, setOpen] = useState<SleepSession | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [addFormDirty, setAddFormDirty] = useState(false);
  const [showDiscardAdd, setShowDiscardAdd] = useState(false);
  const [day, setDay] = useState<Date>(() => {
    const q = searchParams.get("date");
    if (q) {
      const d = startOfDay(new Date(q));
      if (!isNaN(d.getTime())) return d;
    }
    return startOfDay(new Date());
  });

  // Sync day → URL so reload/share preserves it; also clear param when today.
  useEffect(() => {
    const today = startOfDay(new Date());
    const params = new URLSearchParams(searchParams);
    if (isSameDay(day, today)) params.delete("date");
    else params.set("date", format(day, "yyyy-MM-dd"));
    if (import.meta.env.DEV) {
      console.log(
        `[History:setSearchParams] realPath=${realLocation.pathname}[${realLocation.key}]`,
        `day=${format(day, "yyyy-MM-dd")}`,
        `params=${params.toString() || "(empty)"}`,
        `isBehindLayer=${realLocation.pathname !== "/history"}`,
      );
    }
    setSearchParams(params, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [day]);

  // react-query handles: race conditions on rapid day switches (stale results
  // discarded), retry on transient errors, cache (revisiting a day is instant
  // within staleTime), and dedup if multiple consumers query the same key.
  const isOnline = useNetworkStatus();
  const dayKey = format(day, "yyyy-MM-dd");
  const { data: sessions = [], isLoading: loading } = useQuery({
    queryKey: [...SESSIONS_QUERY_KEY, activeChild?.id, dayKey],
    enabled: !!activeChild,
    // Always refetch on mount: if a sleep was added/edited on another page
    // (e.g. CurrentSleep) while History was unmounted, the realtime sub here
    // wasn't active, and the 30s staleTime would otherwise serve stale data.
    refetchOnMount: "always",
    // Run the queryFn even when offline so we can serve the local cache.
    networkMode: "always",
    queryFn: async () => {
      const sinceDate = subDays(startOfDay(day), 1);
      const untilDate = addDays(startOfDay(day), 1);
      const since = sinceDate.toISOString();
      const until = untilDate.toISOString();

      if (navigator.onLine) {
        const { data, error } = await supabase.from("sleep_sessions").select("*")
          .eq("child_id", activeChild!.id)
          .gte("start_time", since)
          .lt("start_time", until)
          .order("start_time", { ascending: false });
        if (error) throw error;
        const rows = (data ?? []) as SleepSession[];
        await putSessions(rows);
        return rows;
      }

      // Offline: serve cached rows + apply any pending queue mutations.
      const cached = await getSessions(activeChild!.id, sinceDate, untilDate);
      const pending = await db.mutations.toArray();
      const projected = projectSessionMutations(cached, pending);
      return projected.sort(
        (a, b) => new Date(b.start_time).getTime() - new Date(a.start_time).getTime()
      );
    },
  });

  const invalidateSessions = () =>
    queryClient.invalidateQueries({ queryKey: SESSIONS_QUERY_KEY });

  const handleAddOpenChange = (o: boolean) => {
    if (!o && addFormDirty) { setShowDiscardAdd(true); return; }
    setShowAdd(o);
    if (!o) setAddFormDirty(false);
  };

  useEffect(() => {
    if (!activeChild) return;
    const ch = supabase
      .channel(`history-${activeChild.id}-${instanceId}`)
      .on("postgres_changes",
        { event: "*", schema: "public", table: "sleep_sessions", filter: `child_id=eq.${activeChild.id}` },
        () => invalidateSessions())
      // sleep_interruptions intentionally not subscribed here: sessionDuration
      // is (end − start) and does not include interruptions, so the list view
      // has nothing to update when interruptions change. SleepDetail fetches
      // interruptions fresh on each open. An unfiltered interruptions channel
      // would violate the one-channel-per-child-id invariant and potentially
      // leak row payloads across families if Realtime RLS is not enabled.
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // queryClient is stable; activeChild?.id is the only meaningful dep.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeChild?.id]);

  if (!activeChild) return <div className="px-4 text-center text-muted-foreground mt-12">{t("sleep.noChildSelected")}</div>;

  const today = startOfDay(new Date());

  // Primary sessions for this day. Ongoing cross-midnight night sessions are excluded here —
  // they're shown as stubs on their start day and only appear here once completed.
  const daySessions = (() => {
    let crossIncluded = false;
    return sessions
      .filter((s) => {
        if (!isSameDay(bucketDay(s, splitByDate, night), day)) return false;
        // Ongoing session that started on a previous day: show as stub there, not here yet.
        if (!s.end_time && !isSameDay(startOfDay(new Date(s.start_time)), day)) return false;
        return true;
      })
      .sort((a, b) => new Date(b.start_time).getTime() - new Date(a.start_time).getTime())
      .filter((s) => {
        // On the end day, keep only the most recent cross-midnight night session from the previous day.
        if (splitByDate || isSameDay(startOfDay(new Date(s.start_time)), day)) return true;
        if (!crossIncluded) { crossIncluded = true; return true; }
        return false;
      });
  })();

  // Night sessions that started on this day but bucket to a different day (ongoing evening
  // sleep or completed cross-midnight). Shown as start-time-only stubs so the user sees
  // them on the day they began; the full session appears on the end day once completed.
  const nightStubs = !splitByDate
    ? sessions
        .filter((s) =>
          s.sleep_type === "night" &&
          isSameDay(startOfDay(new Date(s.start_time)), day) &&
          !isSameDay(bucketDay(s, splitByDate, night), day)
        )
        .sort((a, b) => new Date(b.start_time).getTime() - new Date(a.start_time).getTime())
    : [];

  const isCurrentDay = isSameDay(day, today);
  // Latest completed sleep across all sessions (sessions are DESC by start_time).
  const latestCompletedAny = sessions.find((s) => s.end_time) ?? null;

  return (
    <section className="px-4 max-w-md mx-auto w-full pb-4">
      <div className="flex items-center justify-between my-4">
        <h2 className="font-display text-2xl font-semibold">{t("history.title")}</h2>
        {canCreateSleep(role) && <ResponsiveDialog open={showAdd} onOpenChange={handleAddOpenChange}>
          <ResponsiveDialogTrigger asChild>
            <Button variant="outline" size="sm"><Plus className="w-4 h-4 mr-1" /> {t("common.add")}</Button>
          </ResponsiveDialogTrigger>
          <ResponsiveDialogContent>
            <ResponsiveDialogHeader><ResponsiveDialogTitle>{t("sleep.addPast")}</ResponsiveDialogTitle></ResponsiveDialogHeader>
            <Suspense fallback={null}>
              <SleepForm mode="manual" defaultDate={day} onDirtyChange={setAddFormDirty} onDone={() => { setShowAdd(false); setAddFormDirty(false); invalidateSessions(); }} />
            </Suspense>
          </ResponsiveDialogContent>
        </ResponsiveDialog>}
      </div>

      <div className="flex items-center gap-2 mb-4 w-full">
        <Button variant="ghost" size="icon" onClick={() => setDay(subDays(day, 1))}>
          <ChevronLeft className="w-4 h-4" />
        </Button>
        <Input type="date" value={format(day, "yyyy-MM-dd")} max={format(today, "yyyy-MM-dd")}
          onChange={(e) => e.target.value && setDay(startOfDay(new Date(e.target.value)))}
          className="text-center flex-1" />
        <Button variant="ghost" size="icon"
          disabled={isSameDay(day, today)}
          onClick={() => setDay(addDays(day, 1))}>
          <ChevronRight className="w-4 h-4" />
        </Button>
      </div>

      {!isOnline && (
        <div className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground py-1 mb-2">
          <WifiOff className="w-3 h-3" />
          {t("common.cachedData")}
        </div>
      )}

      {loading && (
        <Card className="p-5 shadow-card border-border/50 space-y-3">
          <div className="h-11 bg-muted animate-pulse rounded-xl" />
          <div className="h-11 bg-muted animate-pulse rounded-xl" />
          <div className="h-11 bg-muted animate-pulse rounded-xl w-2/3" />
          <div className="border-t border-border pt-3 flex justify-between">
            <div className="h-4 bg-muted animate-pulse rounded w-20" />
            <div className="h-4 bg-muted animate-pulse rounded w-12" />
          </div>
        </Card>
      )}

      {!loading && daySessions.length === 0 && nightStubs.length === 0 && !isCurrentDay && (
        <Card className="p-8 text-center text-muted-foreground shadow-card">{t("sleep.noHistory")}</Card>
      )}

      {!loading && (daySessions.length > 0 || nightStubs.length > 0 || isCurrentDay) && (
        <DayGroup date={day} sessions={daySessions} stubs={nightStubs}
          birthDate={activeChild.birth_date} onOpen={setOpen}
          fallbackLatestCompleted={latestCompletedAny} />
      )}

      {open && (
        <Suspense fallback={null}>
          <SleepDetail session={open} onClose={() => setOpen(null)} onChange={invalidateSessions} />
        </Suspense>
      )}

      <DiscardChangesDialog
        open={showDiscardAdd}
        onOpenChange={setShowDiscardAdd}
        onDiscard={() => { setShowAdd(false); setAddFormDirty(false); }}
      />
    </section>
  );
}

function bucketDay(s: SleepSession, splitByDate: boolean, night: NightWindow): Date {
  if (splitByDate) return startOfDay(new Date(s.start_time));
  return sessionDay(s, night);
}

function dayLabel(d: Date, t: (k: string) => string) {
  if (isToday(d)) return t("common.today");
  if (isYesterday(d)) return t("common.yesterday");
  return fmtWeekday(d);
}

const DayGroup = memo(function DayGroup({ date, sessions, stubs = [], birthDate, onOpen, fallbackLatestCompleted }: {
  date: Date; sessions: SleepSession[]; stubs?: SleepSession[];
  birthDate: string | null;
  onOpen: (s: SleepSession) => void;
  fallbackLatestCompleted?: SleepSession | null;
}) {
  const { t } = useTranslation();
  const { fmtTime, fmtDuration } = useTimeFormat();
  const now = new Date();
  // Sessions arrive in DESC order (latest first) — display them that way.
  const ordered = sessions;
  // Stubs are not counted in totals — they're shown on both the start and end day,
  // and their full duration is counted only on the end day.
  const totalMin = ordered.reduce((acc, s) => acc + sessionDuration(s, now), 0);
  const dayNapsCount = ordered.filter((s) => s.sleep_type === "day").length;

  // Projected wake window for an ongoing wake period (latest completed sleep
  // is at index 0 in DESC order).
  const latestCompleted = ordered.find((s) => s.end_time) ?? fallbackLatestCompleted ?? null;
  const isCurrentDay = isToday(date);
  // Stubs count for hasOngoing: an ongoing stub means the child is sleeping right now.
  const hasOngoing = ordered.some((s) => !s.end_time) || stubs.some((s) => !s.end_time);
  const projectedWW = (isCurrentDay && !hasOngoing && latestCompleted)
    ? Math.max(0, Math.round((now.getTime() - new Date(latestCompleted.end_time!).getTime()) / 60000))
    : null;
  const projectedTh = projectedWW !== null
    ? wwThresholdsAt(now, birthDate)
    : null;
  const projectedStatus = projectedTh && projectedWW !== null
    ? wwStatus(projectedWW, projectedTh.min, projectedTh.max)
    : null;
  const projectedOver = projectedTh && projectedWW !== null && projectedWW > projectedTh.max;

  return (
    <div>
      <div className="mb-3">
        <h3 className="font-display text-lg font-semibold">{dayLabel(date, t)}</h3>
      </div>

      <Card className="p-5 shadow-card border-border/50">
        {projectedWW !== null && (
          <div className="pb-2">
            {projectedOver && (
              <div className="text-xs font-medium text-[hsl(var(--ww-warn))] pl-2 mb-1">
                {t("sleep.timeToSleep")}
              </div>
            )}
            <div className="flex items-center gap-3 py-2 pl-2">
              <div className={`w-0.5 h-8 rounded-full ${projectedStatus === "warn" ? "bg-ww-warn" : "bg-ww-good"}`} />
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${projectedStatus === "warn" ? "bg-ww-warn-soft text-[hsl(var(--ww-warn))]" : "bg-ww-good-soft text-[hsl(var(--ww-good))]"}`}>
                {t("sleep.awake_label", { duration: fmtDuration(projectedWW) })}
              </span>
            </div>
          </div>
        )}

        {/* Stub rows: night sessions that started on this day but end on the next.
            Show start time only; full session appears on the end day once complete. */}
        {stubs.map((s) => {
          const earlierPrimary = ordered.find((x) => x.end_time) ?? null;
          const ww = earlierPrimary ? wakeWindowMinutes(earlierPrimary, s) : null;
          let wwSt: "good" | "warn" | null = null;
          if (ww !== null) {
            const th = wwThresholdsAt(new Date(s.start_time), birthDate);
            if (th) wwSt = wwStatus(ww, th.min, th.max);
          }
          return (
            <div key={s.id}>
              <button onClick={() => onOpen(s)} className="w-full text-left flex items-center justify-between py-3 hover:bg-muted/40 -mx-2 px-2 rounded-lg transition-smooth">
                <div className="flex items-center gap-3">
                  <span className="w-2 h-2 rounded-full bg-primary" />
                  <span className="font-medium">{fmtTime(s.start_time)}</span>
                  {!s.end_time && (
                    <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-primary/10 text-primary">
                      {t("sleep.ongoing")}
                    </span>
                  )}
                </div>
              </button>
              {earlierPrimary && ww !== null && ww >= 0 && (
                <div className="flex items-center gap-3 py-2 pl-2">
                  <div className={`w-0.5 h-8 rounded-full ${wwSt === "good" ? "bg-ww-good" : "bg-ww-warn"}`} />
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${wwSt === "good" ? "bg-ww-good-soft text-[hsl(var(--ww-good))]" : "bg-ww-warn-soft text-[hsl(var(--ww-warn))]"}`}>
                    {t("sleep.awake_label", { duration: fmtDuration(ww) })}
                  </span>
                </div>
              )}
            </div>
          );
        })}

        {ordered.map((s, i) => {
          // Chronologically earlier sleep is the next row in DESC display.
          const earlier = ordered.slice(i + 1).find((x) => x.end_time) ?? null;
          const ww = earlier ? wakeWindowMinutes(earlier, s) : null;
          let status: "good" | "warn" | null = null;
          if (ww !== null) {
            const th = wwThresholdsAt(new Date(s.start_time), birthDate);
            if (th) status = wwStatus(ww, th.min, th.max);
          }
          return (
            <div key={s.id}>
              <button onClick={() => onOpen(s)} className="w-full text-left flex items-center justify-between py-3 hover:bg-muted/40 -mx-2 px-2 rounded-lg transition-smooth">
                <div className="flex items-center gap-3">
                  <span className={`w-2 h-2 rounded-full ${s.sleep_type === "night" ? "bg-primary" : "bg-accent"}`} />
                  <span className="font-medium">{fmtTime(s.start_time)}</span>
                  {!s.end_time && (
                    <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-primary/10 text-primary">
                      {t("sleep.ongoing")}
                    </span>
                  )}
                </div>
                <span className="text-muted-foreground text-sm">{fmtDuration(sessionDuration(s, now))}</span>
              </button>
              {earlier && ww !== null && ww >= 0 && (
                <div className="flex items-center gap-3 py-2 pl-2">
                  <div className={`w-0.5 h-8 rounded-full ${status === "good" ? "bg-ww-good" : "bg-ww-warn"}`} />
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${status === "good" ? "bg-ww-good-soft text-[hsl(var(--ww-good))]" : "bg-ww-warn-soft text-[hsl(var(--ww-warn))]"}`}>
                    {t("sleep.awake_label", { duration: fmtDuration(ww) })}
                  </span>
                </div>
              )}
            </div>
          );
        })}

        <div className="border-t border-border mt-3 pt-3 space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">{t("sleep.totalSleep")}</span>
            <span className="font-display text-lg font-semibold">{fmtDuration(totalMin)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">{t("analytics.naps")}</span>
            <span className="text-sm font-semibold">{dayNapsCount}</span>
          </div>
        </div>
      </Card>
    </div>
  );
});
