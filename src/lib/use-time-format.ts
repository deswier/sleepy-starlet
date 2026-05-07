import { useTranslation } from "react-i18next";
import { useAuth } from "@/contexts/AuthContext";
import { formatClockTime, fmtDateTime, formatDuration } from "@/lib/sleep-utils";

/**
 * Returns reactive formatting helpers that respect the user's language and
 * time format preference (system / h12 / h24). Use this in components instead
 * of importing formatClockTime / fmtDateTime / formatDuration directly.
 */
export function useTimeFormat() {
  const { timeFormat } = useAuth();
  const { i18n } = useTranslation();
  const locale = i18n.language ?? "en";

  return {
    fmtTime: (d: Date | string) => formatClockTime(d, locale, timeFormat),
    fmtDateTime: (d: Date | string) => fmtDateTime(d, locale, timeFormat),
    fmtDuration: (minutes: number) => formatDuration(minutes, locale),
  };
}
