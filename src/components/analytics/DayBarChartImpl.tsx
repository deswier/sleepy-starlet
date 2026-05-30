import { useState } from "react";
import {
  Bar, BarChart, Cell, ReferenceArea, ReferenceLine,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";

export interface DayBarDatum {
  dateKey: string; // yyyy-MM-dd — passed back on tap
  label: string;   // short weekday, pre-formatted by the caller (locale-aware)
  value: number;
  active: boolean;  // included in the weekly average
  hasData: boolean; // physically has records that day
}

export interface DayBarChartProps {
  data: DayBarDatum[];
  norm?: { min: number; max: number } | null;
  average: number;
  format: (v: number) => string;
  onSelectDay: (dateKey: string) => void;
}

// Bars are coloured by norm status so a glance shows which days landed in range:
// good (in norm) / warn (out of norm). Excluded or empty days are de-emphasised
// so they read as "not counted" without disappearing entirely.
function barColor(d: DayBarDatum, norm?: { min: number; max: number } | null): string {
  if (!d.hasData || d.value <= 0) return "hsl(var(--muted))";
  if (!d.active) return "hsl(var(--muted-foreground) / 0.3)";
  if (norm) {
    const ok = d.value >= norm.min && d.value <= norm.max;
    return ok ? "hsl(var(--ww-good))" : "hsl(var(--ww-warn))";
  }
  return "hsl(var(--primary))";
}

function ChartTip({ active, payload, format }: {
  active?: boolean;
  payload?: { payload: DayBarDatum }[];
  format: (v: number) => string;
}) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  if (!p.hasData) return null;
  return (
    <div className="rounded-md border border-border bg-background px-2 py-1 text-xs shadow-md">
      <div className="font-medium">{p.label}</div>
      <div className="text-muted-foreground tabular-nums">{format(p.value)}</div>
    </div>
  );
}

// ── WeekCompareChart ────────────────────────────────────────────────────────

export interface WeekCompareDayDatum {
  dateKey: string;
  label: string;
  nightSleep: number;
  daySleep: number;
  totalWake: number;
  avgWW: number;
  napsCount: number;
  active: boolean;
  hasData: boolean;
}

export type WeekMetric = "sleep" | "wake" | "ww" | "naps";

export interface WeekCompareChartProps {
  data: WeekCompareDayDatum[];
  norm: {
    totalSleep: { min: number; max: number };
    nightSleep: { min: number; max: number };
    daySleep: { min: number; max: number };
    totalWake: { min: number; max: number };
    ww: { min: number; max: number };
    napsCount: { min: number; max: number };
  } | null;
  avgs: {
    totalSleep: number;
    nightSleep: number;
    totalWake: number;
    ww: number;
    napsCount: number;
  };
  labels: { sleep: string; wake: string; ww: string; naps: string };
  fmtDur: (min: number) => string;
  onSelectDay: (dateKey: string) => void;
}

type StackPayload = { nightSleep?: number; daySleep?: number };

function WeekTip({ active, payload, metric, fmtDur }: {
  active?: boolean;
  payload?: { payload: WeekCompareDayDatum; name: string; value: number; fill: string }[];
  metric: WeekMetric;
  fmtDur: (v: number) => string;
}) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  if (!d.hasData) return null;
  return (
    <div className="rounded-md border border-border bg-background px-2 py-1.5 text-xs shadow-md space-y-0.5">
      <div className="font-medium mb-1">{d.label}</div>
      {metric === "sleep" ? (
        <>
          {payload.map((p, i) => p.value > 0 && (
            <div key={i} className="flex items-center gap-1.5">
              <span className="inline-block w-2 h-2 rounded-sm flex-shrink-0" style={{ background: p.fill }} />
              <span className="text-muted-foreground">{p.name}:</span>
              <span className="tabular-nums">{fmtDur(p.value)}</span>
            </div>
          ))}
        </>
      ) : (
        <div className="tabular-nums text-muted-foreground">
          {metric === "naps" ? payload[0]?.value : fmtDur(payload[0]?.value ?? 0)}
        </div>
      )}
    </div>
  );
}

function stackFill(d: WeekCompareDayDatum, layer: "night" | "day"): string {
  if (!d.hasData) return "transparent";
  if (!d.active) return layer === "night" ? "hsl(var(--muted-foreground) / 0.2)" : "hsl(var(--muted-foreground) / 0.1)";
  return layer === "night" ? "hsl(var(--primary) / 0.85)" : "hsl(var(--primary) / 0.45)";
}

function singleFill(value: number, norm: { min: number; max: number } | undefined, active: boolean): string {
  if (!value || !active) return "hsl(var(--muted-foreground) / 0.25)";
  if (!norm) return "hsl(var(--primary))";
  return value >= norm.min && value <= norm.max ? "hsl(var(--ww-good))" : "hsl(var(--ww-warn))";
}

export function WeekCompareChart({ data, norm, avgs, labels, fmtDur, onSelectDay }: WeekCompareChartProps) {
  const [metric, setMetric] = useState<WeekMetric>("sleep");

  const metricKeys: { key: WeekMetric; label: string }[] = [
    { key: "sleep", label: labels.sleep },
    { key: "wake",  label: labels.wake },
    { key: "ww",    label: labels.ww },
    { key: "naps",  label: labels.naps },
  ];

  const normForMetric = metric === "sleep" ? norm?.totalSleep
    : metric === "wake" ? norm?.totalWake
    : metric === "ww"   ? norm?.ww
    : norm?.napsCount;

  const avgForMetric = metric === "sleep" ? avgs.totalSleep
    : metric === "wake" ? avgs.totalWake
    : metric === "ww"   ? avgs.ww
    : avgs.napsCount;

  const maxVal = Math.max(
    ...data.map((d) =>
      metric === "sleep" ? d.nightSleep + d.daySleep
      : metric === "wake" ? d.totalWake
      : metric === "ww"   ? d.avgWW
      : d.napsCount
    ),
    normForMetric?.max ?? 0,
    1,
  );
  const domainTop = Math.ceil(maxVal * 1.18);

  const handleClick = (payload: { payload?: WeekCompareDayDatum }) => {
    if (payload?.payload?.hasData) onSelectDay(payload.payload.dateKey);
  };

  return (
    <div>
      {/* Segment switcher */}
      <div className="flex gap-1 mb-3 bg-muted rounded-lg p-1">
        {metricKeys.map((m) => (
          <button
            key={m.key}
            type="button"
            onClick={() => setMetric(m.key)}
            className={
              "flex-1 py-1 rounded-md text-xs font-medium transition-all " +
              (metric === m.key
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground")
            }
          >
            {m.label}
          </button>
        ))}
      </div>

      <div className="h-36">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 4 }} barCategoryGap="22%">
            {normForMetric && (
              <ReferenceArea y1={normForMetric.min} y2={normForMetric.max}
                fill="hsl(var(--ww-good))" fillOpacity={0.1} ifOverflow="extendDomain" />
            )}
            <XAxis dataKey="label" interval={0} tickLine={false} axisLine={false}
              tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
            <YAxis hide domain={[0, domainTop]} />
            {avgForMetric > 0 && (
              <ReferenceLine y={avgForMetric} stroke="hsl(var(--primary))"
                strokeDasharray="3 3" strokeOpacity={0.6} />
            )}
            <Tooltip
              cursor={{ fill: "hsl(var(--muted) / 0.4)" }}
              content={<WeekTip metric={metric} fmtDur={fmtDur} />}
            />

            {metric === "sleep" ? (
              <>
                <Bar dataKey="nightSleep" name="Ночной" stackId="s"
                  isAnimationActive={false} cursor="pointer" onClick={handleClick}>
                  {data.map((d, i) => <Cell key={i} fill={stackFill(d, "night")} />)}
                </Bar>
                <Bar dataKey="daySleep" name="Дневной" stackId="s" radius={[4, 4, 0, 0]}
                  isAnimationActive={false} cursor="pointer" onClick={(p: StackPayload & { payload?: WeekCompareDayDatum }) => handleClick(p as { payload?: WeekCompareDayDatum })}>
                  {data.map((d, i) => <Cell key={i} fill={stackFill(d, "day")} />)}
                </Bar>
              </>
            ) : metric === "wake" ? (
              <Bar dataKey="totalWake" radius={[4, 4, 0, 0]} isAnimationActive={false}
                cursor="pointer" onClick={handleClick}>
                {data.map((d, i) => <Cell key={i} fill={singleFill(d.totalWake, norm?.totalWake, d.active)} />)}
              </Bar>
            ) : metric === "ww" ? (
              <Bar dataKey="avgWW" radius={[4, 4, 0, 0]} isAnimationActive={false}
                cursor="pointer" onClick={handleClick}>
                {data.map((d, i) => <Cell key={i} fill={singleFill(d.avgWW, norm?.ww, d.active)} />)}
              </Bar>
            ) : (
              <Bar dataKey="napsCount" radius={[4, 4, 0, 0]} isAnimationActive={false}
                cursor="pointer" onClick={handleClick}>
                {data.map((d, i) => <Cell key={i} fill={singleFill(d.napsCount, norm?.napsCount, d.active)} />)}
              </Bar>
            )}
          </BarChart>
        </ResponsiveContainer>
      </div>

      {metric === "sleep" && (
        <div className="flex items-center gap-3 mt-1.5 justify-center">
          <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
            <span className="inline-block w-2.5 h-2.5 rounded-sm bg-primary/85" />
            Ночной
          </span>
          <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
            <span className="inline-block w-2.5 h-2.5 rounded-sm bg-primary/45" />
            Дневной
          </span>
        </div>
      )}
    </div>
  );
}

// ── DayBarChart (kept — still exported via the lazy wrapper) ────────────────

export function DayBarChart({ data, norm, average, format, onSelectDay }: DayBarChartProps) {
  const maxVal = Math.max(0, ...data.map((d) => d.value), norm?.max ?? 0);
  const domainTop = maxVal > 0 ? Math.ceil(maxVal * 1.15) : 1;

  return (
    <div className="h-24 w-full mt-3 -ml-1">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 4 }} barCategoryGap="22%">
          {norm && (
            <ReferenceArea
              y1={norm.min}
              y2={norm.max}
              fill="hsl(var(--ww-good))"
              fillOpacity={0.1}
              ifOverflow="extendDomain"
            />
          )}
          <XAxis
            dataKey="label"
            interval={0}
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
          />
          <YAxis hide domain={[0, domainTop]} />
          {average > 0 && (
            <ReferenceLine
              y={average}
              stroke="hsl(var(--primary))"
              strokeDasharray="3 3"
              strokeOpacity={0.6}
            />
          )}
          <Tooltip
            cursor={{ fill: "hsl(var(--muted) / 0.4)" }}
            content={<ChartTip format={format} />}
          />
          <Bar
            dataKey="value"
            radius={[4, 4, 0, 0]}
            isAnimationActive={false}
            cursor="pointer"
            onClick={(d: { payload?: DayBarDatum }) => {
              if (d?.payload?.hasData) onSelectDay(d.payload.dateKey);
            }}
          >
            {data.map((d, i) => (
              <Cell key={i} fill={barColor(d, norm)} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ── WeekStackedSleepChart ────────────────────────────────────────────────────
// Variant 2: stacked sleep bar (night + day) embedded in the total-sleep card.
// No metric switcher — just one focused view of sleep composition per day.

export interface WeekStackedSleepChartProps {
  data: WeekCompareDayDatum[];
  normTotal: { min: number; max: number } | null | undefined;
  avgTotal: number;
  nightLabel: string;
  dayLabel: string;
  fmtDur: (min: number) => string;
  onSelectDay: (dateKey: string) => void;
}

function StackedTip({ active, payload, fmtDur }: {
  active?: boolean;
  payload?: { payload: WeekCompareDayDatum; name: string; value: number; fill: string }[];
  fmtDur: (v: number) => string;
}) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  if (!d.hasData) return null;
  const total = (payload[0].value ?? 0) + (payload[1]?.value ?? 0);
  return (
    <div className="rounded-md border border-border bg-background px-2 py-1.5 text-xs shadow-md space-y-0.5">
      <div className="font-medium mb-1">{d.label} · {fmtDur(total)}</div>
      {payload.map((p, i) => p.value > 0 && (
        <div key={i} className="flex items-center gap-1.5">
          <span className="inline-block w-2 h-2 rounded-sm flex-shrink-0" style={{ background: p.fill }} />
          <span className="text-muted-foreground">{p.name}:</span>
          <span className="tabular-nums">{fmtDur(p.value)}</span>
        </div>
      ))}
    </div>
  );
}

export function WeekStackedSleepChart({
  data, normTotal, avgTotal, nightLabel, dayLabel, fmtDur, onSelectDay,
}: WeekStackedSleepChartProps) {
  const maxVal = Math.max(
    ...data.map((d) => d.nightSleep + d.daySleep),
    normTotal?.max ?? 0,
    1,
  );
  const domainTop = Math.ceil(maxVal * 1.18);

  const handleClick = (payload: { payload?: WeekCompareDayDatum }) => {
    if (payload?.payload?.hasData) onSelectDay(payload.payload.dateKey);
  };

  return (
    <>
      <div className="h-36 mt-3">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 4 }} barCategoryGap="22%">
            {normTotal && (
              <ReferenceArea y1={normTotal.min} y2={normTotal.max}
                fill="hsl(var(--ww-good))" fillOpacity={0.1} ifOverflow="extendDomain" />
            )}
            <XAxis dataKey="label" interval={0} tickLine={false} axisLine={false}
              tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
            <YAxis hide domain={[0, domainTop]} />
            {avgTotal > 0 && (
              <ReferenceLine y={avgTotal} stroke="hsl(var(--primary))"
                strokeDasharray="3 3" strokeOpacity={0.6} />
            )}
            <Tooltip cursor={{ fill: "hsl(var(--muted) / 0.4)" }}
              content={<StackedTip fmtDur={fmtDur} />} />
            <Bar dataKey="nightSleep" name={nightLabel} stackId="s"
              isAnimationActive={false} cursor="pointer" onClick={handleClick}>
              {data.map((d, i) => <Cell key={i} fill={stackFill(d, "night")} />)}
            </Bar>
            <Bar dataKey="daySleep" name={dayLabel} stackId="s" radius={[4, 4, 0, 0]}
              isAnimationActive={false} cursor="pointer" onClick={(p: { payload?: WeekCompareDayDatum }) => handleClick(p)}>
              {data.map((d, i) => <Cell key={i} fill={stackFill(d, "day")} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="flex items-center gap-3 mt-1.5 justify-center">
        <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
          <span className="inline-block w-2.5 h-2.5 rounded-sm bg-primary/85" />
          {nightLabel}
        </span>
        <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
          <span className="inline-block w-2.5 h-2.5 rounded-sm bg-primary/45" />
          {dayLabel}
        </span>
      </div>
    </>
  );
}
