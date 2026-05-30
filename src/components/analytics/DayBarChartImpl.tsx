import {
  Bar, BarChart, Cell, ReferenceArea, ReferenceLine,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
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

function stackFill(d: WeekCompareDayDatum, layer: "night" | "day"): string {
  if (!d.hasData) return "transparent";
  if (!d.active) return layer === "night" ? "hsl(var(--muted-foreground) / 0.2)" : "hsl(var(--muted-foreground) / 0.1)";
  return layer === "night" ? "hsl(var(--primary) / 0.85)" : "hsl(var(--primary) / 0.45)";
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
