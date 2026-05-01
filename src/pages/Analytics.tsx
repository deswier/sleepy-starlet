import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Moon, Sun, Activity, Clock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useChildren } from "@/contexts/ChildContext";
import { useTranslation } from "react-i18next";
import {
  formatDuration, sessionDuration, wakeWindowMinutes, SleepSession,
} from "@/lib/sleep-utils";
import {
  format, isSameDay, startOfDay, subDays, eachDayOfInterval,
} from "date-fns";

export default function Analytics() {
  const { activeChild } = useChildren();
  const { t } = useTranslation();
  const [sessions, setSessions] = useState<SleepSession[]>([]);

  useEffect(() => {
    if (!activeChild) return;
    (async () => {
      const since = subDays(new Date(), 60).toISOString();
      const { data } = await supabase
        .from("sleep_sessions").select("*")
        .eq("child_id", activeChild.id).gte("start_time", since)
        .not("end_time", "is", null).order("start_time");
      setSessions((data ?? []) as SleepSession[]);
    })();
  }, [activeChild]);

  if (!activeChild) return <div className="px-4 text-center text-muted-foreground mt-12">{t("sleep.noChildSelected")}</div>;

  return (
    <section className="px-4 max-w-md mx-auto w-full pb-4">
      <h2 className="font-display text-2xl font-semibold my-4">{t("analytics.title")}</h2>
      <Tabs defaultValue="day">
        <TabsList className="grid grid-cols-3 w-full mb-4">
          <TabsTrigger value="day">{t("analytics.daily")}</TabsTrigger>
          <TabsTrigger value="week">{t("analytics.weekly")}</TabsTrigger>
          <TabsTrigger value="month">{t("analytics.monthly")}</TabsTrigger>
        </TabsList>
        <TabsContent value="day"><DayView sessions={sessions} /></TabsContent>
        <TabsContent value="week"><RangeView sessions={sessions} days={7} /></TabsContent>
        <TabsContent value="month"><RangeView sessions={sessions} days={30} /></TabsContent>
      </Tabs>
    </section>
  );
}

function DayView({ sessions }: { sessions: SleepSession[] }) {
  const { t } = useTranslation();
  const today = new Date();
  const todays = sessions.filter((s) => isSameDay(new Date(s.start_time), today));
  if (todays.length === 0) return <Card className="p-6 text-center text-muted-foreground">{t("analytics.noData")}</Card>;
  const total = todays.reduce((a, s) => a + sessionDuration(s), 0);
  const longest = Math.max(...todays.map((s) => sessionDuration(s)));
  const wws: number[] = [];
  for (let i = 1; i < todays.length; i++) {
    const w = wakeWindowMinutes(todays[i - 1], todays[i]);
    if (w !== null && w >= 0 && w < 600) wws.push(w);
  }
  const avgWW = wws.length ? Math.round(wws.reduce((a, b) => a + b, 0) / wws.length) : 0;

  return (
    <div className="grid grid-cols-1 gap-3">
      <Stat icon={<Moon className="w-5 h-5" />} label={t("analytics.totalSleep")} value={formatDuration(total)} sub={`${todays.length} ${t("analytics.sleepsRecorded").toLowerCase()}`} />
      <Stat icon={<Clock className="w-5 h-5" />} label={t("analytics.longestStretch")} value={formatDuration(longest)} />
      <Stat icon={<Activity className="w-5 h-5" />} label={t("analytics.avgWW")} value={avgWW ? formatDuration(avgWW) : "—"} sub={t("analytics.measured", { count: wws.length })} />
    </div>
  );
}

function RangeView({ sessions, days }: { sessions: SleepSession[]; days: number }) {
  const { t, i18n } = useTranslation();
  const data = useMemo(() => {
    const start = subDays(new Date(), days - 1);
    const range = eachDayOfInterval({ start, end: new Date() });
    return range.map((d) => {
      const day = startOfDay(d);
      const sleeps = sessions.filter((s) => isSameDay(new Date(s.start_time), day));
      const total = sleeps.reduce((a, s) => a + sessionDuration(s), 0);
      const dayMin = sleeps.filter((s) => s.sleep_type === "day").reduce((a, s) => a + sessionDuration(s), 0);
      const nightMin = total - dayMin;
      return { date: day, total, dayMin, nightMin, count: sleeps.length };
    });
  }, [sessions, days]);

  const totalAll = data.reduce((a, x) => a + x.total, 0);
  const daysWithData = data.filter((x) => x.total > 0).length || 1;
  const avg = Math.round(totalAll / daysWithData);
  const max = Math.max(1, ...data.map((x) => x.total));

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <Stat icon={<Moon className="w-5 h-5" />} label={t("analytics.totalSleep")} value={formatDuration(totalAll)} sub={t("analytics.perDayAvg", { value: formatDuration(avg) })} />
        <Stat icon={<Sun className="w-5 h-5" />} label={t("analytics.dayNight")} value={`${pct(data.reduce((a, x) => a + x.dayMin, 0), totalAll)}% / ${pct(data.reduce((a, x) => a + x.nightMin, 0), totalAll)}%`} sub={`${t("analytics.dayMin")} / ${t("analytics.nightMin")}`} />
      </div>
      <Card className="p-4 shadow-card">
        <div className="text-xs text-muted-foreground mb-3">{t("analytics.totalSleep")}</div>
        <div className="flex items-end gap-1.5 h-32">
          {data.map((d, i) => {
            const h = max ? Math.max(2, Math.round((d.total / max) * 100)) : 0;
            const dayPart = d.total ? Math.round((d.dayMin / d.total) * h) : 0;
            return (
              <div key={i} className="flex-1 flex flex-col-reverse gap-px" title={`${format(d.date, "dd.MM")}: ${formatDuration(d.total)}`}>
                <div className="bg-primary/70 rounded-b-sm" style={{ height: `${h - dayPart}%` }} />
                <div className="bg-accent rounded-t-sm" style={{ height: `${dayPart}%` }} />
              </div>
            );
          })}
        </div>
        <div className="flex justify-between text-[10px] text-muted-foreground mt-2">
          <span>{format(data[0]?.date ?? new Date(), "dd.MM")}</span>
          <span>{format(data[data.length - 1]?.date ?? new Date(), "dd.MM")}</span>
        </div>
        <div className="flex gap-3 text-[11px] text-muted-foreground mt-2">
          <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-accent" /> {t("analytics.dayMin")}</span>
          <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-primary/70" /> {t("analytics.nightMin")}</span>
        </div>
      </Card>
      {days >= 30 && (
        <Card className="p-4 shadow-card">
          <div className="text-xs text-muted-foreground">{t("analytics.rolling7")}</div>
          <div className="font-display text-2xl font-semibold">{formatDuration(rolling(data, 7))}</div>
        </Card>
      )}
    </div>
  );
  function pct(n: number, d: number) { return d ? Math.round((n / d) * 100) : 0; }
}

function rolling(data: { total: number }[], window: number) {
  const tail = data.slice(-window);
  const days = tail.filter((x) => x.total > 0).length || 1;
  return Math.round(tail.reduce((a, x) => a + x.total, 0) / days);
}

function Stat({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string; sub?: string }) {
  return (
    <Card className="p-5 shadow-card border-border/50">
      <div className="flex items-center gap-3 text-muted-foreground text-sm mb-1">
        <span className="w-9 h-9 rounded-full bg-primary/10 text-primary flex items-center justify-center">{icon}</span>
        {label}
      </div>
      <div className="font-display text-3xl font-semibold mt-2">{value}</div>
      {sub && <div className="text-xs text-muted-foreground mt-1">{sub}</div>}
    </Card>
  );
}
