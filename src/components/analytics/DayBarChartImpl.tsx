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
