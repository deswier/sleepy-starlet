import { useEffect, useMemo, useState } from "react";
import type { DateRange } from "react-day-picker";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { ChevronDown, Copy, Download, Loader2 } from "lucide-react";
import { addDays, startOfDay, subDays, differenceInCalendarDays, format } from "date-fns";
import { enUS, ru } from "date-fns/locale";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Textarea } from "@/components/ui/textarea";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogDescription,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
} from "@/components/ui/responsive-dialog";
import { devError } from "@/lib/logger";
import {
  fetchSleepForExport,
  buildSleepCsv,
  shareOrDownloadCsv,
} from "@/lib/export-sleep";

interface Props {
  childId: string;
  birthDate: string;
}

const PRESETS = [7, 14, 30] as const;

export default function ExportSleepDialog({ childId, birthDate }: Props) {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const [range, setRange] = useState<DateRange | undefined>();
  const [busy, setBusy] = useState(false);

  const locale = i18n.language.startsWith("ru") ? ru : enUS;
  const today = startOfDay(new Date());

  // Auto-fill the child's age (in whole weeks) into the AI prompt; the parent
  // edits the remaining [bracketed] fields before copying. Reset on language
  // or age change.
  const ageWeeks = Math.max(
    0,
    Math.floor(differenceInCalendarDays(new Date(), new Date(birthDate)) / 7),
  );
  const promptTemplate = useMemo(() => {
    const age = t("analytics.export.prompt.ageWeeks", { count: ageWeeks });
    return t("analytics.export.prompt.template", { age });
  }, [t, ageWeeks]);
  const [promptText, setPromptText] = useState(promptTemplate);
  useEffect(() => setPromptText(promptTemplate), [promptTemplate]);

  const copyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(promptText);
      toast.success(t("analytics.export.prompt.copied"));
    } catch {
      toast.error(t("common.loadFailed"));
    }
  };

  const setPreset = (days: number) =>
    setRange({ from: subDays(today, days - 1), to: today });

  const onExport = async () => {
    if (!range?.from) return;
    const from = startOfDay(range.from);
    // Single-day selection: `to` may be undefined — treat it as the same day.
    const to = addDays(startOfDay(range.to ?? range.from), 1);

    setBusy(true);
    try {
      const sessions = await fetchSleepForExport(childId, from, to);
      if (sessions.length === 0) {
        toast.info(t("analytics.export.empty"));
        return;
      }
      const csv = buildSleepCsv(sessions, t);
      const stamp = `${format(from, "yyyyMMdd")}-${format(subDays(to, 1), "yyyyMMdd")}`;
      const result = await shareOrDownloadCsv(
        `lullaby-sleep-${stamp}.csv`,
        csv,
        t("analytics.export.shareTitle"),
      );
      if (result === "cancelled") return;
      toast.success(
        t("analytics.export.done", { count: sessions.length }),
      );
      setOpen(false);
    } catch (e) {
      devError("sleep export failed", e);
      toast.error(t("common.loadFailed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <ResponsiveDialog open={open} onOpenChange={setOpen}>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label={t("analytics.export.action")}
        onClick={() => setOpen(true)}
      >
        <Download className="h-5 w-5" />
      </Button>

      <ResponsiveDialogContent className="max-w-sm">
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle>{t("analytics.export.title")}</ResponsiveDialogTitle>
          <ResponsiveDialogDescription>
            {t("analytics.export.subtitle")}
          </ResponsiveDialogDescription>
        </ResponsiveDialogHeader>

        <div className="px-4 pb-4 space-y-4 max-h-[70vh] overflow-y-auto">
          <div className="flex flex-wrap gap-2">
            {PRESETS.map((d) => (
              <Button
                key={d}
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => setPreset(d)}
              >
                {t("analytics.export.lastDays", { count: d })}
              </Button>
            ))}
          </div>

          <div className="flex justify-center">
            <Calendar
              mode="range"
              selected={range}
              onSelect={setRange}
              locale={locale}
              disabled={{ after: today }}
              numberOfMonths={1}
            />
          </div>

          <Button
            type="button"
            className="w-full"
            disabled={!range?.from || busy}
            onClick={onExport}
          >
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4 mr-2" />
            )}
            {t("analytics.export.action")}
          </Button>

          <Collapsible>
            <CollapsibleTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="w-full justify-between"
              >
                {t("analytics.export.prompt.show")}
                <ChevronDown className="h-4 w-4" />
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-2 pt-2">
              <p className="text-xs text-muted-foreground">
                {t("analytics.export.prompt.hint")}
              </p>
              <Textarea
                value={promptText}
                onChange={(e) => setPromptText(e.target.value)}
                rows={8}
                className="text-xs leading-relaxed"
              />
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="w-full"
                onClick={copyPrompt}
              >
                <Copy className="h-4 w-4 mr-2" />
                {t("analytics.export.prompt.copy")}
              </Button>
            </CollapsibleContent>
          </Collapsible>
        </div>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}
