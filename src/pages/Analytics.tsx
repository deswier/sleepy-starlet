import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Moon, Sun, Activity, Clock, Grid3x3, ChevronLeft, ChevronRight, ArrowUpRight, ArrowDownRight, Check } from "lucide-react";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useChildren } from "@/contexts/ChildContext";
import { useTranslation } from "react-i18next";
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
  // If session started in the evening (>= night start, before midnight) and
  // it actually ends past midnight (or is still ongoing), bucket to end day.
  if (startMin >= nsMin && startMin >= 12 * 60) {
    const end = s.end_time ? new Date(s.end_time) : new Date();
    if (!isSameDay(start, end)) return startOfDay(end);
  }
  return startOfDay(start);
}

// Minutes a sleep session contributes to its bucketed day (full duration).
function sleepMinutesOnDay(
  s: SleepSession,
  day: Date,
  now: Date,
  night: NightWindow = DEFAULT_NIGHT,
): number {
  if (!isSameDay(sessionDay(s, night), day)) return 0;
  const start = new Date(s.start_time);
  const end = s.end_time ? new Date(s.end_time) : now;
  return Math.max(0, Math.round((end.getTime() - start.getTime()) / 60000));
}

// Continuous night-sleep duration for a date: longest night session that
// belongs to this date (per sessionDay rules above).
function nightSleepForDate(
  sessions: SleepSession[],
  day: Date,
  night: NightWindow = DEFAULT_NIGHT,
): number {
  let best = 0;
  for (const s of sessions) {
    if (s.sleep_type !== "night" || !s.end_time) continue;
    if (!isSameDay(sessionDay(s, night), day)) continue;
    const ss = new Date(s.start_time).getTime();
    const ee = new Date(s.end_time).getTime();
    best = Math.max(best, Math.round((ee - ss) / 60000));
  }
  return best;
}

export default function Analytics() {
  const navigate = useNavigate();
  const { activeChild } = useChildren();
  const { t } = useTranslation();
  const [sessions, setSessions] = useState<SleepSession[]>([]);
  const [night, setNight] = useState<NightWindow>(DEFAULT_NIGHT);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!activeChild) return;
    setLoading(true);
    (async () => {
      const since = subDays(new Date(), 60).toISOString();
      const [{ data }, { data: cs }] = await Promise.all([
        supabase.from("sleep_sessions").select("*")
          .eq("child_id", activeChild.id).gte("start_time", since)
          .order("start_time"),
        supabase.from("child_settings")
          .select("night_start_time,night_end_time")
          .eq("child_id", activeChild.id).single(),
      ]);
      setSessions((data ?? []) as SleepSession[]);
      if (cs) setNight({
        start: (cs.night_start_time as string)?.slice(0, 5) ?? DEFAULT_NIGHT.start,
        end: (cs.night_end_time as string)?.slice(0, 5) ?? DEFAULT_NIGHT.end,
      });
      setLoading(false);
    })();
  }, [activeChild]);

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
        <TabsContent value="day"><DayView sessions={sessions} birthDate={activeChild.birth_date} night={night} /></TabsContent>
        <TabsContent value="week"><WeekView sessions={sessions} birthDate={activeChild.birth_date} night={night} /></TabsContent>
      </Tabs>
      )}
    </section>
  );
}

// ---------- DAY ----------
function DayView({ sessions, birthDate, night }: { sessions: SleepSession[]; birthDate: string | null; night: NightWindow }) {
  const { t } = useTranslation();
  const [day, setDay] = useState<Date>(startOfDay(new Date()));
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

  const totalSleep = sessions.reduce((a, s) => a + sleepMinutesOnDay(s, day, now, night), 0);
  const totalWake = Math.max(0, dayElapsedMin - totalSleep);
  const nightSleep = nightSleepForDate(sessions, day, night);

  const naps = startedToday.filter((s) => s.sleep_type === "day" && s.end_time);
  const napDurations = naps.map((s) => sessionDuration(s, now));
  const napsCount = naps.length;
  const avgNap = napsCount ? Math.round(napDurations.reduce((a, b) => a + b, 0) / napsCount) : 0;
  const minNap = napsCount ? Math.min(...napDurations) : 0;
  const maxNap = napsCount ? Math.max(...napDurations) : 0;

  // Wake windows between consecutive sleeps that started today.
  const wws: number[] = [];
  for (let i = 1; i < startedToday.length; i++) {
    const prev = startedToday[i - 1];
    if (!prev.end_time) continue;
    const d = differenceInMinutes(new Date(startedToday[i].start_time), new Date(prev.end_time));
    if (d >= 0 && d < 12 * 60) wws.push(d);
  }
  // Today only: include the in-progress wake window (since the last
  // completed sleep ended) up to "now". Future WW time is never counted.
  if (isCurrentDay && startedToday.length > 0) {
    const last = startedToday[startedToday.length - 1];
    if (last.end_time) {
      const elapsed = differenceInMinutes(now, new Date(last.end_time));
      if (elapsed > 0 && elapsed < 12 * 60) wws.push(elapsed);
    }
  }
  const avgWW = wws.length ? Math.round(wws.reduce((a, b) => a + b, 0) / wws.length) : 0;
  const minWW = wws.length ? Math.min(...wws) : 0;
  const maxWW = wws.length ? Math.max(...wws) : 0;

  const norm = ageNorm(birthDate, day);

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
function WeekView({ sessions, birthDate, night }: { sessions: SleepSession[]; birthDate: string | null; night: NightWindow }) {
  const { t } = useTranslation();
  const now = new Date();
  const today = startOfDay(now);

  // Last 7 fully-completed days: yesterday .. yesterday-6. Today excluded.
  const days = useMemo(() => {
    const arr: Date[] = [];
    for (let i = 1; i <= 7; i++) arr.push(subDays(today, i));
    return arr.reverse();
  }, [today.getTime()]);

  const perDay = days.map((d) => {
    const startedThat = sessions.filter((s) => isSameDay(sessionDay(s, night), d) && s.end_time)
      .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());
    const totalSleep = sessions.reduce((a, s) => a + sleepMinutesOnDay(s, d, now, night), 0);
    const totalWake = Math.max(0, 24 * 60 - totalSleep);
    const nightSleep = nightSleepForDate(sessions, d, night);
    const naps = startedThat.filter((s) => s.sleep_type === "day");
    const napDurations = naps.map((s) => sessionDuration(s, now));
    const wws: number[] = [];
    for (let i = 1; i < startedThat.length; i++) {
      const prev = startedThat[i - 1];
      if (!prev.end_time) continue;
      const diff = differenceInMinutes(new Date(startedThat[i].start_time), new Date(prev.end_time));
      if (diff >= 0 && diff < 12 * 60) wws.push(diff);
    }
    return { totalSleep, totalWake, nightSleep, napsCount: naps.length, napDurations, wws };
  });

  const withData = perDay.filter((d) => d.totalSleep > 0 || d.napsCount > 0);
  if (withData.length === 0) {
    return (
      <Card className="p-6 text-center text-muted-foreground">{t("analytics.noData")}</Card>
    );
  }

  const avg = (arr: number[]) => arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : 0;

  const avgTotalSleep = avg(perDay.map((d) => d.totalSleep));
  const avgTotalWake = avg(perDay.map((d) => d.totalWake));
  const avgNightSleep = avg(perDay.filter((d) => d.nightSleep > 0).map((d) => d.nightSleep));

  const allWWs = perDay.flatMap((d) => d.wws);
  const avgWW = avg(allWWs);
  const minWW = allWWs.length ? Math.min(...allWWs) : 0;
  const maxWW = allWWs.length ? Math.max(...allWWs) : 0;

  const napCounts = perDay.map((d) => d.napsCount);
  const avgNapsCount = Math.round((napCounts.reduce((a, b) => a + b, 0) / napCounts.length) * 10) / 10;
  const minNapsCount = Math.min(...napCounts);
  const maxNapsCount = Math.max(...napCounts);

  const allNapDur = perDay.flatMap((d) => d.napDurations);
  const avgNap = avg(allNapDur);
  const minNap = allNapDur.length ? Math.min(...allNapDur) : 0;
  const maxNap = allNapDur.length ? Math.max(...allNapDur) : 0;

  const midDay = days[Math.floor(days.length / 2)];
  const norm = ageNorm(birthDate, midDay);

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">{t("analytics.weekIgnoresToday")}</p>

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
    </div>
  );
}

// ---------- helpers ----------
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
  if (value >= norm.min && value <= norm.max) {
    return `${t("analytics.norm")}: ${formatRange(norm)} · ${t("analytics.withinNorm")}`;
  }
  if (value < norm.min) {
    return `${t("analytics.norm")}: ${formatRange(norm)} · ${t("analytics.below", { value: humanDelta(norm.min - value) })}`;
  }
  return `${t("analytics.norm")}: ${formatRange(norm)} · ${t("analytics.above", { value: humanDelta(value - norm.max) })}`;
}

function formatRange(n: { min: number; max: number }): string {
  // If looks like minutes (>= 30), render as duration; otherwise plain numbers (e.g., naps count).
  if (n.max >= 30) return `${formatDuration(n.min)}–${formatDuration(n.max)}`;
  return `${n.min}–${n.max}`;
}
function humanDelta(v: number): string {
  if (v >= 30) return formatDuration(Math.round(v));
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
