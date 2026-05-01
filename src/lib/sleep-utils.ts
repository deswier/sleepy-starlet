import { differenceInMinutes, format, isSameDay, startOfDay } from "date-fns";

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
  return differenceInMinutes(end, new Date(s.start_time));
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

export const groupByDay = (sessions: SleepSession[]) => {
  const groups: { date: Date; sessions: SleepSession[] }[] = [];
  for (const s of sessions) {
    const d = startOfDay(new Date(s.start_time));
    const last = groups[groups.length - 1];
    if (last && isSameDay(last.date, d)) last.sessions.push(s);
    else groups.push({ date: d, sessions: [s] });
  }
  return groups;
};

export const formatTime = (iso: string) => format(new Date(iso), "HH:mm");

// Date input formatting for native datetime-local (still ISO-like for the input value)
export const toDateTimeLocalValue = (d: Date): string => {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

// Display format dd.MM.yy HH:mm
export const formatDateTimeDisplay = (d: Date): string => format(d, "dd.MM.yy HH:mm");

// Compute child's age in whole months from a birth date string
export const ageInMonths = (birthDate: string | null | undefined): number | null => {
  if (!birthDate) return null;
  const b = new Date(birthDate);
  const now = new Date();
  let m = (now.getFullYear() - b.getFullYear()) * 12 + (now.getMonth() - b.getMonth());
  if (now.getDate() < b.getDate()) m -= 1;
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
