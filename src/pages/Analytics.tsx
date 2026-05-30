import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { devError } from "@/lib/logger";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Moon, Sun, Activity, Clock, Grid3x3, ChevronLeft, ChevronRight, ArrowUpRight, ArrowDownRight, Check } from "lucide-react";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { putSessions, getSessions, projectSessionMutations } from "@/lib/sessions-cache";
import { db } from "@/lib/offline-queue";
import { useNetworkStatus } from "@/hooks/use-network-status";
import { WifiOff } from "lucide-react";
import { useChildren } from "@/contexts/ChildContext";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  formatDuration, sessionDuration, SleepSession,
  ageInMonthsAt, wakeWindowForAge,
} from "@/lib/sleep-utils";
import { getSleepNorms } from "@/lib/sleep-norms";
import { calcTotalWake, calcTotalDaySleep, calcNapsCount, calcDayNightSleep, calcDayNightTimes, avgNightTimes } from "@/lib/analytics-calc";
import { useTimeFormat } from "@/lib/use-time-format";
import {
  isSameDay, startOfDay, subDays, addDays, format,
} from "date-fns";
import { enUS, ru } from "date-fns/locale";
import i18n from "@/i18n";
import { WeekStackedSleepChart, type WeekCompareDayDatum } from "@/components/analytics/DayBarChart";

export type NightWindow = { start: string; end: string };
const DEFAULT_NIGHT: NightWindow = { start: "19:00", end: "07:00" };

function parseHM(hm: string): { h: number; m: number } {
  const [h, m] = hm.split(":").map(Number);
  return { h: h || 0, m: m || 0 };
}

function getScoreDetails(
  t: (k: string, o?: any) => string,
  metrics: {
    totalSleep: number;
    totalWake: number;
    nightSleep: number;
    daySleep: number;
    avgWW?: number;
    napsCount?: number;
  },
  normData: ReturnType<typeof ageNorm>,
) {
  if (!normData) return { score: 0, total: 6, details: [], failed: [] };

  const details = [
    { key: "totalSleep", label: t("analytics.totalSleep"), pass: metrics.totalSleep > 0 && metrics.totalSleep >= normData.totalSleep.min && metrics.totalSleep <= normData.totalSleep.max },
    { key: "nightSleep", label: t("analytics.nightSleep"), pass: metrics.nightSleep > 0 && metrics.nightSleep >= normData.nightSleep.min && metrics.nightSleep <= normData.nightSleep.max },
    { key: "totalWake", label: t("analytics.totalWake"), pass: metrics.totalWake > 0 && metrics.totalWake >= normData.totalWake.min && metrics.totalWake <= normData.totalWake.max },
    { key: "ww", label: t("analytics.avgWW"), pass: (metrics.avgWW ?? 0) > 0 && metrics.avgWW! >= normData.ww.min && metrics.avgWW! <= normData.ww.max },
    { key: "daySleep", label: t("analytics.totalDaySleep"), pass: metrics.daySleep > 0 && metrics.daySleep >= normData.daySleep.min && metrics.daySleep <= normData.daySleep.max },
    { key: "naps", label: t("analytics.napsCountScore"), pass: (metrics.napsCount ?? 0) > 0 && metrics.napsCount! >= normData.napsCount.min && metrics.napsCount! <= normData.napsCount.max },
  ];

  const passed = details.filter(d => d.pass).length;
  const failed = details.filter(d => !d.pass);

  return { score: passed, total: 6, details, failed };
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
  const { activeChild, settings } = useChildren();
  const { t } = useTranslation();
  const night: NightWindow = {
    start: settings?.night_start_time?.slice(0, 5) ?? DEFAULT_NIGHT.start,
    end: settings?.night_end_time?.slice(0, 5) ?? DEFAULT_NIGHT.end,
  };
  const splitByDate = !!settings?.split_night_sleep_by_date;
  const [tab, setTab] = useState<string>(() => {
    if (typeof window === "undefined") return "day";
    const v = localStorage.getItem("analytics.tab");
    return v === "week" || v === "day" ? v : "day";
  });
  useEffect(() => {
    try { localStorage.setItem("analytics.tab", tab); } catch {}
  }, [tab]);

  // Tapping a day bar in the week view drills into that day. We persist the
  // target into DayView's own localStorage key, switch tabs, and bump a token
  // so DayView remounts and re-reads it (covers both Radix mount behaviours).
  const [dayNav, setDayNav] = useState(0);
  const selectDay = (dateKey: string) => {
    if (!activeChild) return;
    try { localStorage.setItem(`analytics.day.${activeChild.id}`, dateKey); } catch {}
    setDayNav((n) => n + 1);
    setTab("day");
  };

  if (!activeChild) {
    return <div className="px-4 text-center text-muted-foreground mt-12">{t("sleep.noChildSelected")}</div>;
  }

  return (
    <section className="px-4 max-w-md mx-auto w-full pb-4">
      <div className="flex items-center justify-between my-4">
        <h2 className="font-display text-2xl font-semibold">{t("analytics.title")}</h2>
      </div>
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="grid grid-cols-2 w-full mb-4">
          <TabsTrigger value="day">{t("analytics.daily")}</TabsTrigger>
          <TabsTrigger value="week">{t("analytics.weekly")}</TabsTrigger>
        </TabsList>
        <TabsContent value="day"><DayView key={`${activeChild.id}:${dayNav}`} childId={activeChild.id} birthDate={activeChild.birth_date} night={night} splitByDate={splitByDate} /></TabsContent>
        <TabsContent value="week"><WeekView childId={activeChild.id} birthDate={activeChild.birth_date} night={night} splitByDate={splitByDate} onSelectDay={selectDay} /></TabsContent>
      </Tabs>
    </section>
  );
}

// ---------- DAY ----------
function DayView({ childId, birthDate, night, splitByDate }: { childId: string; birthDate: string | null; night: NightWindow; splitByDate: boolean }) {
  const { t } = useTranslation();
  const { fmtTime } = useTimeFormat();
  const dayKey = `analytics.day.${childId}`;
  const [day, setDay] = useState<Date>(() => {
    try {
      const v = localStorage.getItem(dayKey);
      if (v) {
        const d = startOfDay(new Date(v));
        const today = startOfDay(new Date());
        if (!isNaN(d.getTime()) && d.getTime() <= today.getTime()) return d;
      }
    } catch {}
    return startOfDay(new Date());
  });
  useEffect(() => {
    try { localStorage.setItem(dayKey, format(day, "yyyy-MM-dd")); } catch {}
  }, [day, dayKey]);
  const isOnline = useNetworkStatus();
  const dateStr = format(day, "yyyy-MM-dd");
  const sinceDate = subDays(startOfDay(day), 1);
  const untilDate = addDays(startOfDay(day), 1);

  const { data: sessions = [], isLoading: loadingDay } = useQuery<SleepSession[]>({
    queryKey: ["analytics-day", childId, dateStr],
    queryFn: async () => {
      try {
        const { data, error } = await supabase.from("sleep_sessions").select("*")
          .eq("child_id", childId)
          .gte("start_time", sinceDate.toISOString())
          .lt("start_time", untilDate.toISOString())
          .order("start_time");
        if (error) throw error;
        const rows = (data ?? []) as SleepSession[];
        await putSessions(rows);
        return rows;
      } catch (e) {
        if (!navigator.onLine) {
          const cached = await getSessions(childId, sinceDate, untilDate);
          const pending = await db.mutations.toArray();
          return projectSessionMutations(cached, pending);
        }
        devError("[DayView] load failed", e);
        toast.error(t("common.loadFailed"));
        throw e;
      }
    },
    staleTime: 30_000,
    networkMode: "always",
    retry: false,
  });

  const now = new Date();
  const isCurrentDay = isSameDay(day, startOfDay(now));

  // Sleeps attributed to the chosen day (used for nap counts and WW).
  const startedToday = useMemo(
    () => sessions.filter((s) => {
      const bucket = splitByDate ? startOfDay(new Date(s.start_time)) : sessionDay(s, night);
      return isSameDay(bucket, day);
    }).sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime()),
    [sessions, day, night, splitByDate]
  );

  const nightSleep = useMemo(
    () => calcDayNightSleep(sessions, startOfDay(day), splitByDate, night, now),
    [sessions, day, night, splitByDate, isCurrentDay], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const dayNightTimes = useMemo(
    () => calcDayNightTimes(sessions, startOfDay(day), splitByDate, night),
    [sessions, day, night, splitByDate],
  );

  const totalWake = useMemo(
    () => calcTotalWake(sessions, startOfDay(day), now),
    [sessions, day, isCurrentDay], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const totalDaySleep = useMemo(
    () => calcTotalDaySleep(sessions, startOfDay(day), now),
    [sessions, day, isCurrentDay], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const napsCount = useMemo(
    () => calcNapsCount(sessions, startOfDay(day), now),
    [sessions, day, isCurrentDay], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const { avgNap, minNap, maxNap } = useMemo(() => {
    const naps = startedToday.filter((s) => s.sleep_type === "day" && s.end_time);
    const durations = naps.map((s) => sessionDuration(s, now));
    const count = naps.length;
    return {
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
      const d = Math.round(
        (new Date(startedToday[i].start_time).getTime() - new Date(prev.end_time).getTime()) / 60000
      );
      if (d >= 0 && d < 12 * 60) windows.push(d);
    }
    // Today only: include the last wake window, capped at the night sleep start if it has
    // already begun (sessionDay puts it on tomorrow so it's absent from startedToday).
    if (isCurrentDay && startedToday.length > 0) {
      const last = startedToday[startedToday.length - 1];
      if (last.end_time) {
        const nightStub = sessions.find(
          (s) => s.sleep_type === "night" && !s.end_time &&
            isSameDay(startOfDay(new Date(s.start_time)), day) &&
            !isSameDay(sessionDay(s, night), day)
        );
        const endpoint = nightStub ? new Date(nightStub.start_time).getTime() : now.getTime();
        const elapsed = Math.round((endpoint - new Date(last.end_time).getTime()) / 60000);
        if (elapsed > 0 && elapsed < 12 * 60) windows.push(elapsed);
      }
    }
    return {
      wws: windows,
      avgWW: windows.length ? Math.round(windows.reduce((a, b) => a + b, 0) / windows.length) : 0,
      minWW: windows.length ? Math.min(...windows) : 0,
      maxWW: windows.length ? Math.max(...windows) : 0,
    };
  }, [startedToday, isCurrentDay, sessions, night, day]);

  const totalSleep = nightSleep + totalDaySleep;

  const norm = ageNorm(birthDate, day);

  const getDayScore = () => {
    if (!norm) return null;
    const result = getScoreDetails(t, { totalSleep, totalWake, nightSleep, daySleep: totalDaySleep, avgWW, napsCount }, norm);
    return { score: result.score, total: 6, failed: result.failed };
  };

  const dayScore = getDayScore();

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

      {!isOnline && (
        <div className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground py-0.5">
          <WifiOff className="w-3 h-3" />
          {t("common.cachedData")}
        </div>
      )}

      {dayScore && (
        <Card className="p-4 shadow-card border-border/50">
          <div className="flex items-end gap-3 mb-3">
            <div className="flex-1">
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary transition-all"
                  style={{ width: `${(dayScore.score / dayScore.total) * 100}%` }}
                />
              </div>
            </div>
            <div className="text-sm font-semibold text-primary whitespace-nowrap">
              {dayScore.score}/{dayScore.total}
            </div>
          </div>
          {dayScore.failed.length > 0 ? (
            <div className="text-xs text-muted-foreground">
              <div className="mb-1.5 font-medium">{t("analytics.needsAttention")}:</div>
              <div className="space-y-0.5">
                {dayScore.failed.map((item) => (
                  <div key={item.key}>• {item.label}</div>
                ))}
              </div>
            </div>
          ) : (
            <div className="text-xs text-[hsl(var(--ww-good))] flex items-center gap-1.5 font-medium">
              <Check className="w-3.5 h-3.5" />
              {t("analytics.allGood")}
            </div>
          )}
        </Card>
      )}

      <Stat icon={<Moon className="w-5 h-5" />} label={t("analytics.totalSleep")}
        value={formatDuration(totalSleep)}
        sub={norm ? normLabel(t, totalSleep, norm.totalSleep) : undefined}
        arrow={<NormArrow value={totalSleep} norm={norm?.totalSleep} />} />

      <Card className="p-5 shadow-card border-border/50">
        <div className="flex items-center gap-3 text-muted-foreground text-sm mb-1">
          <span className="w-9 h-9 rounded-full bg-primary/10 text-primary flex items-center justify-center"><Moon className="w-5 h-5" /></span>
          {t("analytics.nightSleep")}
        </div>
        <div className={`font-display text-3xl font-semibold mt-2 flex items-center gap-2${nightSleep > 0 ? " mb-3" : ""}`}>
          {nightSleep ? formatDuration(nightSleep) : "—"}
          <NormArrow value={nightSleep} norm={norm?.nightSleep} />
        </div>
        {nightSleep > 0 && (
          <SubGrid>
            <SubItem label={t("analytics.bedtime")} value={dayNightTimes.bedtime ? fmtTime(dayNightTimes.bedtime) : "—"} />
            <SubItem label={t("analytics.wakeup")} value={dayNightTimes.wakeup ? fmtTime(dayNightTimes.wakeup) : "—"} />
          </SubGrid>
        )}
        {norm && nightSleep > 0 && (
          <p className="text-xs text-muted-foreground mt-2">{normLabel(t, nightSleep, norm.nightSleep)}</p>
        )}
      </Card>

      <Stat icon={<Sun className="w-5 h-5" />} label={t("analytics.totalWake")}
        value={formatDuration(totalWake)}
        sub={norm ? normLabel(t, totalWake, norm.totalWake) : undefined}
        arrow={<NormArrow value={totalWake} norm={norm?.totalWake} />} />

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

      <Stat icon={<Sun className="w-5 h-5" />} label={t("analytics.totalDaySleep")}
        value={formatDuration(totalDaySleep)}
        sub={norm ? normLabel(t, totalDaySleep, norm.daySleep) : undefined}
        arrow={<NormArrow value={totalDaySleep} norm={norm?.daySleep} />} />

      <Card className="p-5 shadow-card border-border/50">
        <Header icon={<Clock className="w-5 h-5" />} label={t("analytics.napsCountScore")} value={String(napsCount)}
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
    <div className="flex items-center gap-2 w-full">
      <Button variant="ghost" size="icon" onClick={() => setDay(subDays(day, 1))}>
        <ChevronLeft className="w-4 h-4" />
      </Button>
      <Input type="date" value={value} max={format(today, "yyyy-MM-dd")}
        onChange={(e) => e.target.value && setDay(startOfDay(new Date(e.target.value)))}
        className="text-center flex-1" />
      <Button variant="ghost" size="icon"
        disabled={isSameDay(day, today)}
        onClick={() => setDay(addDays(day, 1))}>
        <ChevronRight className="w-4 h-4" />
      </Button>
    </div>
  );
}

// ---------- WEEK ----------
function WeekView({ childId, birthDate, night, splitByDate, onSelectDay }: { childId: string; birthDate: string | null; night: NightWindow; splitByDate: boolean; onSelectDay: (dateKey: string) => void }) {
  const { t } = useTranslation();
  const { fmtTime } = useTimeFormat();
  const navigate = useNavigate();
  const locale = i18n.language?.startsWith("ru") ? ru : enUS;
  const now = new Date();
  const today = startOfDay(now);

  // weekOffset: 0 = last 7 completed days (yesterday..-6), 1 = the 7 before that, etc.
  const offsetKey = `analytics.weekOffset.${childId}`;
  const excludedKey = `analytics.weekExcluded.${childId}`;
  const [weekOffset, setWeekOffset] = useState<number>(() => {
    try {
      const v = localStorage.getItem(offsetKey);
      const n = v ? parseInt(v, 10) : 0;
      return Number.isFinite(n) && n >= 0 && n < 52 ? n : 0;
    } catch { return 0; }
  });
  useEffect(() => {
    try { localStorage.setItem(offsetKey, String(weekOffset)); } catch {}
  }, [weekOffset, offsetKey]);
  const isOnline = useNetworkStatus();
  const [pickerOpen, setPickerOpen] = useState(false);
  // Days the user has manually excluded from the average (by date key yyyy-MM-dd).
  const [excludedMap, setExcludedMap] = useState<Record<string, string[]>>(() => {
    try {
      const v = localStorage.getItem(excludedKey);
      return v ? JSON.parse(v) : {};
    } catch { return {}; }
  });
  const weekKey = String(weekOffset);
  const excludedKeys = useMemo(
    () => new Set(excludedMap[weekKey] ?? []),
    [excludedMap, weekKey]
  );
  const setExcludedKeys = (updater: (prev: Set<string>) => Set<string>) => {
    setExcludedMap((prev) => {
      const next = { ...prev };
      const set = updater(new Set(next[weekKey] ?? []));
      if (set.size === 0) delete next[weekKey];
      else next[weekKey] = Array.from(set);
      try { localStorage.setItem(excludedKey, JSON.stringify(next)); } catch {}
      return next;
    });
  };

  const days = useMemo(() => {
    const arr: Date[] = [];
    const base = 1 + weekOffset * 7;
    for (let i = 0; i < 7; i++) arr.push(subDays(today, base + i));
    return arr.reverse();
  }, [today.getTime(), weekOffset]);

  const sinceDate = useMemo(() => subDays(days[0], 2), [days]);
  const untilDate = useMemo(() => addDays(days[days.length - 1], 2), [days]);

  const { data: sessions = [], isLoading: loadingWeek } = useQuery<SleepSession[]>({
    queryKey: ["analytics-week", childId, weekOffset],
    queryFn: async () => {
      try {
        const { data, error } = await supabase.from("sleep_sessions").select("*")
          .eq("child_id", childId)
          .gte("start_time", sinceDate.toISOString())
          .lt("start_time", untilDate.toISOString())
          .order("start_time");
        if (error) throw error;
        const rows = (data ?? []) as SleepSession[];
        await putSessions(rows);
        return rows;
      } catch (e) {
        if (!navigator.onLine) {
          const cached = await getSessions(childId, sinceDate, untilDate);
          const pending = await db.mutations.toArray();
          return projectSessionMutations(cached, pending);
        }
        devError("[WeekView] load failed", e);
        toast.error(t("common.loadFailed"));
        throw e;
      }
    },
    staleTime: 30_000,
    networkMode: "always",
    retry: false,
  });

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
      if (s.sleep_type !== "night" || splitByDate) {
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

      // Use the same calc functions as DayView so scores are computed identically.
      const nightSleep = calcDayNightSleep(sessions, d, splitByDate, night, now);
      const nightTimes = calcDayNightTimes(sessions, d, splitByDate, night);
      const totalDaySleep = calcTotalDaySleep(sessions, d, now);
      const totalSleep = nightSleep + totalDaySleep;
      const totalWake = calcTotalWake(sessions, d, now);
      const napsCount = calcNapsCount(sessions, d, now);

      const naps = completed.filter((e) => e.s.sleep_type === "day");
      const napDurations = naps.map((e) => Math.round((e.endMs - e.startMs) / 60000));

      const wws: number[] = [];
      for (let i = 1; i < completed.length; i++) {
        const diff = Math.round((completed[i].startMs - completed[i - 1].endMs) / 60000);
        if (diff >= 0 && diff < 12 * 60) wws.push(diff);
      }

      return { totalSleep, totalWake, nightSleep, nightTimes, totalDaySleep, napsCount, napDurations, wws };
    });
  }, [sessions, days, night, splitByDate]);

  const openHeatmap = () => {
    // Heatmap uses startOfWeek(anchor); pass any day from the displayed range
    // and let it snap to the locale-defined week. The user wants ALL data for
    // the visible week regardless of which day chips are deselected.
    navigate(`/heatmap?anchor=${format(days[0], "yyyy-MM-dd")}`);
  };

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
  const weekNightTimes = avgNightTimes(daysWithData.filter((d) => d.nightSleep > 0).map((d) => d.nightTimes));
  const avgDaySleep = avg(daysWithData.map((d) => d.totalDaySleep));

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

  // Per-day series for the comparison bar chart.
  const chartData: WeekCompareDayDatum[] = perDay.map((d, i) => {
    const wwArr = d.wws;
    const avgWW = wwArr.length ? Math.round(wwArr.reduce((a, b) => a + b, 0) / wwArr.length) : 0;
    return {
      dateKey: dayKey(days[i]),
      label: format(days[i], "EEEEEE", { locale }),
      nightSleep: d.nightSleep,
      daySleep: d.totalDaySleep,
      totalWake: d.totalWake,
      avgWW,
      napsCount: d.napsCount,
      active: activeFlags[i],
      hasData: dayHasData[i],
    };
  });

  const midDay = days[Math.floor(days.length / 2)];
  const norm = ageNorm(birthDate, midDay);

  const getWeekScore = () => {
    if (!norm || daysWithData.length === 0) return null;
    // Score = number of weekly-average metric cards that show a checkmark,
    // matching exactly the NormArrow checks visible in the UI below.
    const result = getScoreDetails(
      t,
      { totalSleep: avgTotalSleep, totalWake: avgTotalWake, nightSleep: avgNightSleep, daySleep: avgDaySleep, avgWW, napsCount: avgNapsCount },
      norm,
    );
    return { score: result.score, total: result.total, failed: result.failed };
  };

  const weekScore = getWeekScore();

  return (
    <div className="space-y-3">
      {picker}
      {!isOnline && (
        <div className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground py-0.5">
          <WifiOff className="w-3 h-3" />
          {t("common.cachedData")}
        </div>
      )}
      <DayChips
        days={days}
        hasData={dayHasData}
        active={activeFlags}
        onToggle={toggleDay}
        t={t}
      />
      <Button type="button" variant="outline" className="w-full gap-2" onClick={openHeatmap}>
        <Grid3x3 className="w-4 h-4" />
        {t("analytics.heatmapTitle")}
      </Button>

      {daysWithData.length === 0 ? (
        <Card className="p-6 text-center text-muted-foreground">{t("analytics.noData")}</Card>
      ) : (
      <>

      {weekScore && (
        <Card className="p-4 shadow-card border-border/50">
          <div className="flex items-end gap-3 mb-3">
            <div className="flex-1">
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary transition-all"
                  style={{ width: `${(weekScore.score / weekScore.total) * 100}%` }}
                />
              </div>
            </div>
            <div className="text-sm font-semibold text-primary whitespace-nowrap">
              {weekScore.score}/{weekScore.total}
            </div>
          </div>
          {weekScore.failed.length > 0 ? (
            <div className="text-xs text-muted-foreground">
              <div className="mb-1.5 font-medium">{t("analytics.needsAttention")}:</div>
              <div className="space-y-0.5">
                {weekScore.failed.map((item) => (
                  <div key={item.key}>• {item.label}</div>
                ))}
              </div>
            </div>
          ) : (
            <div className="text-xs text-[hsl(var(--ww-good))] flex items-center gap-1.5 font-medium">
              <Check className="w-3.5 h-3.5" />
              {t("analytics.allGoodWeek")}
            </div>
          )}
        </Card>
      )}

      <Card className="p-5 shadow-card border-border/50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 text-muted-foreground text-sm">
            <span className="w-9 h-9 rounded-full bg-primary/10 text-primary flex items-center justify-center">
              <Moon className="w-5 h-5" />
            </span>
            {t("analytics.totalSleep")}
          </div>
          <div className="text-right">
            <div className="font-display text-2xl font-semibold flex items-center gap-1.5 justify-end">
              {formatDuration(avgTotalSleep)}
              <NormArrow value={avgTotalSleep} norm={norm?.totalSleep} />
            </div>
            <div className="text-xs text-muted-foreground">{t("analytics.avgPerDay")}</div>
          </div>
        </div>
        <WeekStackedSleepChart
          data={chartData}
          normTotal={norm?.totalSleep}
          avgTotal={avgTotalSleep}
          nightLabel={t("analytics.nightSleep")}
          dayLabel={t("analytics.totalDaySleep")}
          fmtDur={formatDuration}
          onSelectDay={onSelectDay}
        />
        {norm && <p className="text-xs text-muted-foreground mt-2">{normLabel(t, avgTotalSleep, norm.totalSleep)}</p>}
      </Card>

      <Card className="p-5 shadow-card border-border/50">
        <div className="flex items-center gap-3 text-muted-foreground text-sm mb-1">
          <span className="w-9 h-9 rounded-full bg-primary/10 text-primary flex items-center justify-center"><Moon className="w-5 h-5" /></span>
          {t("analytics.nightSleep")}
        </div>
        <div className="font-display text-3xl font-semibold mt-2 flex items-center gap-2">
          {avgNightSleep ? formatDuration(avgNightSleep) : "—"}
          <NormArrow value={avgNightSleep} norm={norm?.nightSleep} />
        </div>
        <div className={`text-xs text-muted-foreground mt-1${avgNightSleep > 0 ? " mb-3" : ""}`}>
          {t("analytics.avgPerDay")}
        </div>
        {avgNightSleep > 0 && (
          <SubGrid>
            <SubItem label={t("analytics.bedtime")} value={weekNightTimes.avgBedtime ? fmtTime(weekNightTimes.avgBedtime) : "—"} />
            <SubItem label={t("analytics.wakeup")} value={weekNightTimes.avgWakeup ? fmtTime(weekNightTimes.avgWakeup) : "—"} />
          </SubGrid>
        )}
        {norm && avgNightSleep > 0 && (
          <p className="text-xs text-muted-foreground mt-2">{normLabel(t, avgNightSleep, norm.nightSleep)}</p>
        )}
      </Card>

      <Stat icon={<Sun className="w-5 h-5" />} label={t("analytics.totalWake")}
        value={formatDuration(avgTotalWake)} sub={t("analytics.avgPerDay")}
        secondary={norm ? normLabel(t, avgTotalWake, norm.totalWake) : undefined}
        arrow={<NormArrow value={avgTotalWake} norm={norm?.totalWake} />} />

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

      <Stat icon={<Sun className="w-5 h-5" />} label={t("analytics.totalDaySleep")}
        value={formatDuration(avgDaySleep)} sub={t("analytics.avgPerDay")}
        secondary={norm ? normLabel(t, avgDaySleep, norm.daySleep) : undefined}
        arrow={<NormArrow value={avgDaySleep} norm={norm?.daySleep} />} />

      <Card className="p-5 shadow-card border-border/50">
        <Header icon={<Clock className="w-5 h-5" />} label={t("analytics.napsCountScore")}
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
    <div className="flex flex-col gap-2">
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
    </div>
  );
}

function ageNorm(birthDate: string | null, at: Date) {
  if (!birthDate) return null;
  const months = ageInMonthsAt(birthDate, at);
  if (months === null) return null;
  const ww = wakeWindowForAge(months);
  const norms = getSleepNorms(months);
  return { ...norms, ww };
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
