import { useRef, useState } from "react";
import {
  Bar, BarChart, Cell, ReferenceArea, ReferenceLine,
  ResponsiveContainer, XAxis, YAxis,
} from "recharts";

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

export interface WeekStackedSleepChartProps {
  data: WeekCompareDayDatum[];
  normTotal: { min: number; max: number } | null | undefined;
  avgTotal: number;
  nightLabel: string;
  dayLabel: string;
  fmtDur: (min: number) => string;
  onSelectDay: (dateKey: string) => void;
}

function stackFill(d: WeekCompareDayDatum, layer: "night" | "day", selected: boolean): string {
  if (!d.hasData) return "transparent";
  const dimmed = !d.active;
  if (layer === "night") {
    if (dimmed) return "hsl(var(--muted-foreground) / 0.2)";
    return selected ? "hsl(var(--primary))" : "hsl(var(--primary) / 0.85)";
  }
  if (dimmed) return "hsl(var(--muted-foreground) / 0.1)";
  return selected ? "hsl(var(--primary) / 0.6)" : "hsl(var(--primary) / 0.45)";
}

const DOUBLE_TAP_MS = 350;

export function WeekStackedSleepChart({
  data, normTotal, avgTotal, nightLabel, dayLabel, fmtDur, onSelectDay,
}: WeekStackedSleepChartProps) {
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const lastTapRef = useRef<{ dateKey: string; time: number } | null>(null);

  const handleClick = (payload: { payload?: WeekCompareDayDatum }) => {
    const d = payload?.payload;
    if (!d?.hasData) return;

    const now = Date.now();
    const last = lastTapRef.current;

    if (last && last.dateKey === d.dateKey && now - last.time < DOUBLE_TAP_MS) {
      lastTapRef.current = null;
      setSelectedKey(null);
      onSelectDay(d.dateKey);
    } else {
      lastTapRef.current = { dateKey: d.dateKey, time: now };
      setSelectedKey((prev) => (prev === d.dateKey ? null : d.dateKey));
    }
  };

  const selectedDatum = selectedKey ? data.find((d) => d.dateKey === selectedKey) ?? null : null;

  // Ultra-tight domain: minimal padding so day-to-day variation is maximally visible.
  // The norm ReferenceArea is allowed to overflow without extending the domain.
  const activeTotals = data
    .filter((d) => d.hasData && d.nightSleep + d.daySleep > 0)
    .map((d) => d.nightSleep + d.daySleep);

  const maxTotal = activeTotals.length ? Math.max(...activeTotals) : 1;
  const minTotal = activeTotals.length ? Math.min(...activeTotals) : 0;

  const spread = maxTotal - minTotal;
  // Minimal padding: 15% below, 5% above.
  const padBelow = Math.max(spread * 0.15, minTotal * 0.03);
  const padAbove = spread * 0.05;
  const domainMin = Math.max(0, Math.floor(minTotal - padBelow));
  const domainTop = Math.ceil(maxTotal + padAbove);

  return (
    <>
      <div className="h-40 mt-3">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 4 }} barCategoryGap="24%">
            {normTotal && (
              <ReferenceArea
                y1={normTotal.min} y2={normTotal.max}
                fill="hsl(var(--ww-good))" fillOpacity={0.12}
                ifOverflow="visible"
              />
            )}
            <XAxis
              dataKey="label" interval={0} tickLine={false} axisLine={false}
              tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
            />
            <YAxis hide domain={[domainMin, domainTop]} />
            {avgTotal > 0 && (
              <ReferenceLine
                y={avgTotal} stroke="hsl(var(--primary))"
                strokeDasharray="3 3" strokeOpacity={0.55}
              />
            )}
            <Bar
              dataKey="nightSleep" name={nightLabel} stackId="s"
              isAnimationActive={false} cursor="pointer" onClick={handleClick}
            >
              {data.map((d, i) => (
                <Cell key={i} fill={stackFill(d, "night", d.dateKey === selectedKey)} />
              ))}
            </Bar>
            <Bar
              dataKey="daySleep" name={dayLabel} stackId="s" radius={[4, 4, 0, 0]}
              isAnimationActive={false} cursor="pointer"
              onClick={(p: { payload?: WeekCompareDayDatum }) => handleClick(p)}
            >
              {data.map((d, i) => (
                <Cell key={i} fill={stackFill(d, "day", d.dateKey === selectedKey)} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Selected day detail panel */}
      {selectedDatum && (
        <div className="mt-2 rounded-lg bg-muted/50 px-3 py-2 flex items-center justify-between gap-2">
          <span className="text-xs font-medium">{selectedDatum.label}</span>
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <span className="inline-block w-2 h-2 rounded-sm bg-primary/85 flex-shrink-0" />
              {fmtDur(selectedDatum.nightSleep)}
            </span>
            {selectedDatum.daySleep > 0 && (
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <span className="inline-block w-2 h-2 rounded-sm bg-primary/45 flex-shrink-0" />
                {fmtDur(selectedDatum.daySleep)}
              </span>
            )}
            <span className="text-xs font-semibold tabular-nums">
              {fmtDur(selectedDatum.nightSleep + selectedDatum.daySleep)}
            </span>
          </div>
        </div>
      )}

      {/* Legend */}
      <div className="flex items-center gap-3 mt-2 justify-center">
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
