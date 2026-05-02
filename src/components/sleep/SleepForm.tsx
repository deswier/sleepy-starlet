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
import InterruptionsEditor, { DraftInterruption, validateInterruptions } from "./InterruptionsEditor";

interface Settings {
  night_start_time: string;
  night_end_time: string;
  show_sleep_place?: boolean;
  show_falling_asleep_method?: boolean;
  show_interruptions?: boolean;
}

interface Props {
  mode: "manual" | "edit";
  sessionId?: string;
  initial?: any;
  onDone: () => void;
}

export default function SleepForm({ mode, sessionId, initial, onDone }: Props) {
  const { t } = useTranslation();
  const { activeChild } = useChildren();
  const { user } = useAuth();
  const [places, setPlaces] = useState<{ id: string; name: string }[]>([]);
  const [methods, setMethods] = useState<{ id: string; name: string }[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);

  const now = new Date();
  const [start, setStart] = useState<Date>(initial?.start_time ? new Date(initial.start_time) : new Date(now.getTime() - 60 * 60 * 1000));
  const [end, setEnd] = useState<Date>(initial?.end_time ? new Date(initial.end_time) : now);
  const [sleepType, setSleepType] = useState<"day" | "night">(initial?.sleep_type ?? "day");
  const [placeId, setPlaceId] = useState<string>(initial?.sleep_place_id ?? "");
  const [methodId, setMethodId] = useState<string>(initial?.settling_method_id ?? "");
  const [comment, setComment] = useState(initial?.comment ?? "");
  const [busy, setBusy] = useState(false);
  const [typeManuallySet, setTypeManuallySet] = useState(mode === "edit");
  const [interruptions, setInterruptions] = useState<DraftInterruption[]>([]);

  useEffect(() => {
    if (!activeChild) return;
    (async () => {
      const [p, m, s] = await Promise.all([
        supabase.from("sleep_places").select("id,name").eq("child_id", activeChild.id).order("name"),
        supabase.from("settling_methods").select("id,name").eq("child_id", activeChild.id).order("name"),
        supabase.from("child_settings").select("night_start_time,night_end_time,show_sleep_place,show_falling_asleep_method,show_interruptions").eq("child_id", activeChild.id).single(),
      ]);
      setPlaces(p.data ?? []);
      setMethods(m.data ?? []);
      if (s.data) setSettings(s.data);
    })();
  }, [activeChild]);

  // Load existing interruptions when editing.
  useEffect(() => {
    if (mode !== "edit" || !sessionId) return;
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
    if (end <= start) { toast.error(t("sleep.endAfterStart")); return; }
    const intrErr = validateInterruptions(interruptions, start, end);
    if (intrErr) { toast.error(t("sleep.interruptionOutsideSleep")); return; }
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

    // Sync interruptions
    if (savedId) {
      const { data: existing } = await supabase
        .from("sleep_interruptions").select("id").eq("sleep_session_id", savedId);
      const keepIds = new Set(interruptions.filter((i) => i.id).map((i) => i.id!));
      const toDelete = (existing ?? []).map((r: any) => r.id).filter((id: string) => !keepIds.has(id));
      if (toDelete.length) {
        await supabase.from("sleep_interruptions").delete().in("id", toDelete);
      }
      for (const it of interruptions) {
        const row = {
          sleep_session_id: savedId,
          start_time: it.start_time.toISOString(),
          end_time: it.end_time ? it.end_time.toISOString() : null,
          settling_method_id: it.settling_method_id,
        };
        if (it.id) {
          await supabase.from("sleep_interruptions").update(row).eq("id", it.id);
        } else {
          await supabase.from("sleep_interruptions").insert({ ...row, created_by_user_id: user.id });
        }
      }
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
                  {methods.map((m) => <SelectItem key={m.id} value={m.id}>{localizeMethod(m.name)}</SelectItem>)}
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
