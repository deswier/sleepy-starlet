import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Moon, Sun, Activity, Clock, Grid3x3, ChevronLeft, ChevronRight, ArrowUpRight, ArrowDownRight, Check } from "lucide-react";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useChildren } from "@/contexts/ChildContext";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  formatDuration, sessionDuration, SleepSession,
  ageInMonthsAt, wakeWindowForAge,
} from "@/lib/sleep-utils";
import {
  isSameDay, startOfDay, subDays, addDays, differenceInMinutes, format,
} from "date-fns";

export type NightWindow = { start: string; end: string };
const DEFAULT_NIGHT: NightWindow = { start: "19:00", end: "07:00" };

function parseHM(hm: string): { h: number; m: number } {
  const [h, m] = hm.split(":").map(Number);
  return { h: h || 0, m: m || 0 };
}

// The calendar day a session belongs to in lists/aggregations.
// Night sleeps that start within the night window of the previous evening
// (i.e. before midnight) are attributed to the END day; otherwise to the
// start date.
export function sessionDay(s: SleepSession, night: NightWindow = DEFAULT_NIGHT): Date {
  const start = new Date(s.start_time);
  if (s.sleep_type !== "night") return startOfDay(start);
  const { h: nsH, m: nsM } = parseHM(night.start);
  const startMin = start.getHours() * 60 + start.getMinutes();
  const nsMin = nsH * 60 + nsM;
  // Evening night sleep (started after night_start, before midnight):
  // - ongoing → pre-attribute to next day (it will end there)
  // - completed and crossed midnight → attribute to end day
  if (startMin >= nsMin && startMin >= 12 * 60) {
    if (!s.end_time) return startOfDay(addDays(start, 1));
    const end = new Date(s.end_time);
    if (!isSameDay(start, end)) return startOfDay(end);
  }
  return startOfDay(start);
}


export default function Analytics() {
  const navigate = useNavigate();
  const { activeChild, settings } = useChildren();
  const { t } = useTranslation();
  const night: NightWindow = {
    start: settings?.night_start_time?.slice(0, 5) ?? DEFAULT_NIGHT.start,
    end: settings?.night_end_time?.slice(0, 5) ?? DEFAULT_NIGHT.end,
  };
  const [loading, setLoading] = useState(true);
  const [initialDaySessions, setInitialDaySessions] = useState<SleepSession[]>([]);

  useEffect(() => {
    if (!activeChild) return;
    setLoading(true);

    const today = startOfDay(new Date());

    // Today's sessions — spinner only until this finishes.
    (async () => {
      try {
        const { data, error } = await supabase.from("sleep_sessions").select("*")
          .eq("child_id", activeChild.id)
          .gte("start_time", subDays(today, 1).toISOString())
          .lt("start_time", addDays(today, 1).toISOString())
          .order("start_time");
        if (error) throw error;
        setInitialDaySessions((data ?? []) as SleepSession[]);
      } catch (e) {
        console.error("[Analytics] day load failed", e);
        toast.error(t("common.loadFailed"));
      } finally {
        setLoading(false);
      }
    })();
  }, [activeChild?.id]);

  if (!activeChild) {
    return <div className="px-4 text-center text-muted-foreground mt-12">{t("sleep.noChildSelected")}</div>;
  }

  return (
    <section className="px-4 max-w-md mx-auto w-full pb-4">
      <div className="flex items-center justify-between my-4">
        <h2 className="font-display text-2xl font-semibold">{t("analytics.title")}</h2>
        <Button variant="ghost" size="sm" onClick={() => navigate("/heatmap")}>
          <Grid3x3 className="w-4 h-4 mr-1" /> {t("analytics.openHeatmap")}
        </Button>
      </div>
      {loading ? (
        <Card className="p-8 text-center text-muted-foreground shadow-card flex items-center justify-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin" />
        </Card>
      ) : (
      <Tabs defaultValue="day">
        <TabsList className="grid grid-cols-2 w-full mb-4">
          <TabsTrigger value="day">{t("analytics.daily")}</TabsTrigger>
          <TabsTrigger value="week">{t("analytics.weekly")}</TabsTrigger>
        </TabsList>
        <TabsContent value="day"><DayView key={activeChild.id} childId={activeChild.id} birthDate={activeChild.birth_date} night={night} initialSessions={initialDaySessions} /></TabsContent>
        <TabsContent value="week"><WeekView childId={activeChild.id} birthDate={activeChild.birth_date} night={night} /></TabsContent>
      </Tabs>
      )}
    </section>
  );
}

// ---------- DAY ----------
function DayView({ childId, birthDate, night, initialSessions }: { childId: string; birthDate: string | null; night: NightWindow; initialSessions: SleepSession[] }) {
  const { t } = useTranslation();
  const [day, setDay] = useState<Date>(startOfDay(new Date()));
  const [sessions, setSessions] = useState<SleepSession[]>(initialSessions);
  const [loadingDay, setLoadingDay] = useState(false);
  const isInitialRender = useRef(true);

  useEffect(() => {
    if (isInitialRender.current) {
      isInitialRender.current = false;
      return;
    }
    let cancelled = false;
    setLoadingDay(true);
    const since = subDays(startOfDay(day), 1).toISOString();
    const until = addDays(startOfDay(day), 1).toISOString();
    (async () => {
      try {
        const { data, error } = await supabase.from("sleep_sessions").select("*")
          .eq("child_id", childId)
          .gte("start_time", since)
          .lt("start_time", until)
          .order("start_time");
        if (cancelled) return;
        if (error) { console.error("[DayView] load failed", error); return; }
        setSessions((data ?? []) as SleepSession[]);
      } finally {
        if (!cancelled) setLoadingDay(false);
      }
    })();
    return () => { cancelled = true; };
  }, [childId, day]);

  const now = new Date();
  const isCurrentDay = isSameDay(day, startOfDay(now));
  // For today, only count time that has already elapsed (cap at "now").
  // For past days, use the full 24h.
  const dayElapsedMin = isCurrentDay
    ? Math.max(0, Math.round((now.getTime() - startOfDay(day).getTime()) / 60000))
    : 24 * 60;

  // Sleeps whose start_time is on the chosen day (used for nap counts and WW).
  const startedToday = useMemo(
    () => sessions.filter((s) => isSameDay(sessionDay(s, night), day)).sort(
      (a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime()
    ),
    [sessions, day, night]
  );

  const { totalSleep, sleepWithinDay, nightSleep } = useMemo(() => {
    // Parse night-window string once; compute all three metrics in a single pass.
    const { h: nsH, m: nsM } = parseHM(night.start);
    const nsMin = nsH * 60 + nsM;
    const dayMs = day.getTime();
    const dayStartMs = startOfDay(day).getTime();
    const dayEndMs = isCurrentDay ? now.getTime() : dayStartMs + 24 * 60 * 60 * 1000;
    const nowMs = now.getTime();

    let totalSleep = 0;
    let sleepWithinDay = 0;
    let nightSleep = 0;

    for (const s of sessions) {
      const startMs = new Date(s.start_time).getTime();
      const endMs = s.end_time ? new Date(s.end_time).getTime() : nowMs;

      // Bucketed day (inline sessionDay with pre-parsed nsMin)
      let sDayMs: number;
      if (s.sleep_type !== "night") {
        sDayMs = startOfDay(new Date(startMs)).getTime();
      } else {
        const start = new Date(startMs);
        const startMin = start.getHours() * 60 + start.getMinutes();
        if (startMin >= nsMin && startMin >= 12 * 60) {
          if (!s.end_time) {
            // Ongoing evening sleep → next day
            sDayMs = startOfDay(start).getTime() + 24 * 60 * 60 * 1000;
          } else {
            const sd = startOfDay(start).getTime();
            const ed = startOfDay(new Date(endMs)).getTime();
            sDayMs = ed !== sd ? ed : sd;
          }
        } else {
          sDayMs = startOfDay(new Date(startMs)).getTime();
        }
      }

      if (sDayMs === dayMs) {
        totalSleep += Math.max(0, Math.round((endMs - startMs) / 60000));
        if (s.sleep_type === "night" && s.end_time) {
          nightSleep = Math.max(nightSleep, Math.round((endMs - startMs) / 60000));
        }
      }

      // Physical overlap with today's window for ALL sessions — regardless of attribution.
      // A night sleep starting at 20:00 today belongs to tomorrow (totalSleep),
      // but the baby IS physically asleep those hours, so wake time must reflect that.
      const ovStart = Math.max(startMs, dayStartMs);
      const ovEnd = Math.min(endMs, dayEndMs);
      if (ovEnd > ovStart) sleepWithinDay += Math.round((ovEnd - ovStart) / 60000);
    }

    return { totalSleep, sleepWithinDay, nightSleep };
  }, [sessions, day, night, isCurrentDay]);

  const totalWake = Math.max(0, dayElapsedMin - sleepWithinDay);

  const { napsCount, avgNap, minNap, maxNap } = useMemo(() => {
    const naps = startedToday.filter((s) => s.sleep_type === "day" && s.end_time);
    const durations = naps.map((s) => sessionDuration(s, now));
    const count = naps.length;
    return {
      napsCount: count,
      avgNap: count ? Math.round(durations.reduce((a, b) => a + b, 0) / count) : 0,
      minNap: count ? Math.min(...durations) : 0,
      maxNap: count ? Math.max(...durations) : 0,
    };
  }, [startedToday]);

  const { wws, avgWW, minWW, maxWW } = useMemo(() => {
    const windows: number[] = [];
    for (let i = 1; i < startedToday.length; i++) {
      const prev = startedToday[i - 1];
      if (!prev.end_time) continue;
      const d = differenceInMinutes(new Date(startedToday[i].start_time), new Date(prev.end_time));
      if (d >= 0 && d < 12 * 60) windows.push(d);
    }
    // Today only: include the in-progress wake window up to "now".
    if (isCurrentDay && startedToday.length > 0) {
      const last = startedToday[startedToday.length - 1];
      if (last.end_time) {
        const elapsed = differenceInMinutes(now, new Date(last.end_time));
        if (elapsed > 0 && elapsed < 12 * 60) windows.push(elapsed);
      }
    }
    return {
      wws: windows,
      avgWW: windows.length ? Math.round(windows.reduce((a, b) => a + b, 0) / windows.length) : 0,
      minWW: windows.length ? Math.min(...windows) : 0,
      maxWW: windows.length ? Math.max(...windows) : 0,
    };
  }, [startedToday, isCurrentDay]);

  const norm = ageNorm(birthDate, day);

  if (loadingDay) {
    return (
      <>
        <DayPicker day={day} setDay={setDay} />
        <Card className="p-8 text-center text-muted-foreground shadow-card flex items-center justify-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin" />
        </Card>
      </>
    );
  }

  if (totalSleep === 0 && napsCount === 0) {
    return (
      <>
        <DayPicker day={day} setDay={setDay} />
        <Card className="p-6 text-center text-muted-foreground">{t("analytics.noData")}</Card>
      </>
    );
  }

  return (
    <div className="space-y-3">
      <DayPicker day={day} setDay={setDay} />

      <Stat icon={<Moon className="w-5 h-5" />} label={t("analytics.totalSleep")}
        value={formatDuration(totalSleep)}
        sub={norm ? normLabel(t, totalSleep, norm.totalSleep) : undefined}
        arrow={<NormArrow value={totalSleep} norm={norm?.totalSleep} />} />

      <Stat icon={<Sun className="w-5 h-5" />} label={t("analytics.totalWake")}
        value={formatDuration(totalWake)} />

      <Stat icon={<Moon className="w-5 h-5" />} label={t("analytics.nightSleep")}
        value={nightSleep ? formatDuration(nightSleep) : "—"}
        sub={norm && nightSleep ? normLabel(t, nightSleep, norm.nightSleep) : undefined}
        arrow={<NormArrow value={nightSleep} norm={norm?.nightSleep} />} />

      <Card className="p-5 shadow-card border-border/50">
        <Header icon={<Activity className="w-5 h-5" />} label={t("analytics.avgWW")}
          value={avgWW ? formatDuration(avgWW) : "—"}
          arrow={<NormArrow value={avgWW} norm={norm?.ww} />} />
        <SubGrid>
          <SubItem label={t("analytics.minWW")} value={wws.length ? formatDuration(minWW) : "—"} />
          <SubItem label={t("analytics.maxWW")} value={wws.length ? formatDuration(maxWW) : "—"} />
        </SubGrid>
        {norm && avgWW > 0 && (
          <p className="text-xs text-muted-foreground mt-2">{normLabel(t, avgWW, norm.ww)}</p>
        )}
      </Card>

      <Card className="p-5 shadow-card border-border/50">
        <Header icon={<Clock className="w-5 h-5" />} label={t("analytics.naps")} value={String(napsCount)}
          arrow={<NormArrow value={napsCount} norm={norm?.napsCount} />} />
        <SubGrid>
          <SubItem label={t("analytics.avgNap")} value={napsCount ? formatDuration(avgNap) : "—"} />
          <SubItem label={t("analytics.minNap")} value={napsCount ? formatDuration(minNap) : "—"} />
          <SubItem label={t("analytics.maxNap")} value={napsCount ? formatDuration(maxNap) : "—"} />
        </SubGrid>
        {norm && napsCount > 0 && (
          <p className="text-xs text-muted-foreground mt-2">{normLabel(t, napsCount, norm.napsCount)}</p>
        )}
      </Card>
    </div>
  );
}

function DayPicker({ day, setDay }: { day: Date; setDay: (d: Date) => void }) {
  const today = startOfDay(new Date());
  const value = format(day, "yyyy-MM-dd");
  return (
    <div className="flex items-center gap-2">
      <Button variant="ghost" size="icon" onClick={() => setDay(subDays(day, 1))}>
        <ChevronLeft className="w-4 h-4" />
      </Button>
      <Input type="date" value={value} max={format(today, "yyyy-MM-dd")}
        onChange={(e) => e.target.value && setDay(startOfDay(new Date(e.target.value)))}
        className="text-center" />
      <Button variant="ghost" size="icon"
        disabled={isSameDay(day, today)}
        onClick={() => setDay(addDays(day, 1))}>
        <ChevronRight className="w-4 h-4" />
      </Button>
    </div>
  );
}

// ---------- WEEK ----------
function WeekView({ childId, birthDate, night }: { childId: string; birthDate: string | null; night: NightWindow }) {
  const { t } = useTranslation();
  const now = new Date();
  const today = startOfDay(now);

  // weekOffset: 0 = last 7 completed days (yesterday..-6), 1 = the 7 before that, etc.
  const [weekOffset, setWeekOffset] = useState(0);
  const [sessions, setSessions] = useState<SleepSession[]>([]);
  const [loadingWeek, setLoadingWeek] = useState(true);
  const [pickerOpen, setPickerOpen] = useState(false);
  // Days the user has manually excluded from the average (by date key yyyy-MM-dd).
  const [excludedKeys, setExcludedKeys] = useState<Set<string>>(new Set());

  // Reset manual exclusions when navigating to a different week.
  useEffect(() => { setExcludedKeys(new Set()); }, [weekOffset]);

  const days = useMemo(() => {
    const arr: Date[] = [];
    const base = 1 + weekOffset * 7;
    for (let i = 0; i < 7; i++) arr.push(subDays(today, base + i));
    return arr.reverse();
  }, [today.getTime(), weekOffset]);

  useEffect(() => {
    let cancelled = false;
    setLoadingWeek(true);
    const since = subDays(days[0], 2).toISOString();
    const until = addDays(days[days.length - 1], 2).toISOString();
    (async () => {
      try {
        const { data, error } = await supabase.from("sleep_sessions").select("*")
          .eq("child_id", childId)
          .gte("start_time", since)
          .lt("start_time", until)
          .order("start_time");
        if (cancelled) return;
        if (error) throw error;
        setSessions((data ?? []) as SleepSession[]);
      } catch (e) {
        if (!cancelled) {
          console.error("[WeekView] load failed", e);
          toast.error(t("common.loadFailed"));
        }
      } finally {
        if (!cancelled) setLoadingWeek(false);
      }
    })();
    return () => { cancelled = true; };
  }, [childId, weekOffset]);

  const perDay = useMemo(() => {
    // Parse night-window string once instead of once per session per day.
    const { h: nsH, m: nsM } = parseHM(night.start);
    const nsMin = nsH * 60 + nsM;
    const nowMs = now.getTime();

    // Single pre-computation pass: resolve timestamps + bucketed day for every session.
    const ext = sessions.map((s) => {
      const startMs = new Date(s.start_time).getTime();
      const endMs = s.end_time ? new Date(s.end_time).getTime() : nowMs;
      let dayMs: number;
      if (s.sleep_type !== "night") {
        dayMs = startOfDay(new Date(startMs)).getTime();
      } else {
        const start = new Date(startMs);
        const startMin = start.getHours() * 60 + start.getMinutes();
        if (startMin >= nsMin && startMin >= 12 * 60) {
          if (!s.end_time) {
            dayMs = startOfDay(start).getTime() + 24 * 60 * 60 * 1000;
          } else {
            const startDay = startOfDay(start).getTime();
            const endDay = startOfDay(new Date(endMs)).getTime();
            dayMs = endDay !== startDay ? endDay : startDay;
          }
        } else {
          dayMs = startOfDay(new Date(startMs)).getTime();
        }
      }
      return { s, startMs, endMs, dayMs };
    });

    // Group by day for O(1) per-day lookup instead of O(n) filter per day.
    const byDay = new Map<number, typeof ext>();
    for (const e of ext) {
      const bucket = byDay.get(e.dayMs);
      if (bucket) bucket.push(e);
      else byDay.set(e.dayMs, [e]);
    }

    return days.map((d) => {
      const dMs = d.getTime();
      const forDay = byDay.get(dMs) ?? [];
      const completed = forDay.filter((e) => e.s.end_time)
        .sort((a, b) => a.startMs - b.startMs);

      // Physical overlap with the calendar day window — used for wake-time math
      // so that a 19:00→07:00 night sleep contributes 5h to the previous day
      // and 7h to the next day, regardless of which day it is "attributed" to.
      const dayStartMs = dMs;
      const dayEndMs = dMs + 24 * 60 * 60 * 1000;
      let physicalSleep = 0;
      for (const e of ext) {
        const ovStart = Math.max(e.startMs, dayStartMs);
        const ovEnd = Math.min(e.endMs, dayEndMs);
        if (ovEnd > ovStart) physicalSleep += Math.round((ovEnd - ovStart) / 60000);
      }
      const totalSleep = physicalSleep;
      const totalWake = Math.max(0, 24 * 60 - physicalSleep);

      let nightSleep = 0;
      for (const e of forDay) {
        if (e.s.sleep_type === "night" && e.s.end_time) {
          nightSleep = Math.max(nightSleep, Math.round((e.endMs - e.startMs) / 60000));
        }
      }

      const naps = completed.filter((e) => e.s.sleep_type === "day");
      const napDurations = naps.map((e) => Math.round((e.endMs - e.startMs) / 60000));

      const wws: number[] = [];
      for (let i = 1; i < completed.length; i++) {
        const diff = Math.round((completed[i].startMs - completed[i - 1].endMs) / 60000);
        if (diff >= 0 && diff < 12 * 60) wws.push(diff);
      }

      return { totalSleep, totalWake, nightSleep, napsCount: naps.length, napDurations, wws };
    });
  }, [sessions, days, night]);

  const picker = (
    <WeekPicker
      days={days}
      offset={weekOffset}
      setOffset={setWeekOffset}
      open={pickerOpen}
      setOpen={setPickerOpen}
      t={t}
    />
  );

  if (loadingWeek) {
    return (
      <div className="space-y-3">
        {picker}
        <Card className="p-5 shadow-card border-border/50 space-y-3">
          <div className="h-16 bg-muted animate-pulse rounded-xl" />
          <div className="h-16 bg-muted animate-pulse rounded-xl" />
          <div className="h-16 bg-muted animate-pulse rounded-xl" />
          <div className="h-24 bg-muted animate-pulse rounded-xl" />
          <div className="h-24 bg-muted animate-pulse rounded-xl" />
        </Card>
      </div>
    );
  }

  // Days that physically have records.
  const dayHasData = perDay.map((d) => d.totalSleep > 0 || d.napsCount > 0);
  const anyData = dayHasData.some(Boolean);
  if (!anyData) {
    return (
      <div className="space-y-3">
        {picker}
        <Card className="p-6 text-center text-muted-foreground">{t("analytics.noData")}</Card>
      </div>
    );
  }

  const dayKey = (d: Date) => format(d, "yyyy-MM-dd");
  // Active = has data AND not manually excluded.
  const activeFlags = perDay.map((d, i) => dayHasData[i] && !excludedKeys.has(dayKey(days[i])));
  const daysWithData = perDay.filter((_, i) => activeFlags[i]);

  const toggleDay = (i: number) => {
    if (!dayHasData[i]) return;
    const key = dayKey(days[i]);
    setExcludedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const avg = (arr: number[]) => arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : 0;

  const avgTotalSleep = avg(daysWithData.map((d) => d.totalSleep));
  const avgTotalWake = avg(daysWithData.map((d) => d.totalWake));
  const avgNightSleep = avg(daysWithData.filter((d) => d.nightSleep > 0).map((d) => d.nightSleep));

  const allWWs = daysWithData.flatMap((d) => d.wws);
  const avgWW = avg(allWWs);
  const minWW = allWWs.length ? Math.min(...allWWs) : 0;
  const maxWW = allWWs.length ? Math.max(...allWWs) : 0;

  const napCounts = daysWithData.map((d) => d.napsCount);
  const avgNapsCount = napCounts.length
    ? Math.round((napCounts.reduce((a, b) => a + b, 0) / napCounts.length) * 10) / 10
    : 0;
  const minNapsCount = napCounts.length ? Math.min(...napCounts) : 0;
  const maxNapsCount = napCounts.length ? Math.max(...napCounts) : 0;

  const allNapDur = daysWithData.flatMap((d) => d.napDurations);
  const avgNap = avg(allNapDur);
  const minNap = allNapDur.length ? Math.min(...allNapDur) : 0;
  const maxNap = allNapDur.length ? Math.max(...allNapDur) : 0;

  const midDay = days[Math.floor(days.length / 2)];
  const norm = ageNorm(birthDate, midDay);

  return (
    <div className="space-y-3">
      {picker}
      <DayChips
        days={days}
        hasData={dayHasData}
        active={activeFlags}
        onToggle={toggleDay}
        t={t}
      />

      {daysWithData.length === 0 ? (
        <Card className="p-6 text-center text-muted-foreground">{t("analytics.noData")}</Card>
      ) : (
      <>

      <Stat icon={<Moon className="w-5 h-5" />} label={t("analytics.totalSleep")}
        value={formatDuration(avgTotalSleep)} sub={t("analytics.avgPerDay")}
        secondary={norm ? normLabel(t, avgTotalSleep, norm.totalSleep) : undefined}
        arrow={<NormArrow value={avgTotalSleep} norm={norm?.totalSleep} />} />

      <Stat icon={<Sun className="w-5 h-5" />} label={t("analytics.totalWake")}
        value={formatDuration(avgTotalWake)} sub={t("analytics.avgPerDay")} />

      <Stat icon={<Moon className="w-5 h-5" />} label={t("analytics.nightSleep")}
        value={avgNightSleep ? formatDuration(avgNightSleep) : "—"} sub={t("analytics.avgPerDay")}
        secondary={norm && avgNightSleep ? normLabel(t, avgNightSleep, norm.nightSleep) : undefined}
        arrow={<NormArrow value={avgNightSleep} norm={norm?.nightSleep} />} />

      <Card className="p-5 shadow-card border-border/50">
        <Header icon={<Activity className="w-5 h-5" />} label={t("analytics.avgWW")}
          value={avgWW ? formatDuration(avgWW) : "—"}
          arrow={<NormArrow value={avgWW} norm={norm?.ww} />} />
        <SubGrid>
          <SubItem label={t("analytics.minWW")} value={allWWs.length ? formatDuration(minWW) : "—"} />
          <SubItem label={t("analytics.maxWW")} value={allWWs.length ? formatDuration(maxWW) : "—"} />
        </SubGrid>
        {norm && avgWW > 0 && (
          <p className="text-xs text-muted-foreground mt-2">{normLabel(t, avgWW, norm.ww)}</p>
        )}
      </Card>

      <Card className="p-5 shadow-card border-border/50">
        <Header icon={<Clock className="w-5 h-5" />} label={t("analytics.naps")}
          value={String(avgNapsCount)}
          arrow={<NormArrow value={avgNapsCount} norm={norm?.napsCount} />} />
        <SubGrid>
          <SubItem label={t("analytics.minNapsCount")} value={String(minNapsCount)} />
          <SubItem label={t("analytics.maxNapsCount")} value={String(maxNapsCount)} />
          <SubItem label={t("analytics.avgNap")} value={allNapDur.length ? formatDuration(avgNap) : "—"} />
          <SubItem label={t("analytics.minNap")} value={allNapDur.length ? formatDuration(minNap) : "—"} />
          <SubItem label={t("analytics.maxNap")} value={allNapDur.length ? formatDuration(maxNap) : "—"} />
        </SubGrid>
        {norm && avgNapsCount > 0 && (
          <p className="text-xs text-muted-foreground mt-2">{normLabel(t, avgNapsCount, norm.napsCount)}</p>
        )}
      </Card>
      </>
      )}
    </div>
  );
}

function DayChips({
  days, hasData, active, onToggle, t,
}: {
  days: Date[]; hasData: boolean[]; active: boolean[];
  onToggle: (i: number) => void;
  t: (k: string, o?: any) => string;
}) {
  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex flex-nowrap gap-1 w-full">
        {days.map((d, i) => {
          const isActive = active[i];
          const disabled = !hasData[i];
          const chip = (
            <button
              key={i}
              type="button"
              disabled={disabled}
              onClick={() => onToggle(i)}
              className={
                "flex-1 min-w-0 px-1 py-1 rounded-full text-[11px] leading-tight font-medium border transition-colors text-center tabular-nums " +
                (disabled
                  ? "bg-muted/40 text-muted-foreground/60 border-border/40 cursor-not-allowed line-through"
                  : isActive
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background text-muted-foreground border-border hover:bg-muted")
              }
            >
              {format(d, "dd.MM")}
            </button>
          );
          if (disabled) {
            return (
              <Tooltip key={i}>
                <TooltipTrigger asChild><span className="flex-1 min-w-0">{chip}</span></TooltipTrigger>
                <TooltipContent>{t("analytics.noDataForDay")}</TooltipContent>
              </Tooltip>
            );
          }
          return chip;
        })}
      </div>
    </TooltipProvider>
  );
}

// ---------- helpers ----------
function WeekPicker({
  days, offset, setOffset, open, setOpen, t,
}: {
  days: Date[]; offset: number; setOffset: (n: number) => void;
  open: boolean; setOpen: (b: boolean) => void;
  t: (k: string, o?: any) => string;
}) {
  const from = days[0];
  const to = days[days.length - 1];
  const label = t("analytics.weekRange", { from: format(from, "dd.MM"), to: format(to, "dd.MM") });

  // Build 12 selectable weeks starting from offset 0 (most recent).
  const today = startOfDay(new Date());
  const options: { offset: number; from: Date; to: Date }[] = [];
  for (let i = 0; i < 12; i++) {
    const base = 1 + i * 7;
    const wTo = subDays(today, base);
    const wFrom = subDays(today, base + 6);
    options.push({ offset: i, from: wFrom, to: wTo });
  }

  return (
    <div className="flex items-center gap-2">
      <Button variant="ghost" size="icon" onClick={() => setOffset(offset + 1)}>
        <ChevronLeft className="w-4 h-4" />
      </Button>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" className="flex-1 font-normal">{label}</Button>
        </PopoverTrigger>
        <PopoverContent className="w-64 p-1 max-h-72 overflow-y-auto" align="center">
          {options.map((o) => (
            <Button
              key={o.offset}
              variant={o.offset === offset ? "secondary" : "ghost"}
              className="w-full justify-start font-normal"
              onClick={() => { setOffset(o.offset); setOpen(false); }}
            >
              {format(o.from, "dd.MM")} – {format(o.to, "dd.MM")}
            </Button>
          ))}
        </PopoverContent>
      </Popover>
      <Button variant="ghost" size="icon" disabled={offset === 0} onClick={() => setOffset(offset - 1)}>
        <ChevronRight className="w-4 h-4" />
      </Button>
    </div>
  );
}

function ageNorm(birthDate: string | null, at: Date) {
  if (!birthDate) return null;
  const months = ageInMonthsAt(birthDate, at);
  if (months === null) return null;
  const ww = wakeWindowForAge(months);
  // Approximate norm ranges by age. These mirror common pediatric guidance.
  let totalSleep: { min: number; max: number };
  let nightSleep: { min: number; max: number };
  let napsCount: { min: number; max: number };
  if (months < 1) { totalSleep = { min: 14 * 60, max: 17 * 60 }; nightSleep = { min: 8 * 60, max: 9 * 60 }; napsCount = { min: 5, max: 7 }; }
  else if (months < 3) { totalSleep = { min: 14 * 60, max: 17 * 60 }; nightSleep = { min: 8 * 60, max: 10 * 60 }; napsCount = { min: 4, max: 5 }; }
  else if (months < 6) { totalSleep = { min: 12 * 60, max: 16 * 60 }; nightSleep = { min: 9 * 60, max: 11 * 60 }; napsCount = { min: 3, max: 4 }; }
  else if (months < 9) { totalSleep = { min: 12 * 60, max: 15 * 60 }; nightSleep = { min: 10 * 60, max: 11 * 60 }; napsCount = { min: 2, max: 3 }; }
  else if (months < 12) { totalSleep = { min: 12 * 60, max: 15 * 60 }; nightSleep = { min: 10 * 60, max: 12 * 60 }; napsCount = { min: 2, max: 3 }; }
  else if (months < 18) { totalSleep = { min: 11 * 60, max: 14 * 60 }; nightSleep = { min: 10 * 60, max: 12 * 60 }; napsCount = { min: 1, max: 2 }; }
  else if (months < 36) { totalSleep = { min: 11 * 60, max: 14 * 60 }; nightSleep = { min: 10 * 60, max: 12 * 60 }; napsCount = { min: 1, max: 1 }; }
  else { totalSleep = { min: 10 * 60, max: 13 * 60 }; nightSleep = { min: 10 * 60, max: 12 * 60 }; napsCount = { min: 0, max: 1 }; }
  return { totalSleep, nightSleep, napsCount, ww };
}

function normLabel(
  t: (k: string, o?: any) => string,
  value: number,
  norm: { min: number; max: number },
): string {
  const isDuration = norm.max >= 30;
  if (value >= norm.min && value <= norm.max) {
    return `${t("analytics.norm")}: ${formatRange(norm)} · ${t("analytics.withinNorm")}`;
  }
  if (value < norm.min) {
    return `${t("analytics.norm")}: ${formatRange(norm)} · ${t("analytics.below", { value: humanDelta(norm.min - value, isDuration) })}`;
  }
  return `${t("analytics.norm")}: ${formatRange(norm)} · ${t("analytics.above", { value: humanDelta(value - norm.max, isDuration) })}`;
}

function formatRange(n: { min: number; max: number }): string {
  // If looks like minutes (>= 30), render as duration; otherwise plain numbers (e.g., naps count).
  if (n.max >= 30) return `${formatDuration(n.min)}–${formatDuration(n.max)}`;
  return `${n.min}–${n.max}`;
}
function humanDelta(v: number, isDuration = false): string {
  if (isDuration) return formatDuration(Math.max(1, Math.round(v)));
  return Math.round(v * 10) / 10 + "";
}

function Stat({ icon, label, value, sub, secondary, arrow }: {
  icon: React.ReactNode; label: string; value: string; sub?: string; secondary?: string; arrow?: React.ReactNode;
}) {
  return (
    <Card className="p-5 shadow-card border-border/50">
      <div className="flex items-center gap-3 text-muted-foreground text-sm mb-1">
        <span className="w-9 h-9 rounded-full bg-primary/10 text-primary flex items-center justify-center">{icon}</span>
        {label}
      </div>
      <div className="font-display text-3xl font-semibold mt-2 flex items-center gap-2">{value}{arrow}</div>
      {sub && <div className="text-xs text-muted-foreground mt-1">{sub}</div>}
      {secondary && <div className="text-xs text-muted-foreground mt-1">{secondary}</div>}
    </Card>
  );
}

function Header({ icon, label, value, arrow }: { icon: React.ReactNode; label: string; value: string; arrow?: React.ReactNode }) {
  return (
    <>
      <div className="flex items-center gap-3 text-muted-foreground text-sm mb-1">
        <span className="w-9 h-9 rounded-full bg-primary/10 text-primary flex items-center justify-center">{icon}</span>
        {label}
      </div>
      <div className="font-display text-3xl font-semibold mt-2 mb-3 flex items-center gap-2">{value}{arrow}</div>
    </>
  );
}

export function NormArrow({ value, norm }: { value: number; norm: { min: number; max: number } | null | undefined }) {
  if (!norm || !value) return null;
  if (value >= norm.min && value <= norm.max) return <Check className="w-5 h-5 text-[hsl(var(--ww-good))]" />;
  if (value < norm.min) return <ArrowDownRight className="w-5 h-5 text-[hsl(var(--ww-warn))]" />;
  return <ArrowUpRight className="w-5 h-5 text-[hsl(var(--ww-warn))]" />;
}

function SubGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 gap-2">{children}</div>;
}

function SubItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-muted/40 rounded-lg p-2">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className="font-semibold">{value}</div>
    </div>
  );
}
