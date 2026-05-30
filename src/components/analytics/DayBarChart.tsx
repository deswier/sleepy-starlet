import { lazy, Suspense } from "react";
import type { WeekStackedSleepChartProps } from "./DayBarChartImpl";

export type { WeekCompareDayDatum, WeekStackedSleepChartProps } from "./DayBarChartImpl";

const LazyWeekStackedSleepChart = lazy(() =>
  import("./DayBarChartImpl").then((m) => ({ default: m.WeekStackedSleepChart })),
);

export function WeekStackedSleepChart(props: WeekStackedSleepChartProps) {
  return (
    <Suspense fallback={<div className="h-36 w-full mt-3 rounded-md bg-muted/40 animate-pulse" />}>
      <LazyWeekStackedSleepChart {...props} />
    </Suspense>
  );
}
