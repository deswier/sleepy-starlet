import { useState, useEffect } from "react";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { supabase } from "@/integrations/supabase/client";
import { useChildren } from "@/contexts/ChildContext";
import { useAuth } from "@/contexts/AuthContext";
import { inferSleepType } from "@/lib/sleep-utils";
import { toast } from "sonner";
import DateTimeField from "@/components/DateTimeField";
import { useTranslation } from "react-i18next";
import { enqueue } from "@/lib/offline-queue";
import { localizePlace, localizeMethod } from "@/lib/localize-default";
import { MethodOptionLabel } from "@/lib/method-icons";
import InterruptionsEditor, { DraftInterruption, validateInterruptions } from "./InterruptionsEditor";


interface Props {
  mode: "manual" | "edit";
  sessionId?: string;
  initial?: any;
  onDone: () => void;
  /** Default calendar day for a new manual entry (time defaults preserved). */
  defaultDate?: Date;
  /**
   * Pre-populated interruptions — skips the DB fetch when the caller already
   * has them (e.g. the wake-up confirmation modal that builds a draft in
   * local state to avoid modifying the DB before the user confirms).
   */
  initialInterruptions?: DraftInterruption[];
}

export default function SleepForm({ mode, sessionId, initial, onDone, defaultDate, initialInterruptions }: Props) {
  const { t } = useTranslation();
  const { activeChild, settings } = useChildren();
  const { user } = useAuth();
  const [places, setPlaces] = useState<{ id: string; name: string }[]>([]);
  const [methods, setMethods] = useState<{ id: string; name: string }[]>([]);

  const now = new Date();
  const computeDefaults = () => {
    if (initial?.start_time) {
      return {
        s: new Date(initial.start_time),
        e: initial.end_time ? new Date(initial.end_time) : now,
      };
    }
    if (defaultDate) {
      // Use the chosen day with a sensible default time (13:00 → 14:00).
      const s = new Date(defaultDate);
      s.setHours(13, 0, 0, 0);
      const e = new Date(s.getTime() + 60 * 60 * 1000);
      return { s, e };
    }
    return { s: new Date(now.getTime() - 60 * 60 * 1000), e: now };
  };
  const def = computeDefaults();
  const [start, setStart] = useState<Date>(def.s);
  const [end, setEnd] = useState<Date>(def.e);
  const [sleepType, setSleepType] = useState<"day" | "night">(initial?.sleep_type ?? "day");
  const [placeId, setPlaceId] = useState<string>(initial?.sleep_place_id ?? "");
  const [methodId, setMethodId] = useState<string>(initial?.settling_method_id ?? "");
  const [comment, setComment] = useState(initial?.comment ?? "");
  const [busy, setBusy] = useState(false);
  const [typeManuallySet, setTypeManuallySet] = useState(mode === "edit");
  const [interruptions, setInterruptions] = useState<DraftInterruption[]>(initialInterruptions ?? []);

  useEffect(() => {
    if (!activeChild) return;
    Promise.all([
      supabase.from("sleep_places").select("id,name").eq("child_id", activeChild.id).is("deleted_at", null).order("name"),
      supabase.from("settling_methods").select("id,name").eq("child_id", activeChild.id).is("deleted_at", null).order("name"),
    ]).then(([p, m]) => {
      setPlaces(p.data ?? []);
      setMethods(m.data ?? []);
    });
  }, [activeChild?.id]);

  // Load interruptions from DB when editing, unless the caller pre-populated
  // them via initialInterruptions (skip the round-trip in that case).
  useEffect(() => {
    if (mode !== "edit" || !sessionId || initialInterruptions) return;
    (async () => {
      const { data } = await supabase
        .from("sleep_interruptions")
        .select("id,start_time,end_time,settling_method_id")
        .eq("sleep_session_id", sessionId)
        .order("start_time");
      setInterruptions((data ?? []).map((r: any) => ({
        id: r.id,
        start_time: new Date(r.start_time),
        end_time: r.end_time ? new Date(r.end_time) : null,
        settling_method_id: r.settling_method_id,
      })));
    })();
  }, [mode, sessionId]);

  useEffect(() => {
    if (!typeManuallySet && settings) {
      setSleepType(inferSleepType(start, settings.night_start_time, settings.night_end_time));
    }
  }, [start, settings, typeManuallySet]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeChild || !user) return;
    const submitNow = new Date();
    if (start > submitNow) { toast.error(t("sleep.startNotFuture")); return; }
    if (end > submitNow) { toast.error(t("sleep.endNotFuture")); return; }
    if (end <= start) { toast.error(t("sleep.endAfterStart")); return; }
    const intrErr = validateInterruptions(interruptions, start, end);
    if (intrErr) {
      toast.error(
        intrErr === "overlap" ? t("sleep.interruptionOverlap")
          : intrErr === "endBeforeStart" ? t("sleep.endAfterStart")
          : t("sleep.interruptionOutsideSleep"),
      );
      return;
    }
    // Overlap check (skip when offline — enforced server-side too could be added later)
    if (navigator.onLine) {
      const { data: overlap } = await supabase.rpc("sleep_overlaps", {
        _child_id: activeChild.id,
        _start: start.toISOString(),
        _end: end.toISOString(),
        _exclude_id: mode === "edit" && sessionId ? sessionId : null,
      });
      if (overlap === true) { toast.error(t("sleep.overlap")); return; }
    }
    setBusy(true);
    const payload = {
      child_id: activeChild.id,
      start_time: start.toISOString(),
      end_time: end.toISOString(),
      sleep_type: sleepType,
      sleep_place_id: placeId || null,
      settling_method_id: methodId || null,
      comment: comment || null,
      updated_by_user_id: user.id,
    };

    if (!navigator.onLine) {
      if (mode === "edit" && sessionId) {
        await enqueue({
          table: "sleep_sessions", op: "update",
          payload, match: { id: sessionId },
          baseUpdatedAt: initial?.updated_at ?? null,
        });
      } else {
        await enqueue({
          table: "sleep_sessions", op: "insert",
          payload: { ...payload, created_by_user_id: user.id },
        });
      }
      setBusy(false);
      toast.success(mode === "edit" ? t("sleep.updated") : t("sleep.sleepAdded"));
      onDone();
      return;
    }

    let savedId = sessionId ?? null;
    if (mode === "edit" && sessionId) {
      const { error } = await supabase.from("sleep_sessions").update(payload).eq("id", sessionId);
      if (error) { setBusy(false); toast.error(error.message); return; }
    } else {
      const { data, error } = await supabase.from("sleep_sessions")
        .insert({ ...payload, created_by_user_id: user.id }).select("id").single();
      if (error) { setBusy(false); toast.error(error.message); return; }
      savedId = data?.id ?? null;
    }

    // Sync interruptions atomically via RPC — single transaction, no N+1.
    // Replaces: fetch existing ids → delete missing → loop upsert (non-atomic).
    if (savedId) {
      const { error: syncErr } = await supabase.rpc("sync_session_interruptions", {
        _session_id: savedId,
        _interruptions: interruptions.map((it) => ({
          id: it.id ?? null,
          start_time: it.start_time.toISOString(),
          end_time: it.end_time ? it.end_time.toISOString() : null,
          settling_method_id: it.settling_method_id ?? null,
        })),
      });
      if (syncErr) { setBusy(false); toast.error(syncErr.message); return; }
    }
    setBusy(false);
    toast.success(mode === "edit" ? t("sleep.updated") : t("sleep.sleepAdded"));
    onDone();
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="space-y-3">
        <DateTimeField label={t("sleep.start")} value={start} onChange={setStart} />
        <DateTimeField label={t("sleep.end")} value={end} onChange={setEnd} />
      </div>

      {settings?.show_interruptions !== false && (
        <InterruptionsEditor
          value={interruptions}
          onChange={setInterruptions}
          methods={methods}
          showMethod={settings?.show_falling_asleep_method !== false}
          sleepStart={start}
          sleepEnd={end}
        />
      )}

      <Collapsible>
        <CollapsibleTrigger className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground py-2">
          <ChevronDown className="w-4 h-4" /> {t("sleep.additional")}
        </CollapsibleTrigger>
        <CollapsibleContent className="space-y-4 pt-2">
          <div>
            <Label>{t("sleep.type")}</Label>
            <Select value={sleepType} onValueChange={(v: any) => { setSleepType(v); setTypeManuallySet(true); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="day">{t("sleep.day")}</SelectItem>
                <SelectItem value="night">{t("sleep.night")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {settings?.show_sleep_place !== false && (
            <div>
              <Label>{t("sleep.place")}</Label>
              <Select value={placeId || "none"} onValueChange={(v) => setPlaceId(v === "none" ? "" : v)}>
                <SelectTrigger><SelectValue placeholder={t("common.select")} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{t("common.none")}</SelectItem>
                  {places.map((p) => <SelectItem key={p.id} value={p.id}>{localizePlace(p.name)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          {settings?.show_falling_asleep_method !== false && (
            <div>
              <Label>{t("sleep.settling")}</Label>
              <Select value={methodId || "none"} onValueChange={(v) => setMethodId(v === "none" ? "" : v)}>
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
          <div>
            <Label>{t("sleep.comment")}</Label>
            <Textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={2} />
          </div>
        </CollapsibleContent>
      </Collapsible>

      <Button type="submit" className="w-full" disabled={busy}>
        {mode === "edit" ? t("common.save") : t("sleep.addSleep")}
      </Button>
    </form>
  );
}
