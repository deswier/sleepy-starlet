/**
 * PROTOTYPE ONLY — delete after design review.
 * Navigate to /proto-charts to compare V1 vs V2 vs V3 (current).
 *
 * All data is hardcoded so this page needs no auth/child context.
 */
import { useState } from "react";
import {
  Bar, BarChart, Cell, ReferenceArea, ReferenceLine,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Moon, Sun, Activity, Clock } from "lucide-react";

// ── Sample data (7 days) ───────────────────────────────────────────────────
const DAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

const DATA = [
  { label: "Пн", night: 660, day: 180, wake: 600, ww: 120, naps: 3 },
  { label: "Вт", night: 720, day: 120, wake: 540, ww: 100, naps: 2 },
  { label: "Ср", night: 600, day: 210, wake: 630, ww: 140, naps: 3 },
  { label: "Чт", night: 0,   day: 0,   wake: 0,   ww: 0,   naps: 0 },  // no data
  { label: "Пт", night: 690, day: 150, wake: 600, ww: 110, naps: 2 },
  { label: "Сб", night: 750, day: 90,  wake: 600, ww: 130, naps: 1 },
  { label: "Вс", night: 680, day: 160, wake: 600, ww: 115, naps: 2 },
];

// Norms (minutes, hardcoded for ~6mo baby)
const NORM = { total: { min: 780, max: 900 }, night: { min: 600, max: 720 }, day: { min: 120, max: 180 }, wake: { min: 480, max: 660 } };

const fmtDur = (min: number) => {
  if (!min) return "—";
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h ? (m ? `${h}ч${String(m).padStart(2, "0")}м` : `${h}ч`) : `${m}м`;
};

const avg = (arr: number[]) => {
  const filtered = arr.filter(Boolean);
  return filtered.length ? Math.round(filtered.reduce((a, b) => a + b, 0) / filtered.length) : 0;
};

const avgTotal = avg(DATA.map((d) => d.night + d.day));
const avgNight = avg(DATA.filter((d) => d.night).map((d) => d.night));
const avgWake  = avg(DATA.filter((d) => d.wake).map((d) => d.wake));
const avgWW    = avg(DATA.filter((d) => d.ww).map((d) => d.ww));
const avgNaps  = avg(DATA.filter((d) => d.naps).map((d) => d.naps));

// ── Colour helpers ─────────────────────────────────────────────────────────
function colorFor(val: number, norm: { min: number; max: number }, active = true): string {
  if (!val || !active) return "hsl(var(--muted-foreground) / 0.3)";
  return val >= norm.min && val <= norm.max
    ? "hsl(var(--ww-good))"
    : "hsl(var(--ww-warn))";
}

// ── Simple tooltip ─────────────────────────────────────────────────────────
function Tip({ active, payload, fmt }: { active?: boolean; payload?: any[]; fmt: (v: number) => string }) {
  if (!active || !payload?.length) return null;
  const first = payload[0];
  const d = first?.payload;
  if (!d?.label) return null;
  const hasData = payload.some((p: any) => (p.value ?? 0) > 0);
  if (!hasData) return null;
  return (
    <div className="rounded-md border border-border bg-background px-2 py-1 text-xs shadow-md space-y-0.5">
      <div className="font-medium">{d.label}</div>
      {payload.map((p: any, i: number) => p.value > 0 && (
        <div key={i} className="flex items-center gap-1.5">
          <span className="inline-block w-2 h-2 rounded-sm" style={{ background: p.fill }} />
          <span className="text-muted-foreground">{p.name}:</span>
          <span className="tabular-nums">{fmt(p.value)}</span>
        </div>
      ))}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// VARIANT 1: Stacked sleep bar + metric switcher
// ──────────────────────────────────────────────────────────────────────────
type Metric = "sleep" | "wake" | "ww" | "naps";

const METRICS: { key: Metric; icon: React.ReactNode; label: string }[] = [
  { key: "sleep", icon: <Moon className="w-3.5 h-3.5" />, label: "Сон" },
  { key: "wake",  icon: <Sun  className="w-3.5 h-3.5" />, label: "Бодрств." },
  { key: "ww",    icon: <Activity className="w-3.5 h-3.5" />, label: "ср. ВБ" },
  { key: "naps",  icon: <Clock className="w-3.5 h-3.5" />, label: "Снов" },
];

function V1Chart() {
  const [metric, setMetric] = useState<Metric>("sleep");

  const isSleep = metric === "sleep";
  const norm = metric === "sleep" ? NORM.total : metric === "wake" ? NORM.wake : { min: 90, max: 150 };
  const avg1 = metric === "sleep" ? avgTotal : metric === "wake" ? avgWake : metric === "ww" ? avgWW : avgNaps;

  const chartData = DATA.map((d) => ({
    ...d,
    total: d.night + d.day,
    _inactive: !d.night && !d.day,
  }));

  const domainMax = Math.ceil(
    Math.max(...chartData.map((d) =>
      metric === "sleep" ? d.total
      : metric === "wake" ? d.wake
      : metric === "ww"   ? d.ww
      : d.naps
    ), norm.max) * 1.15
  );

  return (
    <Card className="p-4 shadow-card border-border/50">
      <div className="flex items-center justify-between mb-3">
        <div className="text-sm font-medium text-muted-foreground">Недельное сравнение</div>
        <div className="text-xs text-muted-foreground">
          среднее: <span className="font-semibold text-foreground">
            {metric === "naps" ? avg1 : fmtDur(avg1)}
          </span>
        </div>
      </div>

      {/* Segment switcher */}
      <div className="flex gap-1 mb-3 bg-muted rounded-lg p-1">
        {METRICS.map((m) => (
          <button
            key={m.key}
            type="button"
            onClick={() => setMetric(m.key)}
            className={
              "flex-1 flex items-center justify-center gap-1 py-1 rounded-md text-xs font-medium transition-all " +
              (metric === m.key
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground")
            }
          >
            {m.icon} {m.label}
          </button>
        ))}
      </div>

      <div className="h-36">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: 4 }} barCategoryGap="22%">
            <ReferenceArea y1={norm.min} y2={norm.max}
              fill="hsl(var(--ww-good))" fillOpacity={0.1} ifOverflow="extendDomain" />
            <XAxis dataKey="label" interval={0} tickLine={false} axisLine={false}
              tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
            <YAxis hide domain={[0, domainMax]} />
            {avg1 > 0 && (
              <ReferenceLine y={avg1} stroke="hsl(var(--primary))"
                strokeDasharray="3 3" strokeOpacity={0.6} />
            )}
            <Tooltip cursor={{ fill: "hsl(var(--muted) / 0.4)" }}
              content={<Tip fmt={metric === "naps" ? String : fmtDur} />} />

            {isSleep ? (
              <>
                <Bar dataKey="night" name="Ночной" stackId="s" radius={[0, 0, 0, 0]} isAnimationActive={false}>
                  {chartData.map((d, i) => (
                    <Cell key={i} fill={d._inactive
                      ? "hsl(var(--muted-foreground) / 0.15)"
                      : "hsl(var(--primary) / 0.85)"} />
                  ))}
                </Bar>
                <Bar dataKey="day" name="Дневной" stackId="s" radius={[4, 4, 0, 0]} isAnimationActive={false}>
                  {chartData.map((d, i) => (
                    <Cell key={i} fill={d._inactive
                      ? "hsl(var(--muted-foreground) / 0.1)"
                      : "hsl(var(--primary) / 0.45)"} />
                  ))}
                </Bar>
              </>
            ) : metric === "wake" ? (
              <Bar dataKey="wake" name="Бодрств." radius={[4, 4, 0, 0]} isAnimationActive={false}>
                {chartData.map((d, i) => (
                  <Cell key={i} fill={colorFor(d.wake, NORM.wake, !d._inactive)} />
                ))}
              </Bar>
            ) : metric === "ww" ? (
              <Bar dataKey="ww" name="ср. ВБ" radius={[4, 4, 0, 0]} isAnimationActive={false}>
                {chartData.map((d, i) => (
                  <Cell key={i} fill={colorFor(d.ww, { min: 90, max: 150 }, !d._inactive)} />
                ))}
              </Bar>
            ) : (
              <Bar dataKey="naps" name="Снов" radius={[4, 4, 0, 0]} isAnimationActive={false}>
                {chartData.map((d, i) => (
                  <Cell key={i} fill={colorFor(d.naps, { min: 2, max: 3 }, !d._inactive)} />
                ))}
              </Bar>
            )}
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Legend for sleep mode */}
      {isSleep && (
        <div className="flex items-center gap-3 mt-2 justify-center">
          <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
            <span className="w-3 h-3 rounded-sm inline-block bg-primary/85" /> Ночной
          </span>
          <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
            <span className="w-3 h-3 rounded-sm inline-block bg-primary/45" /> Дневной
          </span>
        </div>
      )}
    </Card>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// VARIANT 2: Only stacked sleep bar (no switcher)
// ──────────────────────────────────────────────────────────────────────────
function V2Chart() {
  const chartData = DATA.map((d) => ({
    ...d,
    total: d.night + d.day,
    _inactive: !d.night && !d.day,
  }));

  const domainMax = Math.ceil(Math.max(...chartData.map((d) => d.total), NORM.total.max) * 1.15);

  return (
    <Card className="p-4 shadow-card border-border/50">
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2 text-muted-foreground text-sm">
          <span className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center">
            <Moon className="w-4 h-4" />
          </span>
          Всего сна
        </div>
        <div className="text-right">
          <div className="font-display text-xl font-semibold">{fmtDur(avgTotal)}</div>
          <div className="text-[11px] text-muted-foreground">в среднем за день</div>
        </div>
      </div>

      <div className="h-36">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: 4 }} barCategoryGap="22%">
            <ReferenceArea y1={NORM.total.min} y2={NORM.total.max}
              fill="hsl(var(--ww-good))" fillOpacity={0.1} ifOverflow="extendDomain" />
            <XAxis dataKey="label" interval={0} tickLine={false} axisLine={false}
              tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
            <YAxis hide domain={[0, domainMax]} />
            <ReferenceLine y={avgTotal} stroke="hsl(var(--primary))"
              strokeDasharray="3 3" strokeOpacity={0.6} />
            <Tooltip cursor={{ fill: "hsl(var(--muted) / 0.4)" }}
              content={<Tip fmt={fmtDur} />} />
            <Bar dataKey="night" name="Ночной" stackId="s" isAnimationActive={false}>
              {chartData.map((d, i) => (
                <Cell key={i} fill={d._inactive
                  ? "hsl(var(--muted-foreground) / 0.15)"
                  : "hsl(var(--primary) / 0.85)"} />
              ))}
            </Bar>
            <Bar dataKey="day" name="Дневной" stackId="s" radius={[4, 4, 0, 0]} isAnimationActive={false}>
              {chartData.map((d, i) => (
                <Cell key={i} fill={d._inactive
                  ? "hsl(var(--muted-foreground) / 0.1)"
                  : "hsl(var(--primary) / 0.45)"} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="flex items-center gap-3 mt-2 justify-center">
        <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
          <span className="w-3 h-3 rounded-sm inline-block bg-primary/85" /> Ночной ({fmtDur(avgNight)})
        </span>
        <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
          <span className="w-3 h-3 rounded-sm inline-block bg-primary/45" /> Дневной
        </span>
      </div>

      {/* Rest stays as numbers — shown below the chart */}
      <div className="mt-3 grid grid-cols-3 gap-2">
        {[
          { icon: <Sun className="w-3.5 h-3.5" />, label: "Бодрств.", val: fmtDur(avgWake) },
          { icon: <Activity className="w-3.5 h-3.5" />, label: "ср. ВБ", val: fmtDur(avgWW) },
          { icon: <Clock className="w-3.5 h-3.5" />, label: "Снов", val: String(avgNaps) },
        ].map((item) => (
          <div key={item.label} className="bg-muted/40 rounded-lg p-2 flex flex-col items-center gap-0.5">
            <span className="text-muted-foreground">{item.icon}</span>
            <span className="text-xs font-semibold tabular-nums">{item.val}</span>
            <span className="text-[10px] text-muted-foreground">{item.label}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// VARIANT 3: current — reminder card (mini bars per metric card)
// ──────────────────────────────────────────────────────────────────────────
function V3Reminder() {
  return (
    <Card className="p-4 shadow-card border-border/50 bg-muted/20">
      <p className="text-sm text-muted-foreground text-center">
        Вариант 3 (текущий) — мини-бар над каждой карточкой метрики в <strong>Аналитика → Неделя</strong>.
      </p>
    </Card>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Page
// ──────────────────────────────────────────────────────────────────────────
export default function ProtoCharts() {
  return (
    <main className="min-h-screen bg-hero px-4 py-6 max-w-md mx-auto space-y-6">
      <h1 className="font-display text-2xl font-semibold">Прото: варианты чарта</h1>
      <p className="text-sm text-muted-foreground -mt-4">
        Данные hardcoded. Чт — день без данных. Зелёная полоса = возрастная норма.
      </p>

      <section className="space-y-2">
        <div className="text-xs font-semibold uppercase tracking-widest text-muted-foreground px-1">
          Вариант 1 — стек сна + переключатель метрик
        </div>
        <V1Chart />
      </section>

      <section className="space-y-2">
        <div className="text-xs font-semibold uppercase tracking-widest text-muted-foreground px-1">
          Вариант 2 — только стек сна
        </div>
        <V2Chart />
      </section>

      <section className="space-y-2">
        <div className="text-xs font-semibold uppercase tracking-widest text-muted-foreground px-1">
          Вариант 3 — мини-бар на каждую метрику (текущий)
        </div>
        <V3Reminder />
      </section>
    </main>
  );
}
