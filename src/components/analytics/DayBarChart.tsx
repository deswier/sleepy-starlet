import { lazy, Suspense } from "react";
import type { DayBarChartProps, WeekCompareChartProps } from "./DayBarChartImpl";

export type { DayBarDatum, DayBarChartProps, WeekCompareDayDatum, WeekCompareChartProps, WeekMetric } from "./DayBarChartImpl";

// Both charts share one recharts chunk — only downloaded once.
const LazyDayBarChart = lazy(() =>
  import("./DayBarChartImpl").then((m) => ({ default: m.DayBarChart })),
);
const LazyWeekCompareChart = lazy(() =>
  import("./DayBarChartImpl").then((m) => ({ default: m.WeekCompareChart })),
);

export function DayBarChart(props: DayBarChartProps) {
  return (
    <Suspense fallback={<div className="h-24 w-full mt-3 rounded-md bg-muted/40 animate-pulse" />}>
      <LazyDayBarChart {...props} />
    </Suspense>
  );
}

export function WeekCompareChart(props: WeekCompareChartProps) {
  return (
    <Suspense fallback={<div className="h-36 w-full rounded-md bg-muted/40 animate-pulse" />}>
      <LazyWeekCompareChart {...props} />
    </Suspense>
  );
}
