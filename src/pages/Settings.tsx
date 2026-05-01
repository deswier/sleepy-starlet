import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Plus, X, Copy } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useChildren } from "@/contexts/ChildContext";
import { toast } from "sonner";
import { Checkbox } from "@/components/ui/checkbox";
import { ageInMonths, wakeWindowForAge, formatDuration } from "@/lib/sleep-utils";
import { useTranslation } from "react-i18next";
import { formatDistanceToNowStrict } from "date-fns";

export default function Settings() {
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const { activeChild, refresh } = useChildren();
  const [s, setS] = useState<any>(null);
  const [birthDate, setBirthDate] = useState<string>("");
  const [places, setPlaces] = useState<{ id: string; name: string }[]>([]);
  const [methods, setMethods] = useState<{ id: string; name: string }[]>([]);
  const [newPlace, setNewPlace] = useState("");
  const [newMethod, setNewMethod] = useState("");
  const [invites, setInvites] = useState<any[]>([]);

  const load = async () => {
    if (!activeChild) return;
    setBirthDate(activeChild.birth_date ?? "");
    const [se, p, m, inv] = await Promise.all([
      supabase.from("child_settings").select("*").eq("child_id", activeChild.id).single(),
      supabase.from("sleep_places").select("id,name").eq("child_id", activeChild.id).order("name"),
      supabase.from("settling_methods").select("id,name").eq("child_id", activeChild.id).order("name"),
      supabase.from("child_invites").select("*").eq("child_id", activeChild.id)
        .is("redeemed_at", null).is("revoked_at", null).order("created_at", { ascending: false }),
    ]);
    setS(se.data); setPlaces(p.data ?? []); setMethods(m.data ?? []);
    setInvites((inv.data ?? []).filter((i: any) => new Date(i.expires_at) > new Date()));
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
    if (error) toast.error(error.message); else toast.success(t("common.saved"));
  };

  const saveChild = async () => {
    if (!activeChild) return;
    const { error } = await supabase.from("children").update({
      name: activeChild.name, birth_date: birthDate || null,
    }).eq("id", activeChild.id);
    if (error) toast.error(error.message); else { toast.success(t("common.saved")); refresh(); }
  };

  const generateInvite = async () => {
    if (!activeChild) return;
    const { data, error } = await supabase.rpc("create_child_invite", { _child_id: activeChild.id });
    if (error || !data) { toast.error(error?.message ?? "Failed"); return; }
    load();
  };
  const revokeInvite = async (id: string) => {
    await supabase.from("child_invites").update({ revoked_at: new Date().toISOString() }).eq("id", id);
    load();
  };
  const copyCode = async (code: string) => {
    await navigator.clipboard.writeText(code);
    toast.success(t("settings.copied"));
  };

  if (!activeChild || !s) return null;

  const months = ageInMonths(birthDate || activeChild.birth_date);
  const ww = months !== null ? wakeWindowForAge(months) : null;

  return (
    <main className="min-h-screen bg-hero p-4">
      <div className="max-w-md mx-auto py-4">
        <Button variant="ghost" size="sm" onClick={() => navigate(-1)} className="mb-4">
          <ArrowLeft className="w-4 h-4 mr-1" /> {t("common.back")}
        </Button>
        <h1 className="font-display text-3xl font-semibold mb-6">{t("settings.title")}</h1>

        <Card className="p-5 shadow-card mb-4 space-y-3">
          <h3 className="font-semibold">{t("settings.child")}</h3>
          <div className="space-y-1.5">
            <Label>{t("child.name")}</Label>
            <Input value={activeChild.name} onChange={(e) => { activeChild.name = e.target.value; refresh(); }} onBlur={saveChild} />
          </div>
          <div className="space-y-1.5">
            <Label>{t("child.birthDate")}</Label>
            <Input type="date" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} onBlur={saveChild} className="block w-full" />
          </div>
          {ww && (
            <p className="text-xs text-muted-foreground">
              {t("settings.currentWW", { min: formatDuration(ww.min), max: formatDuration(ww.max) })}
            </p>
          )}
        </Card>

        <Card className="p-5 shadow-card mb-4 space-y-3">
          <h3 className="font-semibold">{t("common.language")}</h3>
          <Select value={i18n.language.startsWith("ru") ? "ru" : "en"} onValueChange={(v) => i18n.changeLanguage(v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="en">{t("common.english")}</SelectItem>
              <SelectItem value="ru">{t("common.russian")}</SelectItem>
            </SelectContent>
          </Select>
        </Card>

        <Card className="p-5 shadow-card mb-4 space-y-3">
          <h3 className="font-semibold">{t("settings.nightWindow")}</h3>
          <p className="text-xs text-muted-foreground">{t("settings.nightWindowHelp")}</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>{t("settings.nightStarts")}</Label>
              <Input type="time" value={s.night_start_time} onChange={(e) => setS({ ...s, night_start_time: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>{t("settings.nightEnds")}</Label>
              <Input type="time" value={s.night_end_time} onChange={(e) => setS({ ...s, night_end_time: e.target.value })} /></div>
          </div>
          <Button onClick={saveSettings} className="w-full">{t("common.save")}</Button>
        </Card>

        <Card className="p-5 shadow-card mb-4 space-y-3">
          <h3 className="font-semibold">{t("settings.display")}</h3>
          <p className="text-xs text-muted-foreground">{t("settings.displayHelp")}</p>
          {[
            { key: "show_sleep_place", label: t("settings.showSleepPlace") },
            { key: "show_falling_asleep_method", label: t("settings.showSettlingMethod") },
            { key: "show_interruptions", label: t("settings.showInterruptions") },
            { key: "split_night_sleep_by_date", label: t("settings.splitNightByDate") },
          ].map((o) => (
            <label key={o.key} className="flex items-center gap-2 cursor-pointer select-none">
              <Checkbox checked={!!s[o.key]} onCheckedChange={(v) => setS({ ...s, [o.key]: !!v })} />
              <span className="text-sm">{o.label}</span>
            </label>
          ))}
          <Button onClick={saveSettings} className="w-full">{t("common.save")}</Button>
        </Card>

        <Card className="p-5 shadow-card mb-4 space-y-3">
          <h3 className="font-semibold">{t("settings.family")}</h3>
          <p className="text-xs text-muted-foreground">{t("settings.familyHelp")}</p>
          {invites.map((inv) => (
            <div key={inv.id} className="flex items-center gap-2 bg-muted/50 rounded-lg px-3 py-2">
              <span className="font-mono font-semibold tracking-widest text-lg">{inv.code}</span>
              <span className="text-xs text-muted-foreground ml-2">
                {t("settings.expiresIn", { time: formatDistanceToNowStrict(new Date(inv.expires_at)) })}
              </span>
              <div className="ml-auto flex gap-1">
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => copyCode(inv.code)}>
                  <Copy className="w-3.5 h-3.5" />
                </Button>
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => revokeInvite(inv.id)}>
                  <X className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          ))}
          <Button variant="outline" onClick={generateInvite} className="w-full">
            <Plus className="w-4 h-4 mr-1" /> {t("settings.generateCode")}
          </Button>
        </Card>

        <ListEditor title={t("settings.sleepPlaces")} items={places} newValue={newPlace} setNewValue={setNewPlace}
          placeholder={t("settings.addNew")}
          onAdd={async () => {
            if (!newPlace.trim()) return;
            await supabase.from("sleep_places").insert({ child_id: activeChild.id, name: newPlace.trim() });
            setNewPlace(""); load();
          }}
          onDelete={async (id) => { await supabase.from("sleep_places").delete().eq("id", id); load(); }} />

        <ListEditor title={t("settings.settlingMethods")} items={methods} newValue={newMethod} setNewValue={setNewMethod}
          placeholder={t("settings.addNew")}
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

function ListEditor({ title, items, newValue, setNewValue, onAdd, onDelete, placeholder }: any) {
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
        <Input value={newValue} onChange={(e) => setNewValue(e.target.value)} placeholder={placeholder} />
        <Button onClick={onAdd}><Plus className="w-4 h-4" /></Button>
      </div>
    </Card>
  );
}
