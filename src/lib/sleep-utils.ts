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
