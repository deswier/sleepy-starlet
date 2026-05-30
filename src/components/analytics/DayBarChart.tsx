import { lazy, Suspense } from "react";
import type { DayBarChartProps } from "./DayBarChartImpl";

export type { DayBarDatum, DayBarChartProps } from "./DayBarChartImpl";

// recharts is heavy (~250KB) and only the weekly comparison charts use it.
// Lazy-load it so the (default) Day tab never pulls recharts into the bundle.
const Impl = lazy(() =>
  import("./DayBarChartImpl").then((m) => ({ default: m.DayBarChart })),
);

export function DayBarChart(props: DayBarChartProps) {
  return (
    <Suspense fallback={<div className="h-24 w-full mt-3 rounded-md bg-muted/40 animate-pulse" />}>
      <Impl {...props} />
    </Suspense>
  );
}
