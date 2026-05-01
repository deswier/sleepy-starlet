import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Plus, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useChildren } from "@/contexts/ChildContext";
import { toast } from "sonner";
import { Checkbox } from "@/components/ui/checkbox";
import { ageInMonths, wakeWindowForAge } from "@/lib/sleep-utils";

export default function Settings() {
  const navigate = useNavigate();
  const { activeChild, refresh } = useChildren();
  const [s, setS] = useState<any>(null);
  const [places, setPlaces] = useState<{ id: string; name: string }[]>([]);
  const [methods, setMethods] = useState<{ id: string; name: string }[]>([]);
  const [newPlace, setNewPlace] = useState("");
  const [newMethod, setNewMethod] = useState("");

  const load = async () => {
    if (!activeChild) return;
    const [se, p, m] = await Promise.all([
      supabase.from("child_settings").select("*").eq("child_id", activeChild.id).single(),
      supabase.from("sleep_places").select("id,name").eq("child_id", activeChild.id).order("name"),
      supabase.from("settling_methods").select("id,name").eq("child_id", activeChild.id).order("name"),
    ]);
    let data = se.data;
    // If using age defaults, sync min/max from age table
    if (data?.use_age_default_wake_window) {
      const months = ageInMonths(activeChild.birth_date);
      if (months !== null) {
        const { min, max } = wakeWindowForAge(months);
        if (data.min_wake_window_minutes !== min || data.max_wake_window_minutes !== max) {
          await supabase.from("child_settings")
            .update({ min_wake_window_minutes: min, max_wake_window_minutes: max })
            .eq("child_id", activeChild.id);
          data = { ...data, min_wake_window_minutes: min, max_wake_window_minutes: max };
        }
      }
    }
    setS(data); setPlaces(p.data ?? []); setMethods(m.data ?? []);
  };
  useEffect(() => { load(); }, [activeChild]);

  const saveSettings = async () => {
    const { error } = await supabase.from("child_settings").update({
      night_start_time: s.night_start_time,
      night_end_time: s.night_end_time,
      min_wake_window_minutes: s.min_wake_window_minutes,
      max_wake_window_minutes: s.max_wake_window_minutes,
      use_age_default_wake_window: s.use_age_default_wake_window,
    }).eq("child_id", activeChild!.id);
    if (error) toast.error(error.message); else toast.success("Saved");
  };

  const saveName = async () => {
    if (!activeChild) return;
    const { error } = await supabase.from("children").update({ name: activeChild.name }).eq("id", activeChild.id);
    if (error) toast.error(error.message); else { toast.success("Saved"); refresh(); }
  };

  if (!activeChild || !s) return null;

  const toggleAgeDefault = (checked: boolean) => {
    if (checked) {
      const months = ageInMonths(activeChild.birth_date);
      if (months !== null) {
        const { min, max } = wakeWindowForAge(months);
        setS({ ...s, use_age_default_wake_window: true, min_wake_window_minutes: min, max_wake_window_minutes: max });
        return;
      }
    }
    setS({ ...s, use_age_default_wake_window: checked });
  };

  return (
    <main className="min-h-screen bg-hero p-4">
      <div className="max-w-md mx-auto py-4">
        <Button variant="ghost" size="sm" onClick={() => navigate(-1)} className="mb-4">
          <ArrowLeft className="w-4 h-4 mr-1" /> Back
        </Button>
        <h1 className="font-display text-3xl font-semibold mb-6">Settings</h1>

        <Card className="p-5 shadow-card mb-4 space-y-3">
          <h3 className="font-semibold">Child</h3>
          <Label>Name</Label>
          <Input value={activeChild.name} onChange={(e) => { activeChild.name = e.target.value; refresh(); }} onBlur={saveName} />
        </Card>

        <Card className="p-5 shadow-card mb-4 space-y-3">
          <h3 className="font-semibold">Night window</h3>
          <p className="text-xs text-muted-foreground">Used to auto-classify day vs night sleep.</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>Night starts</Label>
              <Input type="time" value={s.night_start_time} onChange={(e) => setS({ ...s, night_start_time: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Night ends</Label>
              <Input type="time" value={s.night_end_time} onChange={(e) => setS({ ...s, night_end_time: e.target.value })} /></div>
          </div>
        </Card>

        <Card className="p-5 shadow-card mb-4 space-y-3">
          <h3 className="font-semibold">Wake window</h3>
          <p className="text-xs text-muted-foreground">Used to color-code wake windows in history.</p>
          <label className="flex items-start gap-2 cursor-pointer select-none">
            <Checkbox
              checked={!!s.use_age_default_wake_window}
              onCheckedChange={(v) => toggleAgeDefault(!!v)}
              className="mt-0.5"
            />
            <span className="text-sm leading-snug">Use default values for the child's age</span>
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>Min (minutes)</Label>
              <Input type="number" min={15} max={600} value={s.min_wake_window_minutes}
                disabled={!!s.use_age_default_wake_window}
                onChange={(e) => setS({ ...s, min_wake_window_minutes: +e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Max (minutes)</Label>
              <Input type="number" min={15} max={600} value={s.max_wake_window_minutes}
                disabled={!!s.use_age_default_wake_window}
                onChange={(e) => setS({ ...s, max_wake_window_minutes: +e.target.value })} /></div>
          </div>
          <Button onClick={saveSettings} className="w-full">Save</Button>
        </Card>

        <ListEditor title="Sleep places" items={places} newValue={newPlace} setNewValue={setNewPlace}
          onAdd={async () => {
            if (!newPlace.trim()) return;
            await supabase.from("sleep_places").insert({ child_id: activeChild.id, name: newPlace.trim() });
            setNewPlace(""); load();
          }}
          onDelete={async (id) => { await supabase.from("sleep_places").delete().eq("id", id); load(); }} />

        <ListEditor title="Settling methods" items={methods} newValue={newMethod} setNewValue={setNewMethod}
          onAdd={async () => {
            if (!newMethod.trim()) return;
            await supabase.from("settling_methods").insert({ child_id: activeChild.id, name: newMethod.trim() });
            setNewMethod(""); load();
          }}
          onDelete={async (id) => { await supabase.from("settling_methods").delete().eq("id", id); load(); }} />
      </div>
    </main>
  );
}

function ListEditor({ title, items, newValue, setNewValue, onAdd, onDelete }: any) {
  return (
    <Card className="p-5 shadow-card mb-4 space-y-3">
      <h3 className="font-semibold">{title}</h3>
      <ul className="space-y-1">
        {items.map((i: any) => (
          <li key={i.id} className="flex items-center justify-between bg-muted/50 rounded-lg px-3 py-2">
            <span>{i.name}</span>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onDelete(i.id)}>
              <X className="w-4 h-4" />
            </Button>
          </li>
        ))}
      </ul>
      <div className="flex gap-2">
        <Input value={newValue} onChange={(e) => setNewValue(e.target.value)} placeholder="Add new…" />
        <Button onClick={onAdd}><Plus className="w-4 h-4" /></Button>
      </div>
    </Card>
  );
}
