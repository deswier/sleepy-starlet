import { useState, useEffect } from "react";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { supabase } from "@/integrations/supabase/client";
import { useChildren } from "@/contexts/ChildContext";
import { useAuth } from "@/contexts/AuthContext";
import { inferSleepType } from "@/lib/sleep-utils";
import { format } from "date-fns";
import { toast } from "sonner";

interface Settings {
  night_start_time: string;
  night_end_time: string;
}

interface Props {
  mode: "manual" | "edit";
  sessionId?: string;
  initial?: any;
  onDone: () => void;
}

export default function SleepForm({ mode, sessionId, initial, onDone }: Props) {
  const { activeChild } = useChildren();
  const { user } = useAuth();
  const [places, setPlaces] = useState<{ id: string; name: string }[]>([]);
  const [methods, setMethods] = useState<{ id: string; name: string }[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);

  const fmt = (d: Date) => format(d, "yyyy-MM-dd'T'HH:mm");
  const now = new Date();
  const [start, setStart] = useState(initial?.start_time ? fmt(new Date(initial.start_time)) : fmt(new Date(now.getTime() - 60 * 60 * 1000)));
  const [end, setEnd] = useState(initial?.end_time ? fmt(new Date(initial.end_time)) : fmt(now));
  const [sleepType, setSleepType] = useState<"day" | "night">(initial?.sleep_type ?? "day");
  const [placeId, setPlaceId] = useState<string>(initial?.sleep_place_id ?? "");
  const [methodId, setMethodId] = useState<string>(initial?.settling_method_id ?? "");
  const [comment, setComment] = useState(initial?.comment ?? "");
  const [busy, setBusy] = useState(false);
  const [typeManuallySet, setTypeManuallySet] = useState(mode === "edit");

  useEffect(() => {
    if (!activeChild) return;
    (async () => {
      const [p, m, s] = await Promise.all([
        supabase.from("sleep_places").select("id,name").eq("child_id", activeChild.id).order("name"),
        supabase.from("settling_methods").select("id,name").eq("child_id", activeChild.id).order("name"),
        supabase.from("child_settings").select("night_start_time,night_end_time").eq("child_id", activeChild.id).single(),
      ]);
      setPlaces(p.data ?? []);
      setMethods(m.data ?? []);
      if (s.data) setSettings(s.data);
    })();
  }, [activeChild]);

  useEffect(() => {
    if (!typeManuallySet && settings) {
      setSleepType(inferSleepType(new Date(start), settings.night_start_time, settings.night_end_time));
    }
  }, [start, settings, typeManuallySet]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeChild || !user) return;
    setBusy(true);
    const payload = {
      child_id: activeChild.id,
      start_time: new Date(start).toISOString(),
      end_time: new Date(end).toISOString(),
      sleep_type: sleepType,
      sleep_place_id: placeId || null,
      settling_method_id: methodId || null,
      comment: comment || null,
      updated_by_user_id: user.id,
    };
    const { error } = mode === "edit" && sessionId
      ? await supabase.from("sleep_sessions").update(payload).eq("id", sessionId)
      : await supabase.from("sleep_sessions").insert({ ...payload, created_by_user_id: user.id });
    setBusy(false);
    if (error) toast.error(error.message);
    else { toast.success(mode === "edit" ? "Updated" : "Sleep added"); onDone(); }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div><Label>Start</Label>
          <Input type="datetime-local" required value={start} onChange={(e) => setStart(e.target.value)} /></div>
        <div><Label>End</Label>
          <Input type="datetime-local" required value={end} onChange={(e) => setEnd(e.target.value)} /></div>
      </div>
      <div>
        <Label>Sleep type</Label>
        <Select value={sleepType} onValueChange={(v: any) => { setSleepType(v); setTypeManuallySet(true); }}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="day">Day sleep</SelectItem>
            <SelectItem value="night">Night sleep</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Collapsible>
        <CollapsibleTrigger className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground py-2">
          <ChevronDown className="w-4 h-4" /> Additional
        </CollapsibleTrigger>
        <CollapsibleContent className="space-y-4 pt-2">
          <div>
            <Label>Sleep place</Label>
            <Select value={placeId || "none"} onValueChange={(v) => setPlaceId(v === "none" ? "" : v)}>
              <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— None —</SelectItem>
                {places.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Settling method</Label>
            <Select value={methodId || "none"} onValueChange={(v) => setMethodId(v === "none" ? "" : v)}>
              <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— None —</SelectItem>
                {methods.map((m) => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Comment</Label>
            <Textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={2} />
          </div>
        </CollapsibleContent>
      </Collapsible>

      <Button type="submit" className="w-full" disabled={busy}>{mode === "edit" ? "Save changes" : "Add sleep"}</Button>
    </form>
  );
}
