import type { LucideIcon } from "lucide-react";

export type TourId = "history" | "settings" | "analytics";

export interface TourStep {
  anchor: string;
  titleKey: string;
  bodyKey: string;
  placement?: "top" | "bottom" | "auto";
  icon?: LucideIcon;
}

export interface TourDef {
  id: TourId;
  version: number;
  steps: TourStep[];
}

export const TOURS: Record<TourId, TourDef> = {
  history: {
    id: "history",
    version: 3,
    steps: [
      {
        anchor: "history.session-row",
        titleKey: "tour.history.sessionRow.title",
        bodyKey: "tour.history.sessionRow.body",
        placement: "bottom",
      },
      {
        anchor: "history.ww-bar",
        titleKey: "tour.history.wwBar.title",
        bodyKey: "tour.history.wwBar.body",
        placement: "bottom",
      },
      {
        anchor: "history.summary",
        titleKey: "tour.history.summary.title",
        bodyKey: "tour.history.summary.body",
        placement: "top",
      },
      {
        anchor: "history.add",
        titleKey: "tour.history.add.title",
        bodyKey: "tour.history.add.body",
        placement: "bottom",
      },
    ],
  },
  analytics: {
    id: "analytics",
    version: 2,
    steps: [
      {
        anchor: "analytics.day-chips",
        titleKey: "tour.analytics.dayChips.title",
        bodyKey: "tour.analytics.dayChips.body",
        placement: "bottom",
      },
      {
        anchor: "analytics.week-chart",
        titleKey: "tour.analytics.weekChart.title",
        bodyKey: "tour.analytics.weekChart.body",
        placement: "top",
      },
      {
        anchor: "analytics.heatmap-btn",
        titleKey: "tour.analytics.heatmap.title",
        bodyKey: "tour.analytics.heatmap.body",
        placement: "top",
      },
    ],
  },
  settings: {
    id: "settings",
    version: 1,
    steps: [
      {
        anchor: "settings.night-window",
        titleKey: "tour.settings.nightWindow.title",
        bodyKey: "tour.settings.nightWindow.body",
        placement: "bottom",
      },
      {
        anchor: "settings.family-invite",
        titleKey: "tour.settings.familyInvite.title",
        bodyKey: "tour.settings.familyInvite.body",
        placement: "top",
      },
    ],
  },
};
