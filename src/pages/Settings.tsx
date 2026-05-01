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
import { ageInMonths, wakeWindowForAge, formatDuration } from "@/lib/sleep-utils";

export default function Settings() {
  const navigate = useNavigate();
  const { activeChild, refresh } = useChildren();
  const [s, setS] = useState<any>(null);
  const [birthDate, setBirthDate] = useState<string>("");
  const [places, setPlaces] = useState<{ id: string; name: string }[]>([]);
  const [methods, setMethods] = useState<{ id: string; name: string }[]>([]);
  const [newPlace, setNewPlace] = useState("");
  const [newMethod, setNewMethod] = useState("");

  const load = async () => {
    if (!activeChild) return;
    setBirthDate(activeChild.birth_date ?? "");
    const [se, p, m] = await Promise.all([
      supabase.from("child_settings").select("*").eq("child_id", activeChild.id).single(),
      supabase.from("sleep_places").select("id,name").eq("child_id", activeChild.id).order("name"),
      supabase.from("settling_methods").select("id,name").eq("child_id", activeChild.id).order("name"),
    ]);
    setS(se.data); setPlaces(p.data ?? []); setMethods(m.data ?? []);
  };
  useEffect(() => { load(); }, [activeChild]);

  const saveSettings = async () => {
    if (!activeChild) return;
    const { error } = await supabase.from("child_settings").update({
      night_start_time: s.night_start_time,
      night_end_time: s.night_end_time,
      split_night_sleep_by_date: s.split_night_sleep_by_date,
      show_sleep_place: s.show_sleep_place,
      show_falling_asleep_method: s.show_falling_asleep_method,
      show_interruptions: s.show_interruptions,
    }).eq("child_id", activeChild.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Saved");
  };

  const saveChild = async () => {
    if (!activeChild) return;
    const { error } = await supabase.from("children").update({
      name: activeChild.name,
      birth_date: birthDate || null,
    }).eq("id", activeChild.id);
    if (error) toast.error(error.message); else { toast.success("Saved"); refresh(); }
  };

  if (!activeChild || !s) return null;

  const months = ageInMonths(birthDate || activeChild.birth_date);
  const ww = months !== null ? wakeWindowForAge(months) : null;

  return (
    <main className="min-h-screen bg-hero p-4">
      <div className="max-w-md mx-auto py-4">
        <Button variant="ghost" size="sm" onClick={() => navigate(-1)} className="mb-4">
          <ArrowLeft className="w-4 h-4 mr-1" /> Back
        </Button>
        <h1 className="font-display text-3xl font-semibold mb-6">Settings</h1>

        <Card className="p-5 shadow-card mb-4 space-y-3">
          <h3 className="font-semibold">Child</h3>
          <div className="space-y-1.5">
            <Label>Name</Label>
            <Input value={activeChild.name} onChange={(e) => { activeChild.name = e.target.value; refresh(); }} onBlur={saveChild} />
          </div>
          <div className="space-y-1.5">
            <Label>Birth date</Label>
            <Input type="date" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} onBlur={saveChild} className="block w-full" />
          </div>
          {ww && (
            <p className="text-xs text-muted-foreground">
              Current wake window: {formatDuration(ww.min)} – {formatDuration(ww.max)}
            </p>
          )}
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
          <Button onClick={saveSettings} className="w-full">Save</Button>
        </Card>

        <Card className="p-5 shadow-card mb-4 space-y-3">
          <h3 className="font-semibold">Display</h3>
          <p className="text-xs text-muted-foreground">Show or hide optional fields when adding sleep.</p>
          {[
            { key: "show_sleep_place", label: "Show sleep place" },
            { key: "show_falling_asleep_method", label: "Show settling method" },
            { key: "show_interruptions", label: "Show interruptions" },
            { key: "split_night_sleep_by_date", label: "Split night sleep by date" },
          ].map((o) => (
            <label key={o.key} className="flex items-center gap-2 cursor-pointer select-none">
              <Checkbox checked={!!s[o.key]} onCheckedChange={(v) => setS({ ...s, [o.key]: !!v })} />
              <span className="text-sm">{o.label}</span>
            </label>
          ))}
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
