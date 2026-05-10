import { format, isSameDay, startOfDay } from "date-fns";
import { enUS, ru } from "date-fns/locale";
import i18n from "@/i18n";
import { Capacitor } from "@capacitor/core";
import { SystemTimeFormat } from "@/plugins/system-time-format";

export type TimeFormat = "system" | "h12" | "h24";

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

// locale is optional — falls back to current i18n language so module-level
// callers (e.g. Analytics helper functions) stay reactive on language change.
export const formatDuration = (minutes: number, locale?: string): string => {
  const isRu = (locale ?? i18n.language ?? "en").startsWith("ru");
  const hSuf = isRu ? "ч" : "h";
  const mSuf = isRu ? "м" : "m";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (minutes < 1) return `0${mSuf}`;
  if (h === 0) return `${m}${mSuf}`;
  if (m === 0) return `${h}${hSuf}`;
  return `${h}${hSuf}${String(m).padStart(2, "0")}${mSuf}`;
};

export const sessionDuration = (s: SleepSession, now = new Date()): number => {
  const end = s.end_time ? new Date(s.end_time) : now;
  return Math.round((end.getTime() - new Date(s.start_time).getTime()) / 60000);
};

export const wakeWindowMinutes = (prev: SleepSession, current: SleepSession): number | null => {
  if (!prev.end_time) return null;
  return Math.round(
    (new Date(current.start_time).getTime() - new Date(prev.end_time).getTime()) / 60000
  );
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


// Cached result of the async system time format detection.
// null = not yet initialised (app just started); defaults to 24h (false).
let _system12hCache: boolean | null = null;

// Called once at app startup (main.tsx). On iOS, reads the real system
// 12/24h setting via the native SystemTimeFormatPlugin (Swift).
// On Android/web, uses Intl with the resolved system locale — synchronous,
// so the cache is populated before the first render on those platforms.
// Any failure defaults to 24h.
export async function initSystemTimeFormat(): Promise<void> {
  const platform = Capacitor.getPlatform();
  if (platform === "android" || platform === "ios") {
    // Native call required on both platforms:
    // - Android: DateFormat.is24HourFormat(context) reads Settings.System.TIME_12_24.
    //   Intl in the WebView does not have access to this setting.
    // - iOS: DateFormatter with "j" skeleton reads the system 12/24h preference.
    //   WKWebView does not expose this to Intl either.
    // TODO(ios): native plugin must be registered for iOS — see
    //   src/plugins/ios/SystemTimeFormatPlugin.swift. Until added, the catch
    //   block runs and the cache stays false (24h default).
    try {
      const { value } = await SystemTimeFormat.is12HourFormat();
      _system12hCache = value;
    } catch {
      _system12hCache = detectSystem12hSync();
    }
  } else {
    _system12hCache = detectSystem12hSync();
  }
}

// Sync helper for web/Android — reads hourCycle from the resolved system
// locale. undefined locale lets the JS engine include Android's u-hc-*
// hour-cycle extension, which reflects the device's explicit 12/24h setting
// independently of the display language.
function detectSystem12hSync(): boolean {
  try {
    const { hourCycle, hour12 } = new Intl.DateTimeFormat(undefined, { hour: "numeric" }).resolvedOptions();
    if (hourCycle) return hourCycle === "h11" || hourCycle === "h12";
    return hour12 ?? false;
  } catch {
    return false;
  }
}

// Returns the cached system 12h flag. Falls back to 24h (false) if
// initSystemTimeFormat() has not completed yet or failed.
function detectSystem12h(): boolean {
  return _system12hCache ?? false;
}

// Clock time (HH:mm or h:mm AM/PM) respecting the user's time format preference.
export function formatClockTime(date: Date | string, locale: string, timeFormat: TimeFormat): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const hour12 = timeFormat === "h12" ? true : timeFormat === "h24" ? false : detectSystem12h();
  return new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "2-digit", hour12 }).format(d);
}

// Localized date helpers
export const fmtDate = (d: Date | string) =>
  format(typeof d === "string" ? new Date(d) : d, "dd.MM.yy", { locale: dfLocale() });

// Date + clock time. locale and timeFormat come from the caller (via useTimeFormat hook).
export function fmtDateTime(d: Date | string, locale: string, timeFormat: TimeFormat): string {
  const date = typeof d === "string" ? new Date(d) : d;
  const isRu = locale.startsWith("ru");
  const datePart = format(date, "dd.MM.yy", { locale: isRu ? ru : enUS });
  return `${datePart} ${formatClockTime(date, locale, timeFormat)}`;
}

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
