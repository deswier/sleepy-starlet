import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Moon, Activity } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useChildren } from "@/contexts/ChildContext";
import { formatDuration, sessionDuration, wakeWindowMinutes, SleepSession } from "@/lib/sleep-utils";
import { isSameDay, subDays } from "date-fns";

export default function Analytics() {
  const { activeChild } = useChildren();
  const [sessions, setSessions] = useState<SleepSession[]>([]);
  const [days, setDays] = useState<7 | 30>(7);

  useEffect(() => {
    if (!activeChild) return;
    (async () => {
      const since = subDays(new Date(), days).toISOString();
      const { data } = await supabase
        .from("sleep_sessions").select("*")
        .eq("child_id", activeChild.id).gte("start_time", since)
        .not("end_time", "is", null).order("start_time");
      setSessions((data ?? []) as SleepSession[]);
    })();
  }, [activeChild, days]);

  if (!activeChild) return <div className="px-4 text-center text-muted-foreground mt-12">No child selected</div>;

  const totalMin = sessions.reduce((a, s) => a + sessionDuration(s), 0);
  const dayCount = new Set(sessions.map((s) => new Date(s.start_time).toDateString())).size || 1;
  const avgPerDay = Math.round(totalMin / dayCount);

  const wws: number[] = [];
  for (let i = 1; i < sessions.length; i++) {
    const w = wakeWindowMinutes(sessions[i - 1], sessions[i]);
    if (w !== null && w >= 0 && w < 600 && isSameDay(new Date(sessions[i - 1].end_time!), new Date(sessions[i].start_time)))
      wws.push(w);
  }
  const avgWW = wws.length ? Math.round(wws.reduce((a, b) => a + b, 0) / wws.length) : 0;

  return (
    <section className="px-4 max-w-md mx-auto w-full pb-4">
      <h2 className="font-display text-2xl font-semibold my-4">Analytics</h2>
      <div className="flex gap-2 mb-4 text-sm">
        {[7, 30].map((d) => (
          <button key={d} onClick={() => setDays(d as 7 | 30)}
            className={`px-3 py-1.5 rounded-full transition-smooth ${days === d ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/70"}`}>
            Last {d} days
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-3">
        <Stat icon={<Moon className="w-5 h-5" />} label="Total sleep" value={formatDuration(totalMin)} sub={`${formatDuration(avgPerDay)} / day average`} />
        <Stat icon={<Activity className="w-5 h-5" />} label="Average wake window" value={avgWW ? formatDuration(avgWW) : "—"} sub={`${wws.length} measured`} />
      </div>
    </section>
  );
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
