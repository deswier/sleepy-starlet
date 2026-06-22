// Sleep data export for AI/spreadsheet analysis. Pulls a date range of
// sessions (with localized place/method names + interruptions) and renders a
// flat CSV. Delivery prefers the native share sheet (Web Share API with a
// File — works on mobile browsers and the Capacitor webview) and falls back to
// a Blob download on desktop.

import { supabase } from "@/integrations/supabase/client";
import { localizePlace, localizeMethod } from "@/lib/localize-default";
import { isNative } from "@/lib/native";
import { format, startOfDay, addDays, subDays, isSameDay } from "date-fns";

export interface NightWindow {
  start: string; // "HH:MM"
  end: string;
}

type TFn = (key: string, opts?: Record<string, unknown>) => string;

export interface ExportSession {
  start_time: string;
  end_time: string | null;
  sleep_type: "day" | "night";
  comment: string | null;
  sleep_place: { name: string } | null;
  settling_method: { name: string } | null;
  interruptions: { start_time: string; end_time: string | null }[];
}

const diffMin = (a: string, b: string) =>
  Math.round((new Date(b).getTime() - new Date(a).getTime()) / 60000);

function parseHM(hm: string): [number, number] {
  const [h, m] = hm.split(":").map(Number);
  return [h || 0, m || 0];
}

// Returns the calendar day a session is attributed to — mirrors sessionDay()
// in Analytics.tsx. Evening night sessions (start ≥ night_start, before
// midnight) belong to the NEXT day (when splitByDate is false).
function attributedDay(s: ExportSession, night: NightWindow, splitByDate: boolean): Date {
  const start = new Date(s.start_time);
  if (splitByDate || s.sleep_type !== "night") return startOfDay(start);
  const [nsH, nsM] = parseHM(night.start);
  const startMin = start.getHours() * 60 + start.getMinutes();
  const nsMin = nsH * 60 + nsM;
  if (startMin >= nsMin && startMin >= 12 * 60) {
    if (!s.end_time) return startOfDay(addDays(start, 1));
    const end = new Date(s.end_time);
    if (!isSameDay(start, end)) return startOfDay(end);
  }
  return startOfDay(start);
}

// Range is [from, to) — `to` is already the exclusive upper bound (next day's
// start). When splitByDate is false, night sessions that started the evening
// before `from` can be attributed to the first selected day, so we fetch one
// extra day back and then filter by attributed day.
export async function fetchSleepForExport(
  childId: string,
  from: Date,
  to: Date,
  night: NightWindow,
  splitByDate: boolean,
): Promise<ExportSession[]> {
  // Fetch 1 extra day before `from` to catch evening night sessions that
  // belong to the first selected day (start 21:30, end next morning).
  const queryFrom = splitByDate ? from : subDays(from, 1);

  const { data, error } = await supabase
    .from("sleep_sessions")
    .select(`
      start_time, end_time, sleep_type, comment,
      sleep_place:sleep_places(name),
      settling_method:settling_methods(name),
      interruptions:sleep_interruptions(start_time,end_time)
    `)
    .eq("child_id", childId)
    .gte("start_time", queryFrom.toISOString())
    .lt("start_time", to.toISOString())
    .order("start_time", { ascending: true });
  if (error) throw error;

  const sessions = (data ?? []) as unknown as ExportSession[];

  // Keep only sessions whose attributed analytics day falls within [from, to).
  const fromMs = from.getTime();
  const toMs = to.getTime();
  return sessions.filter((s) => {
    const day = attributedDay(s, night, splitByDate).getTime();
    return day >= fromMs && day < toMs;
  });
}

const escapeCell = (v: string): string => {
  const e = v.replace(/"/g, '""');
  return /[",\r\n]/.test(v) ? `"${e}"` : e;
};

// Local clock times (yyyy-MM-dd / HH:mm) — friendlier than UTC ISO for both
// spreadsheet users and AI prompts, since the caregiver thinks in local time.
export function buildSleepCsv(sessions: ExportSession[], t: TFn): string {
  const headers = [
    t("analytics.export.col.date"),
    t("analytics.export.col.start"),
    t("analytics.export.col.end"),
    t("analytics.export.col.durationMin"),
    t("analytics.export.col.type"),
    t("analytics.export.col.place"),
    t("analytics.export.col.method"),
    t("analytics.export.col.interruptions"),
    t("analytics.export.col.interruptionMin"),
    t("analytics.export.col.wakeWindowMin"),
    t("analytics.export.col.comment"),
  ];

  const typeLabel = (ty: ExportSession["sleep_type"]) =>
    ty === "night" ? t("analytics.export.night") : t("analytics.export.day");

  const rows: string[][] = [];
  let prevEnd: string | null = null;
  for (const s of sessions) {
    const intrs = s.interruptions ?? [];
    const intrMin = intrs.reduce(
      (acc, i) => acc + (i.end_time ? diffMin(i.start_time, i.end_time) : 0),
      0,
    );
    const ww = prevEnd ? Math.max(0, diffMin(prevEnd, s.start_time)) : "";
    rows.push([
      format(new Date(s.start_time), "yyyy-MM-dd"),
      format(new Date(s.start_time), "HH:mm"),
      s.end_time ? format(new Date(s.end_time), "HH:mm") : "",
      s.end_time ? String(diffMin(s.start_time, s.end_time)) : "",
      typeLabel(s.sleep_type),
      s.sleep_place?.name ? localizePlace(s.sleep_place.name) : "",
      s.settling_method?.name ? localizeMethod(s.settling_method.name) : "",
      String(intrs.length),
      String(intrMin),
      ww === "" ? "" : String(ww),
      s.comment ?? "",
    ]);
    if (s.end_time) prevEnd = s.end_time;
  }

  const lines = [headers, ...rows].map((r) => r.map(escapeCell).join(","));
  // BOM so Excel reads UTF-8 (Cyrillic) correctly.
  return "﻿" + lines.join("\r\n");
}

export type DeliveryResult = "shared" | "downloaded" | "cancelled";

export async function shareOrDownloadCsv(
  filename: string,
  csv: string,
  title: string,
): Promise<DeliveryResult> {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });

  // Native (Capacitor) only: open the system share sheet. On web/desktop we
  // always download a file — that's what users expect there.
  if (isNative()) {
    const file = new File([blob], filename, { type: "text/csv" });
    const nav = navigator as Navigator & {
      canShare?: (data?: ShareData) => boolean;
      share?: (data?: ShareData) => Promise<void>;
    };
    if (nav.canShare?.({ files: [file] }) && nav.share) {
      try {
        await nav.share({ files: [file], title });
        return "shared";
      } catch (e) {
        // User dismissed the share sheet — don't fall through to a download.
        if ((e as Error)?.name === "AbortError") return "cancelled";
        // Any other failure: fall back to download below.
      }
    }
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  return "downloaded";
}
