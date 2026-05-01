import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useChildren } from "@/contexts/ChildContext";
import { useTranslation } from "react-i18next";
import { SleepSession, formatDuration } from "@/lib/sleep-utils";
import { startOfDay, subDays, addDays, format } from "date-fns";

const DAYS = 30;
const HOURS = 24;
const SLOT_MIN = 30; // 30-minute resolution
const SLOTS_PER_HOUR = 60 / SLOT_MIN;
const SLOTS_PER_DAY = HOURS * SLOTS_PER_HOUR;

export default function Heatmap() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { activeChild } = useChildren();
  const [sessions, setSessions] = useState<SleepSession[]>([]);

  useEffect(() => {
    if (!activeChild) return;
    (async () => {
      const since = subDays(new Date(), DAYS + 2).toISOString();
      const { data } = await supabase
        .from("sleep_sessions").select("*")
        .eq("child_id", activeChild.id).gte("start_time", since)
        .order("start_time");
      setSessions((data ?? []) as SleepSession[]);
    })();
  }, [activeChild]);

  const days = useMemo(() => {
    const arr: Date[] = [];
    const today = startOfDay(new Date());
    for (let i = DAYS - 1; i >= 0; i--) arr.push(subDays(today, i));
    return arr;
  }, []);

  // grid[dayIndex][slotIndex] = minutes-of-sleep in that slot (0..SLOT_MIN)
  const grid = useMemo(() => {
    const now = new Date();
    const g: number[][] = days.map(() => new Array(SLOTS_PER_DAY).fill(0));
    for (const s of sessions) {
      const start = new Date(s.start_time).getTime();
      const end = (s.end_time ? new Date(s.end_time) : now).getTime();
      days.forEach((d, di) => {
        const dayStart = startOfDay(d).getTime();
        for (let slot = 0; slot < SLOTS_PER_DAY; slot++) {
          const slotStart = dayStart + slot * SLOT_MIN * 60000;
          const slotEnd = slotStart + SLOT_MIN * 60000;
          const lo = Math.max(start, slotStart);
          const hi = Math.min(end, slotEnd);
          if (hi > lo) g[di][slot] += Math.round((hi - lo) / 60000);
        }
      });
    }
    return g;
  }, [sessions, days]);

  const hourLabels = Array.from({ length: HOURS / 3 + 1 }, (_, i) => i * 3);

  if (!activeChild) {
    return <div className="px-4 text-center text-muted-foreground mt-12">{t("sleep.noChildSelected")}</div>;
  }

  return (
    <main className="min-h-screen bg-hero p-4">
      <div className="max-w-2xl mx-auto py-4">
        <Button variant="ghost" size="sm" onClick={() => navigate(-1)} className="mb-4">
          <ArrowLeft className="w-4 h-4 mr-1" /> {t("common.back")}
        </Button>
        <h1 className="font-display text-2xl font-semibold mb-2">{t("analytics.heatmapTitle")}</h1>
        <p className="text-xs text-muted-foreground mb-4">{t("analytics.heatmapHelp")}</p>

        <Card className="p-3 shadow-card overflow-x-auto">
          <div className="flex">
            {/* hour labels (Y axis, every 3h) */}
            <div className="flex flex-col justify-between text-[10px] text-muted-foreground pr-2 select-none"
                 style={{ height: SLOTS_PER_DAY * 6 }}>
              {hourLabels.map((h) => (
                <div key={h} className="leading-none">{String(h).padStart(2, "0")}:00</div>
              ))}
            </div>

            {/* grid: each day is a column (top = 00:00, bottom = 24:00) */}
            <div className="flex gap-[2px]">
              {grid.map((col, di) => (
                <div key={di} className="flex flex-col gap-px" title={format(days[di], "dd.MM")}>
                  {col.map((m, si) => {
                    const intensity = m / SLOT_MIN; // 0..1
                    const bg = intensity > 0
                      ? `hsl(var(--primary) / ${0.15 + intensity * 0.7})`
                      : "hsl(var(--muted))";
                    return <div key={si} className="w-3 h-[6px] rounded-[1px]" style={{ background: bg }} />;
                  })}
                </div>
              ))}
            </div>
          </div>

          {/* day labels */}
          <div className="flex gap-[2px] pl-[42px] mt-2 text-[9px] text-muted-foreground">
            {days.map((d, i) => (
              <div key={i} className="w-3 text-center">
                {i % 5 === 0 ? format(d, "dd") : ""}
              </div>
            ))}
          </div>
        </Card>
      </div>
    </main>
  );
}
