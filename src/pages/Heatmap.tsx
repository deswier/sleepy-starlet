import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ChevronLeft, ChevronRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useChildren } from "@/contexts/ChildContext";
import { useTranslation } from "react-i18next";
import { SleepSession } from "@/lib/sleep-utils";
import { startOfDay, addDays, subDays, format, startOfWeek } from "date-fns";
import { enUS, ru } from "date-fns/locale";
import i18n from "@/i18n";
import { iconForMethod } from "@/lib/method-icons";
import SleepDetail from "@/components/sleep/SleepDetail";

const HOURS = 24;
const ROW_PX = 22; // height per hour
const GRID_HEIGHT = HOURS * ROW_PX;
// Minimum vertical gap (in % of day) before two icons are considered overlapping
// and grouped into a cluster. ~14 minutes works well at ROW_PX=22.
const ICON_OVERLAP_PCT = 1.0;

type InterruptionLite = {
  id: string; sleep_session_id: string; start_time: string;
  settling_method_id: string | null; settling_method_name: string | null;
};

export default function Heatmap() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { activeChild } = useChildren();
  const [sessions, setSessions] = useState<SleepSession[]>([]);
  const [interruptions, setInterruptions] = useState<InterruptionLite[]>([]);
  const [openSession, setOpenSession] = useState<SleepSession | null>(null);
  // Anchor = a date inside the displayed week.
  const [anchor, setAnchor] = useState<Date>(startOfDay(new Date()));

  const locale = i18n.language?.startsWith("ru") ? ru : enUS;
  // Week starts Monday for ru, Sunday for en — match user expectation.
  const weekStartsOn: 0 | 1 = i18n.language?.startsWith("ru") ? 1 : 0;

  const weekStart = useMemo(() => startOfWeek(anchor, { weekStartsOn }), [anchor, weekStartsOn]);
  const days = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart],
  );

  useEffect(() => {
    if (!activeChild) return;
    (async () => {
      const since = subDays(weekStart, 2).toISOString();
      const until = addDays(weekStart, 9).toISOString();
      const { data } = await supabase
        .from("sleep_sessions").select("*")
        .eq("child_id", activeChild.id)
        .gte("start_time", since)
        .lt("start_time", until)
        .order("start_time");
      const sess = (data ?? []) as SleepSession[];
      setSessions(sess);
      // Load interruptions only for the visible sleep sessions, joined with method name.
      if (sess.length > 0) {
        const ids = sess.map((s) => s.id);
        const { data: ints } = await supabase
          .from("sleep_interruptions")
          .select("id, sleep_session_id, start_time, settling_method_id, settling_methods(name)")
          .in("sleep_session_id", ids);
        setInterruptions(((ints ?? []) as any[]).map((r) => ({
          id: r.id,
          sleep_session_id: r.sleep_session_id,
          start_time: r.start_time,
          settling_method_id: r.settling_method_id,
          settling_method_name: r.settling_methods?.name ?? null,
        })));
      } else {
        setInterruptions([]);
      }
    })();
  }, [activeChild, weekStart.getTime()]);

  // For each visible day, compute the sleep blocks clipped to that calendar day.
  // A sleep that crosses midnight is split between adjacent days.
  const blocksPerDay = useMemo(() => {
    const now = new Date();
    return days.map((day) => {
      const dayStart = startOfDay(day).getTime();
      const dayEnd = dayStart + 24 * 60 * 60 * 1000;
      const out: { topPct: number; heightPct: number; type: "day" | "night"; sessionId: string }[] = [];
      for (const s of sessions) {
        const start = new Date(s.start_time).getTime();
        const end = (s.end_time ? new Date(s.end_time) : now).getTime();
        const lo = Math.max(start, dayStart);
        const hi = Math.min(end, dayEnd);
        if (hi <= lo) continue;
        const topPct = ((lo - dayStart) / (24 * 60 * 60 * 1000)) * 100;
        const heightPct = ((hi - lo) / (24 * 60 * 60 * 1000)) * 100;
        out.push({ topPct, heightPct, type: s.sleep_type, sessionId: s.id });
      }
      return out;
    });
  }, [sessions, days]);

  // Group interruptions per visible day; only those with a settling method are drawn.
  // Icons whose vertical positions are within ICON_OVERLAP_PCT of each other are clustered.
  const interruptionsPerDay = useMemo(() => {
    return days.map((day) => {
      const dayStart = startOfDay(day).getTime();
      const dayEnd = dayStart + 24 * 60 * 60 * 1000;
      const items = interruptions
        .filter((i) => i.settling_method_id) // skip if no method
        .map((i) => {
          const t = new Date(i.start_time).getTime();
          if (t < dayStart || t >= dayEnd) return null;
          // The session this interruption belongs to (so taps open it).
          const session = sessions.find((s) => s.id === i.sleep_session_id);
          if (!session) return null;
          // Skip if the corresponding sleep block on this day doesn't include this point.
          const sStart = new Date(session.start_time).getTime();
          const sEnd = (session.end_time ? new Date(session.end_time).getTime() : Date.now());
          if (t < sStart || t > sEnd) return null;
          return {
            id: i.id,
            topPct: ((t - dayStart) / (24 * 60 * 60 * 1000)) * 100,
            name: i.settling_method_name,
            session,
          };
        })
        .filter(Boolean) as { id: string; topPct: number; name: string | null; session: SleepSession }[];

      items.sort((a, b) => a.topPct - b.topPct);

      // Cluster items whose vertical positions are within ICON_OVERLAP_PCT.
      const clusters: { topPct: number; items: typeof items; session: SleepSession }[] = [];
      for (const it of items) {
        const last = clusters[clusters.length - 1];
        if (last && it.topPct - last.topPct < ICON_OVERLAP_PCT) {
          last.items.push(it);
        } else {
          clusters.push({ topPct: it.topPct, items: [it], session: it.session });
        }
      }
      return clusters;
    });
  }, [interruptions, sessions, days]);

  // Time axis labels at 00:00, 06:00, 12:00, 18:00, 24:00.
  const timeMarks = [0, 6, 12, 18, 24];

  if (!activeChild) {
    return <div className="px-4 text-center text-muted-foreground mt-12">{t("sleep.noChildSelected")}</div>;
  }

  const today = startOfDay(new Date());
  const canGoNext = addDays(weekStart, 7) <= today;

  const rangeLabel = `${format(days[0], "d MMM", { locale })} – ${format(days[6], "d MMM", { locale })}`;

  return (
    <main className="min-h-screen bg-hero p-4">
      <div className="max-w-2xl mx-auto py-4">
        <Button variant="ghost" size="sm" onClick={() => navigate(-1)} className="mb-4">
          <ArrowLeft className="w-4 h-4 mr-1" /> {t("common.back")}
        </Button>
        <h1 className="font-display text-2xl font-semibold mb-1">{t("analytics.heatmapTitle")}</h1>
        <p className="text-xs text-muted-foreground mb-4">{t("analytics.heatmapHelp")}</p>

        <div className="flex items-center justify-between mb-3">
          <Button variant="ghost" size="icon" onClick={() => setAnchor(subDays(weekStart, 7))}>
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <div className="text-sm font-medium">{rangeLabel}</div>
          <Button variant="ghost" size="icon" disabled={!canGoNext}
            onClick={() => setAnchor(addDays(weekStart, 7))}>
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>

        <Card className="p-3 shadow-card">
          {/* Day-of-week / date headers */}
          <div className="flex pl-10 mb-1">
            {days.map((d, i) => {
              const isToday = d.getTime() === today.getTime();
              return (
                <div key={i} className="flex-1 text-center">
                  <div className={`text-[10px] uppercase tracking-wide ${isToday ? "text-primary font-semibold" : "text-muted-foreground"}`}>
                    {format(d, "EEE", { locale })}
                  </div>
                  <div className={`text-xs ${isToday ? "text-primary font-semibold" : ""}`}>
                    {format(d, "d")}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Grid: time axis + 7 day columns */}
          <div className="flex" style={{ height: GRID_HEIGHT }}>
            {/* Time axis */}
            <div className="relative w-10 select-none" style={{ height: GRID_HEIGHT }}>
              {timeMarks.map((h) => (
                <div key={h}
                  className="absolute right-1 text-[10px] text-muted-foreground leading-none"
                  style={{ top: `${(h / 24) * 100}%`, transform: "translateY(-50%)" }}>
                  {h === 24 ? "00:00" : `${String(h).padStart(2, "0")}:00`}
                </div>
              ))}
            </div>

            {/* Day columns */}
            <div className="flex-1 relative">
              {/* Horizontal grid lines at every 6h */}
              {timeMarks.map((h) => (
                <div key={h} className="absolute left-0 right-0 border-t border-border/60"
                  style={{ top: `${(h / 24) * 100}%` }} />
              ))}

              <div className="flex h-full">
                {days.map((d, di) => (
                  <div key={di} className="flex-1 relative border-l border-border/40 first:border-l-0">
                    {blocksPerDay[di].map((b, bi) => (
                      <div
                        key={bi}
                        className="absolute left-[10%] right-[10%] rounded-md"
                        style={{
                          top: `${b.topPct}%`,
                          height: `${b.heightPct}%`,
                          background: b.type === "night"
                            ? "hsl(var(--primary) / 0.85)"
                            : "hsl(var(--primary) / 0.55)",
                        }}
                        onClick={() => {
                          const sess = sessions.find((s) => s.id === b.sessionId);
                          if (sess) setOpenSession(sess);
                        }}
                        role="button"
                      />
                    ))}
                    {/* Settling-method icons at interruption points */}
                    {interruptionsPerDay[di].map((cl, ci) => {
                      const visible = cl.items.slice(0, 2);
                      const extra = cl.items.length - visible.length;
                      return (
                        <button
                          key={ci}
                          type="button"
                          aria-label="open sleep"
                          className="absolute left-1/2 -translate-x-1/2 flex items-center gap-0.5 rounded-full bg-background/80 backdrop-blur-sm border border-border/60 px-1 py-0.5 shadow-sm hover:bg-background"
                          style={{ top: `${cl.topPct}%`, transform: "translate(-50%, -50%)" }}
                          onClick={(e) => { e.stopPropagation(); setOpenSession(cl.session); }}
                        >
                          {visible.map((it) => {
                            const Icon = iconForMethod(it.name);
                            return <Icon key={it.id} className="w-2.5 h-2.5 text-muted-foreground" strokeWidth={2} />;
                          })}
                          {extra > 0 && (
                            <span className="text-[8px] leading-none text-muted-foreground font-medium pl-0.5">+{extra}</span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Card>
        {openSession && (
          <SleepDetail
            session={openSession}
            onClose={() => setOpenSession(null)}
            onChange={() => { /* re-fetch on close not necessary; week effect handles changes */ }}
          />
        )}
      </div>
    </main>
  );
}
