import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useChildren } from "@/contexts/ChildContext";
import {
  formatDuration, formatTime, sessionDuration, wakeWindowMinutes,
  wwStatus, groupByDay, SleepSession,
  wwThresholdsAt,
} from "@/lib/sleep-utils";
import { format, isToday, isYesterday } from "date-fns";
import SleepForm from "@/components/sleep/SleepForm";
import SleepDetail from "@/components/sleep/SleepDetail";

export default function History() {
  const { activeChild } = useChildren();
  const [sessions, setSessions] = useState<SleepSession[]>([]);
  const [open, setOpen] = useState<SleepSession | null>(null);
  const [showAdd, setShowAdd] = useState(false);

  const load = async () => {
    if (!activeChild) return;
    const { data } = await supabase
      .from("sleep_sessions").select("*")
      .eq("child_id", activeChild.id)
      .not("end_time", "is", null)
      .order("start_time", { ascending: false })
      .limit(200);
    setSessions((data ?? []) as SleepSession[]);
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
            birthDate={activeChild.birth_date} onOpen={setOpen} />
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

function DayGroup({ date, sessions, birthDate, onOpen }: {
  date: Date; sessions: SleepSession[];
  birthDate: string | null;
  onOpen: (s: SleepSession) => void;
}) {
  // sessions are desc; reverse for chronological display
  const ordered = [...sessions].reverse();
  const totalMin = ordered.reduce((acc, s) => acc + sessionDuration(s), 0);

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
          let status: "good" | "warn" | null = null;
          if (ww !== null) {
            const th = wwThresholdsAt(new Date(s.start_time), birthDate);
            if (th) status = wwStatus(ww, th.min, th.max);
          }
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

        <div className="border-t border-border mt-3 pt-3 flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Total sleep</span>
          <span className="font-display text-lg font-semibold">{formatDuration(totalMin)}</span>
        </div>
      </Card>
    </div>
  );
}

