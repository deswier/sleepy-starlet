import { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import DateTimeField from "@/components/DateTimeField";
import { useTranslation } from "react-i18next";
import { localizeMethod } from "@/lib/localize-default";

export interface DraftInterruption {
  id?: string; // existing DB id
  start_time: Date;
  end_time: Date | null;
  settling_method_id: string | null;
}

interface Props {
  value: DraftInterruption[];
  onChange: (next: DraftInterruption[]) => void;
  methods: { id: string; name: string }[];
  showMethod: boolean;
  /** Sleep bounds for validation; end may be null while sleep is active. */
  sleepStart: Date;
  sleepEnd: Date | null;
  onValidationError?: (msg: string | null) => void;
}

export default function InterruptionsEditor({
  value, onChange, methods, showMethod, sleepStart, sleepEnd,
}: Props) {
  const { t } = useTranslation();
  const [error, setError] = useState<string | null>(null);

  const validate = (list: DraftInterruption[]): string | null => {
    for (const i of list) {
      if (i.start_time < sleepStart) return t("sleep.interruptionOutsideSleep");
      if (sleepEnd && i.start_time > sleepEnd) return t("sleep.interruptionOutsideSleep");
      if (i.end_time) {
        if (i.end_time < i.start_time) return t("sleep.endAfterStart");
        if (sleepEnd && i.end_time > sleepEnd) return t("sleep.interruptionOutsideSleep");
      }
    }
    return null;
  };

  useEffect(() => { setError(validate(value)); }, [value, sleepStart, sleepEnd?.getTime()]);

  const update = (idx: number, patch: Partial<DraftInterruption>) => {
    const next = value.map((it, i) => (i === idx ? { ...it, ...patch } : it));
    onChange(next);
  };
  const add = () => {
    const start = new Date(Math.max(sleepStart.getTime(), Date.now() - 60_000));
    const end = sleepEnd ? new Date(Math.min(sleepEnd.getTime(), start.getTime() + 5 * 60_000)) : new Date(start.getTime() + 5 * 60_000);
    onChange([...value, { start_time: start, end_time: end, settling_method_id: null }]);
  };
  const remove = (idx: number) => onChange(value.filter((_, i) => i !== idx));

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label>{t("sleep.interruptions")}</Label>
        <Button type="button" variant="ghost" size="sm" onClick={add}>
          <Plus className="w-4 h-4 mr-1" /> {t("common.add")}
        </Button>
      </div>
      {value.length === 0 && (
        <p className="text-xs text-muted-foreground">{t("sleep.noInterruptions")}</p>
      )}
      {value.map((it, idx) => (
        <div key={idx} className="rounded-lg border border-border/60 p-3 space-y-2 bg-muted/30">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">
              {t("sleep.interruptions")} #{idx + 1}
            </span>
            <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-destructive"
              onClick={() => remove(idx)} aria-label={t("common.delete")}>
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
          <DateTimeField label={t("sleep.start")} value={it.start_time}
            onChange={(d) => update(idx, { start_time: d })} />
          <DateTimeField label={t("sleep.end")} value={it.end_time ?? new Date()}
            onChange={(d) => update(idx, { end_time: d })} />
          {showMethod && methods.length > 0 && (
            <div className="space-y-1">
              <Label>{t("sleep.settling")}</Label>
              <Select value={it.settling_method_id || "none"}
                onValueChange={(v) => update(idx, { settling_method_id: v === "none" ? null : v })}>
                <SelectTrigger><SelectValue placeholder={t("common.select")} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{t("common.none")}</SelectItem>
                  {methods.map((m) => (
                    <SelectItem key={m.id} value={m.id}>{localizeMethod(m.name)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
      ))}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

export function validateInterruptions(
  list: DraftInterruption[], sleepStart: Date, sleepEnd: Date | null,
): string | null {
  for (const i of list) {
    if (i.start_time < sleepStart) return "outside";
    if (sleepEnd && i.start_time > sleepEnd) return "outside";
    if (i.end_time) {
      if (i.end_time < i.start_time) return "endBeforeStart";
      if (sleepEnd && i.end_time > sleepEnd) return "outside";
    }
  }
  return null;
}