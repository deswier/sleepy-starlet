import type { LucideIcon } from "lucide-react";

export type TourId = "history" | "settings";

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
