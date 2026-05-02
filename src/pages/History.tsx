import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useChildren } from "@/contexts/ChildContext";
import { useTranslation } from "react-i18next";
import {
  formatDuration, formatTime, sessionDuration, wakeWindowMinutes,
  wwStatus, SleepSession, wwThresholdsAt, fmtWeekday,
} from "@/lib/sleep-utils";
import { isToday, isYesterday, startOfDay } from "date-fns";
import { useChildRole, canCreateSleep } from "@/hooks/useChildRole";
import SleepForm from "@/components/sleep/SleepForm";
import SleepDetail from "@/components/sleep/SleepDetail";

export default function History() {
  const { activeChild } = useChildren();
  const { t } = useTranslation();
  const { role } = useChildRole();
  const [sessions, setSessions] = useState<SleepSession[]>([]);
  const [splitByDate, setSplitByDate] = useState(false);
  const [open, setOpen] = useState<SleepSession | null>(null);
  const [showAdd, setShowAdd] = useState(false);

  const load = async () => {
    if (!activeChild) return;
    const [s, cs] = await Promise.all([
      supabase.from("sleep_sessions").select("*").eq("child_id", activeChild.id)
        .not("end_time", "is", null).order("start_time", { ascending: false }).limit(200),
      supabase.from("child_settings").select("split_night_sleep_by_date").eq("child_id", activeChild.id).single(),
    ]);
    setSessions((s.data ?? []) as SleepSession[]);
    setSplitByDate(!!cs.data?.split_night_sleep_by_date);
  };
  useEffect(() => { load(); }, [activeChild]);

  useEffect(() => {
    if (!activeChild) return;
    const ch = supabase
      .channel(`history-${activeChild.id}`)
      .on("postgres_changes",
        { event: "*", schema: "public", table: "sleep_sessions", filter: `child_id=eq.${activeChild.id}` },
        () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [activeChild?.id]);

  if (!activeChild) return <div className="px-4 text-center text-muted-foreground mt-12">{t("sleep.noChildSelected")}</div>;

  const groups = groupSessions(sessions, splitByDate);

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
            <SleepForm mode="manual" onDone={() => { setShowAdd(false); load(); }} />
          </DialogContent>
        </Dialog>}
      </div>

      {groups.length === 0 && (
        <Card className="p-8 text-center text-muted-foreground shadow-card">{t("sleep.noHistory")}</Card>
      )}

      <div className="space-y-6">
        {groups.map((g) => (
          <DayGroup key={g.date.toISOString()} date={g.date} sessions={g.sessions}
            birthDate={activeChild.birth_date} onOpen={setOpen} />
        ))}
      </div>

      {open && <SleepDetail session={open} onClose={() => setOpen(null)} onChange={load} />}
    </section>
  );
}

interface DayBucket { date: Date; sessions: SleepSession[] }

function groupSessions(sessions: SleepSession[], splitByDate: boolean): DayBucket[] {
  // sessions are desc; for each session, decide its bucket date.
  const buckets = new Map<string, DayBucket>();
  for (const s of sessions) {
    let d = startOfDay(new Date(s.start_time));
    if (!splitByDate && s.sleep_type === "night") {
      // Night sleeps that begin in the evening (e.g. 19:50) and end the next
      // morning are attributed to the END day, so a sleep 01.02 19:50 → 02.02
      // 09:50 is shown under 02.02. Sleeps that begin after midnight stay on
      // their start date (also the end date in normal cases).
      const startedHour = new Date(s.start_time).getHours();
      if (startedHour >= 12 && s.end_time) {
        d = startOfDay(new Date(s.end_time));
      }
    }
    const key = d.toISOString();
    if (!buckets.has(key)) buckets.set(key, { date: d, sessions: [] });
    buckets.get(key)!.sessions.push(s);
  }
  return Array.from(buckets.values()).sort((a, b) => b.date.getTime() - a.date.getTime());
}

function dayLabel(d: Date, t: (k: string) => string) {
  if (isToday(d)) return t("common.today");
  if (isYesterday(d)) return t("common.yesterday");
  return fmtWeekday(d);
}

function DayGroup({ date, sessions, birthDate, onOpen }: {
  date: Date; sessions: SleepSession[];
  birthDate: string | null;
  onOpen: (s: SleepSession) => void;
}) {
  const { t } = useTranslation();
  // Sessions arrive in DESC order (latest first) — display them that way.
  const ordered = sessions;
  const totalMin = ordered.reduce((acc, s) => acc + sessionDuration(s), 0);

  return (
    <div>
      <div className="flex items-baseline justify-between mb-3">
        <h3 className="font-display text-lg font-semibold">{dayLabel(date, t)}</h3>
        <span className="text-xs text-muted-foreground">{t("sleep.sleepsCount", { count: ordered.length })}</span>
      </div>

      <Card className="p-5 shadow-card border-border/50">
        {ordered.map((s, i) => {
          // Chronologically earlier sleep is the next row in DESC display.
          const earlier = i + 1 < ordered.length ? ordered[i + 1] : null;
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
                </div>
                <span className="text-muted-foreground text-sm">{formatDuration(sessionDuration(s))}</span>
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

        <div className="border-t border-border mt-3 pt-3 flex items-center justify-between">
          <span className="text-sm text-muted-foreground">{t("sleep.totalSleep")}</span>
          <span className="font-display text-lg font-semibold">{formatDuration(totalMin)}</span>
        </div>
      </Card>
    </div>
  );
}
