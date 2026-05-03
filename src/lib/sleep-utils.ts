import { differenceInMinutes, format, isSameDay, startOfDay } from "date-fns";
import { enUS, ru } from "date-fns/locale";
import i18n from "@/i18n";

const dfLocale = () => (i18n.language?.startsWith("ru") ? ru : enUS);

export interface SleepSession {
  id: string;
  child_id: string;
  start_time: string;
  end_time: string | null;
  sleep_type: "day" | "night";
  sleep_place_id: string | null;
  settling_method_id: string | null;
  comment: string | null;
  created_by_user_id: string | null;
}

export const formatDuration = (minutes: number): string => {
  if (minutes < 1) return "<1m";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
};

export const sessionDuration = (s: SleepSession, now = new Date()): number => {
  const end = s.end_time ? new Date(s.end_time) : now;
  return Math.round((end.getTime() - new Date(s.start_time).getTime()) / 60000);
};

export const wakeWindowMinutes = (prev: SleepSession, current: SleepSession): number | null => {
  if (!prev.end_time) return null;
  return differenceInMinutes(new Date(current.start_time), new Date(prev.end_time));
};

export const wwStatus = (
  ww: number,
  min: number,
  max: number
): "good" | "warn" => {
  return ww >= min && ww <= max ? "good" : "warn";
};

/**
 * Compute the default age-based WW thresholds at `evaluationDate`.
 * Wake windows are always derived from the child's age — no custom rules.
 */
export const wwThresholdsAt = (
  evaluationDate: Date,
  birthDate: string | null,
): { min: number; max: number } | null => {
  if (!birthDate) return null;
  const months = ageInMonthsAt(birthDate, evaluationDate);
  if (months === null) return null;
  return wakeWindowForAge(months);
};

export const inferSleepType = (
  startTime: Date,
  nightStart: string,
  nightEnd: string
): "day" | "night" => {
  const [nsH, nsM] = nightStart.split(":").map(Number);
  const [neH, neM] = nightEnd.split(":").map(Number);
  const minutes = startTime.getHours() * 60 + startTime.getMinutes();
  const nsMin = nsH * 60 + nsM;
  const neMin = neH * 60 + neM;
  if (nsMin < neMin) return minutes >= nsMin && minutes < neMin ? "night" : "day";
  return minutes >= nsMin || minutes < neMin ? "night" : "day";
};


export const formatTime = (iso: string) => format(new Date(iso), "HH:mm");

// Localized date helpers (dd.MM.yy and dd.MM.yy HH:mm)
export const fmtDate = (d: Date | string) =>
  format(typeof d === "string" ? new Date(d) : d, "dd.MM.yy", { locale: dfLocale() });
export const fmtDateTime = (d: Date | string) =>
  format(typeof d === "string" ? new Date(d) : d, "dd.MM.yy HH:mm", { locale: dfLocale() });
export const fmtWeekday = (d: Date) => format(d, "EEEE, dd.MM.yy", { locale: dfLocale() });


// Compute child's age in whole months from a birth date string
export const ageInMonths = (birthDate: string | null | undefined): number | null => {
  return ageInMonthsAt(birthDate, new Date());
};

// Age in whole months at a specific date (for historical WW evaluation).
export const ageInMonthsAt = (
  birthDate: string | null | undefined,
  at: Date,
): number | null => {
  if (!birthDate) return null;
  const b = new Date(birthDate);
  let m = (at.getFullYear() - b.getFullYear()) * 12 + (at.getMonth() - b.getMonth());
  if (at.getDate() < b.getDate()) m -= 1;
  return Math.max(0, m);
};

// Map age in months to default wake window range (in minutes)
export const wakeWindowForAge = (months: number): { min: number; max: number } => {
  const table: { upTo: number; min: number; max: number }[] = [
    { upTo: 1, min: 30, max: 60 },
    { upTo: 2, min: 45, max: 75 },
    { upTo: 3, min: 60, max: 90 },
    { upTo: 4, min: 75, max: 120 },
    { upTo: 5, min: 90, max: 150 },
    { upTo: 6, min: 120, max: 165 },
    { upTo: 7, min: 135, max: 180 },
    { upTo: 8, min: 150, max: 195 },
    { upTo: 10, min: 180, max: 210 },
    { upTo: 12, min: 180, max: 240 },
    { upTo: 15, min: 210, max: 270 },
    { upTo: 18, min: 270, max: 330 },
    { upTo: 24, min: 300, max: 360 },
  ];
  for (const row of table) if (months < row.upTo) return { min: row.min, max: row.max };
  return { min: 300, max: 360 };
};
