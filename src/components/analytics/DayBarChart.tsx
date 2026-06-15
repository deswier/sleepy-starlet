import { lazy, Suspense } from "react";
import type { WeekStackedSleepChartProps, WeekStackedWakeChartProps } from "./DayBarChartImpl";

export type { WeekCompareDayDatum, WeekStackedSleepChartProps, WeekWakeDayDatum, WeekStackedWakeChartProps } from "./DayBarChartImpl";
export { WW_SLOTS } from "./DayBarChartImpl";

const LazyWeekStackedSleepChart = lazy(() =>
  import("./DayBarChartImpl").then((m) => ({ default: m.WeekStackedSleepChart })),
);

const LazyWeekStackedWakeChart = lazy(() =>
  import("./DayBarChartImpl").then((m) => ({ default: m.WeekStackedWakeChart })),
);

export function WeekStackedSleepChart(props: WeekStackedSleepChartProps) {
  return (
    <Suspense fallback={<div className="h-36 w-full mt-3 rounded-md bg-muted/40 animate-pulse" />}>
      <LazyWeekStackedSleepChart {...props} />
    </Suspense>
  );
}

export function WeekStackedWakeChart(props: WeekStackedWakeChartProps) {
  return (
    <Suspense fallback={<div className="h-36 w-full mt-3 rounded-md bg-muted/40 animate-pulse" />}>
      <LazyWeekStackedWakeChart {...props} />
    </Suspense>
  );
}
