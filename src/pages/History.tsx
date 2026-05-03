import { memo, useCallback, useEffect, useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, ChevronLeft, ChevronRight } from "lucide-react";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useChildren } from "@/contexts/ChildContext";
import { useTranslation } from "react-i18next";
import {
  formatDuration, formatTime, sessionDuration, wakeWindowMinutes,
  wwStatus, SleepSession, wwThresholdsAt, fmtWeekday,
} from "@/lib/sleep-utils";
import { isToday, isYesterday, startOfDay, isSameDay, addDays, subDays, format, differenceInMinutes } from "date-fns";
import { useChildRole, canCreateSleep } from "@/hooks/useChildRole";
import SleepForm from "@/components/sleep/SleepForm";
import SleepDetail from "@/components/sleep/SleepDetail";
import { sessionDay, type NightWindow } from "@/pages/Analytics";

export default function History() {
  const { activeChild, settings } = useChildren();
  const { t } = useTranslation();
  const { role } = useChildRole();
  const splitByDate = !!settings?.split_night_sleep_by_date;
  const night: NightWindow = {
    start: settings?.night_start_time?.slice(0, 5) ?? "19:00",
    end: settings?.night_end_time?.slice(0, 5) ?? "07:00",
  };
  const [sessions, setSessions] = useState<SleepSession[]>([]);
  const [open, setOpen] = useState<SleepSession | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [loading, setLoading] = useState(true);
  const [day, setDay] = useState<Date>(startOfDay(new Date()));

  // Sessions scoped to the selected day's window — refetch when day or child changes.
  const loadSessions = useCallback(async () => {
    if (!activeChild) return;
    setLoading(true);
    const since = subDays(startOfDay(day), 1).toISOString();
    const until = addDays(startOfDay(day), 1).toISOString();
    const { data } = await supabase.from("sleep_sessions").select("*")
      .eq("child_id", activeChild.id)
      .gte("start_time", since)
      .lt("start_time", until)
      .order("start_time", { ascending: false });
    setSessions((data ?? []) as SleepSession[]);
    setLoading(false);
  }, [activeChild?.id, day]);

  useEffect(() => { loadSessions(); }, [loadSessions]);

  // Keep ref so the realtime handler always calls the latest loadSessions
  // without re-subscribing the channel on every day change.
  const loadSessionsRef = useRef(loadSessions);
  useEffect(() => { loadSessionsRef.current = loadSessions; }, [loadSessions]);

  useEffect(() => {
    if (!activeChild) return;
    const ch = supabase
      .channel(`history-${activeChild.id}`)
      .on("postgres_changes",
        { event: "*", schema: "public", table: "sleep_sessions", filter: `child_id=eq.${activeChild.id}` },
        () => loadSessionsRef.current())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [activeChild?.id]);

  if (!activeChild) return <div className="px-4 text-center text-muted-foreground mt-12">{t("sleep.noChildSelected")}</div>;

  const today = startOfDay(new Date());
  const daySessions = sessions
    .filter((s) => isSameDay(bucketDay(s, splitByDate, night), day))
    .sort((a, b) => new Date(b.start_time).getTime() - new Date(a.start_time).getTime());
  const isCurrentDay = isSameDay(day, today);
  // Latest completed sleep across all sessions (sessions are DESC by start_time).
  const latestCompletedAny = sessions.find((s) => s.end_time) ?? null;

  return (
    <section className="px-4 max-w-md mx-auto w-full pb-4">
      <div className="flex items-center justify-between my-4">
        <h2 className="font-display text-2xl font-semibold">{t("history.title")}</h2>
        {canCreateSleep(role) && <Dialog open={showAdd} onOpenChange={setShowAdd}>
          <DialogTrigger asChild>
            <Button variant="outline" size="sm"><Plus className="w-4 h-4 mr-1" /> {t("common.add")}</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>{t("sleep.addPast")}</DialogTitle></DialogHeader>
            <SleepForm mode="manual" defaultDate={day} onDone={() => { setShowAdd(false); loadSessions(); }} />
          </DialogContent>
        </Dialog>}
      </div>

      <div className="flex items-center gap-2 mb-4">
        <Button variant="ghost" size="icon" onClick={() => setDay(subDays(day, 1))}>
          <ChevronLeft className="w-4 h-4" />
        </Button>
        <Input type="date" value={format(day, "yyyy-MM-dd")} max={format(today, "yyyy-MM-dd")}
          onChange={(e) => e.target.value && setDay(startOfDay(new Date(e.target.value)))}
          className="text-center" />
        <Button variant="ghost" size="icon"
          disabled={isSameDay(day, today)}
          onClick={() => setDay(addDays(day, 1))}>
          <ChevronRight className="w-4 h-4" />
        </Button>
      </div>

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

      {!loading && daySessions.length === 0 && !isCurrentDay && (
        <Card className="p-8 text-center text-muted-foreground shadow-card">{t("sleep.noHistory")}</Card>
      )}

      {!loading && (daySessions.length > 0 || isCurrentDay) && (
        <DayGroup date={day} sessions={daySessions}
          birthDate={activeChild.birth_date} onOpen={setOpen}
          fallbackLatestCompleted={latestCompletedAny} />
      )}

      {open && <SleepDetail session={open} onClose={() => setOpen(null)} onChange={loadSessions} />}
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

const DayGroup = memo(function DayGroup({ date, sessions, birthDate, onOpen, fallbackLatestCompleted }: {
  date: Date; sessions: SleepSession[];
  birthDate: string | null;
  onOpen: (s: SleepSession) => void;
  fallbackLatestCompleted?: SleepSession | null;
}) {
  const { t } = useTranslation();
  const now = new Date();
  // Sessions arrive in DESC order (latest first) — display them that way.
  const ordered = sessions;
  const totalMin = ordered.reduce((acc, s) => acc + sessionDuration(s, now), 0);
  const dayNapsCount = ordered.filter((s) => s.sleep_type === "day").length;

  // Projected wake window for an ongoing wake period (latest completed sleep
  // is at index 0 in DESC order).
  const latestCompleted = ordered.find((s) => s.end_time) ?? fallbackLatestCompleted ?? null;
  const isCurrentDay = isToday(date);
  const hasOngoing = ordered.some((s) => !s.end_time);
  const projectedWW = (isCurrentDay && !hasOngoing && latestCompleted)
    ? Math.max(0, differenceInMinutes(now, new Date(latestCompleted.end_time!)))
    : null;
  const projectedTh = projectedWW !== null
    ? wwThresholdsAt(now, birthDate)
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
              <div className={`w-0.5 h-8 rounded-full ${projectedOver ? "bg-ww-warn" : "bg-ww-good"}`} />
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${projectedOver ? "bg-ww-warn-soft text-[hsl(var(--ww-warn))]" : "bg-ww-good-soft text-[hsl(var(--ww-good))]"}`}>
                {t("sleep.awake_label", { duration: formatDuration(projectedWW) })}
              </span>
            </div>
          </div>
        )}
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
                  <span className="font-medium">{formatTime(s.start_time)}</span>
                  {!s.end_time && (
                    <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-primary/10 text-primary">
                      {t("sleep.ongoing")}
                    </span>
                  )}
                </div>
                <span className="text-muted-foreground text-sm">{formatDuration(sessionDuration(s, now))}</span>
              </button>
              {earlier && ww !== null && ww >= 0 && (
                <div className="flex items-center gap-3 py-2 pl-2">
                  <div className={`w-0.5 h-8 rounded-full ${status === "good" ? "bg-ww-good" : "bg-ww-warn"}`} />
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${status === "good" ? "bg-ww-good-soft text-[hsl(var(--ww-good))]" : "bg-ww-warn-soft text-[hsl(var(--ww-warn))]"}`}>
                    {t("sleep.awake_label", { duration: formatDuration(ww) })}
                  </span>
                </div>
              )}
            </div>
          );
        })}

        <div className="border-t border-border mt-3 pt-3 space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">{t("sleep.totalSleep")}</span>
            <span className="font-display text-lg font-semibold">{formatDuration(totalMin)}</span>
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
