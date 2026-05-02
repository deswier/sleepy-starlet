import { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import DateTimeField from "@/components/DateTimeField";
import { useTranslation } from "react-i18next";
import { localizeMethod } from "@/lib/localize-default";
import { MethodOptionLabel } from "@/lib/method-icons";
import { formatDuration } from "@/lib/sleep-utils";
import { differenceInMinutes } from "date-fns";
import { cn } from "@/lib/utils";

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
  const [invalidIdx, setInvalidIdx] = useState<Set<number>>(new Set());

  const validateAll = (list: DraftInterruption[]): { msg: string | null; bad: Set<number> } => {
    const bad = new Set<number>();
    let msg: string | null = null;
    list.forEach((i, idx) => {
      if (i.start_time < sleepStart || (sleepEnd && i.start_time > sleepEnd)) {
        bad.add(idx); msg = msg ?? t("sleep.interruptionOutsideSleep");
      }
      if (i.end_time && i.end_time < i.start_time) {
        bad.add(idx); msg = msg ?? t("sleep.endAfterStart");
      }
      if (i.end_time && sleepEnd && i.end_time > sleepEnd) {
        bad.add(idx); msg = msg ?? t("sleep.interruptionOutsideSleep");
      }
    });
    // Overlap detection: highlight only the later (offending) interruption,
    // sorted by start_time, so a previously valid entry stays unmarked.
    const order = list
      .map((it, idx) => ({ idx, s: it.start_time.getTime(), e: (it.end_time ?? it.start_time).getTime() }))
      .sort((a, b) => a.s - b.s);
    for (let p = 0; p < order.length; p++) {
      for (let q = 0; q < p; q++) {
        const a = order[q]; const b = order[p];
        const aZero = a.s === a.e;
        const bZero = b.s === b.e;
        let conflict = false;
        if (aZero && bZero) conflict = a.s === b.s;
        else if (aZero) conflict = a.s >= b.s && a.s <= b.e;
        else if (bZero) conflict = b.s >= a.s && b.s <= a.e;
        else conflict = a.s < b.e && b.s < a.e;
        if (conflict) {
          bad.add(b.idx);
          msg = msg ?? t("sleep.interruptionOverlap");
          break;
        }
      }
    }
    return { msg, bad };
  };

  useEffect(() => {
    const r = validateAll(value);
    setError(r.msg); setInvalidIdx(r.bad);
  }, [value, sleepStart, sleepEnd?.getTime()]);

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

  const durationLabel = (it: DraftInterruption): string => {
    if (!it.end_time) return t("sleep.active");
    const m = Math.max(0, differenceInMinutes(it.end_time, it.start_time));
    return m === 0 ? "0m" : formatDuration(m);
  };

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
        <div key={idx} className={cn(
          "rounded-lg border p-3 space-y-2",
          invalidIdx.has(idx)
            ? "border-destructive/50 bg-destructive/10"
            : "border-border/60 bg-muted/30",
        )}>
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">
              {t("sleep.interruptions")} #{idx + 1} · {durationLabel(it)}
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
                    <SelectItem key={m.id} value={m.id}>
                      <MethodOptionLabel name={m.name} label={localizeMethod(m.name)} />
                    </SelectItem>
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
  for (let idx = 0; idx < list.length; idx++) {
    const i = list[idx];
    if (i.start_time < sleepStart) return "outside";
    if (sleepEnd && i.start_time > sleepEnd) return "outside";
    if (i.end_time) {
      if (i.end_time < i.start_time) return "endBeforeStart";
      if (sleepEnd && i.end_time > sleepEnd) return "outside";
    }
    for (let jdx = idx + 1; jdx < list.length; jdx++) {
      const j = list[jdx];
      const aS = i.start_time.getTime();
      const aE = (i.end_time ?? i.start_time).getTime();
      const bS = j.start_time.getTime();
      const bE = (j.end_time ?? j.start_time).getTime();
      const aZero = aS === aE;
      const bZero = bS === bE;
      let conflict = false;
      if (aZero && bZero) conflict = aS === bS;
      else if (aZero) conflict = aS >= bS && aS <= bE;
      else if (bZero) conflict = bS >= aS && bS <= aE;
      else conflict = aS < bE && bS < aE;
      if (conflict) return "overlap";
    }
  }
  return null;
}