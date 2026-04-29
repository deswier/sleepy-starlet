import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ChevronDown, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useChildren } from "@/contexts/ChildContext";
import { formatDuration, formatTime, sessionDuration, wakeWindowMinutes, wwStatus, groupByDay, SleepSession } from "@/lib/sleep-utils";
import { format, isSameDay, isToday, isYesterday } from "date-fns";
import SleepForm from "@/components/sleep/SleepForm";
import SleepDetail from "@/components/sleep/SleepDetail";

export default function History() {
  const { activeChild } = useChildren();
  const [sessions, setSessions] = useState<SleepSession[]>([]);
  const [settings, setSettings] = useState<{ min_wake_window_minutes: number; max_wake_window_minutes: number } | null>(null);
  const [open, setOpen] = useState<SleepSession | null>(null);
  const [showAdd, setShowAdd] = useState(false);

  const load = async () => {
    if (!activeChild) return;
    const [s, set] = await Promise.all([
      supabase.from("sleep_sessions").select("*").eq("child_id", activeChild.id).not("end_time", "is", null).order("start_time", { ascending: false }).limit(200),
      supabase.from("child_settings").select("min_wake_window_minutes,max_wake_window_minutes").eq("child_id", activeChild.id).single(),
    ]);
    setSessions((s.data ?? []) as SleepSession[]);
    if (set.data) setSettings(set.data);
  };

  useEffect(() => { load(); }, [activeChild]);

  if (!activeChild) return <div className="px-4 text-center text-muted-foreground mt-12">No child selected</div>;

  const groups = groupByDay(sessions);

  return (
    <section className="px-4 max-w-md mx-auto w-full pb-4">
      <div className="flex items-center justify-between my-4">
        <h2 className="font-display text-2xl font-semibold">History</h2>
        <Dialog open={showAdd} onOpenChange={setShowAdd}>
          <DialogTrigger asChild>
            <Button variant="outline" size="sm"><Plus className="w-4 h-4 mr-1" /> Add</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Add past sleep</DialogTitle></DialogHeader>
            <SleepForm mode="manual" onDone={() => { setShowAdd(false); load(); }} />
          </DialogContent>
        </Dialog>
      </div>

      {groups.length === 0 && (
        <Card className="p-8 text-center text-muted-foreground shadow-card">
          No sleep recorded yet.
        </Card>
      )}

      <div className="space-y-6">
        {groups.map((g) => (
          <DayGroup key={g.date.toISOString()} date={g.date} sessions={g.sessions}
            settings={settings} onOpen={setOpen} />
        ))}
      </div>

      {open && <SleepDetail session={open} onClose={() => setOpen(null)} onChange={load} />}
    </section>
  );
}

function dayLabel(d: Date) {
  if (isToday(d)) return "Today";
  if (isYesterday(d)) return "Yesterday";
  return format(d, "EEEE, MMMM d");
}

function DayGroup({ date, sessions, settings, onOpen }: {
  date: Date; sessions: SleepSession[];
  settings: { min_wake_window_minutes: number; max_wake_window_minutes: number } | null;
  onOpen: (s: SleepSession) => void;
}) {
  // sessions are desc; reverse for chronological display
  const ordered = [...sessions].reverse();
  const totalMin = ordered.reduce((acc, s) => acc + sessionDuration(s), 0);
  const wws: number[] = [];
  for (let i = 1; i < ordered.length; i++) {
    const w = wakeWindowMinutes(ordered[i - 1], ordered[i]);
    if (w !== null && w >= 0 && isSameDay(new Date(ordered[i - 1].end_time!), new Date(ordered[i].start_time)))
      wws.push(w);
  }
  const avg = wws.length ? Math.round(wws.reduce((a, b) => a + b, 0) / wws.length) : null;
  const mn = wws.length ? Math.min(...wws) : null;
  const mx = wws.length ? Math.max(...wws) : null;

  return (
    <div>
      <div className="flex items-baseline justify-between mb-3">
        <h3 className="font-display text-lg font-semibold">{dayLabel(date)}</h3>
        <span className="text-xs text-muted-foreground">{ordered.length} sleeps</span>
      </div>

      <Card className="p-5 shadow-card border-border/50">
        {ordered.map((s, i) => {
          const prev = i > 0 ? ordered[i - 1] : null;
          const ww = prev ? wakeWindowMinutes(prev, s) : null;
          const status = ww !== null && settings ? wwStatus(ww, settings.min_wake_window_minutes, settings.max_wake_window_minutes) : null;
          return (
            <div key={s.id}>
              {prev && ww !== null && ww >= 0 && (
                <div className="flex items-center gap-3 py-2 pl-2">
                  <div className={`w-0.5 h-8 rounded-full ${status === "good" ? "bg-ww-good" : "bg-ww-warn"}`} />
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${status === "good" ? "bg-ww-good-soft text-[hsl(var(--ww-good))]" : "bg-ww-warn-soft text-[hsl(var(--ww-warn))]"}`}>
                    {formatDuration(ww)} awake
                  </span>
                </div>
              )}
              <button onClick={() => onOpen(s)} className="w-full text-left flex items-center justify-between py-3 hover:bg-muted/40 -mx-2 px-2 rounded-lg transition-smooth">
                <div className="flex items-center gap-3">
                  <span className={`w-2 h-2 rounded-full ${s.sleep_type === "night" ? "bg-primary" : "bg-accent"}`} />
                  <span className="font-medium">{formatTime(s.start_time)}</span>
                </div>
                <span className="text-muted-foreground text-sm">{formatDuration(sessionDuration(s))}</span>
              </button>
            </div>
          );
        })}

        <div className="border-t border-border mt-3 pt-3">
          <Collapsible>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Total sleep</span>
              <span className="font-display text-lg font-semibold">{formatDuration(totalMin)}</span>
            </div>
            <CollapsibleTrigger className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mt-2">
              <ChevronDown className="w-3.5 h-3.5" /> More
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-2 space-y-1 text-sm">
              <Row label="Sleeps" value={String(ordered.length)} />
              {avg !== null && <Row label="Average wake window" value={formatDuration(avg)} />}
              {mn !== null && <Row label="Min wake window" value={formatDuration(mn)} />}
              {mx !== null && <Row label="Max wake window" value={formatDuration(mx)} />}
            </CollapsibleContent>
          </Collapsible>
        </div>
      </Card>
    </div>
  );
}

const Row = ({ label, value }: { label: string; value: string }) => (
  <div className="flex justify-between"><span className="text-muted-foreground">{label}</span><span className="font-medium">{value}</span></div>
);
