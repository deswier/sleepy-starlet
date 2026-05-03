import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Plus, X, Copy, Trash2, Camera, UserMinus } from "lucide-react";
import { useRef } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { supabase } from "@/integrations/supabase/client";
import { useChildren } from "@/contexts/ChildContext";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { Checkbox } from "@/components/ui/checkbox";
import { ageInMonths, wakeWindowForAge, formatDuration, fmtDateTime } from "@/lib/sleep-utils";
import { useTranslation } from "react-i18next";
import { useChildRole, canEditChild, canManageMembers, type ChildRole } from "@/hooks/useChildRole";
import { localizePlace, localizeMethod } from "@/lib/localize-default";
import { iconForMethod } from "@/lib/method-icons";
import ImageCropDialog from "@/components/ImageCropDialog";
import i18n from "@/i18n";

type Member = {
  user_id: string;
  display_name: string | null;
  role: "viewer" | "user" | "admin";
};

export default function Settings() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { activeChild, refresh, refreshSettings } = useChildren();
  const { user } = useAuth();
  const { role } = useChildRole();
  const isAdmin = canEditChild(role);
  const isViewer = role === "viewer";
  const [language, setLanguage] = useState<"en" | "ru">(i18n.language?.startsWith("ru") ? "ru" : "en");
  const changeLanguage = async (v: "en" | "ru") => {
    setLanguage(v);
    await i18n.changeLanguage(v);
    if (user) {
      try { await supabase.from("profiles").update({ language: v }).eq("id", user.id); } catch { /* ignore */ }
    }
  };

  const [s, setS] = useState<any>(null);
  const [childName, setChildName] = useState<string>("");
  const [birthDate, setBirthDate] = useState<string>("");
  const [places, setPlaces] = useState<{ id: string; name: string }[]>([]);
  const [methods, setMethods] = useState<{ id: string; name: string }[]>([]);
  const [newPlace, setNewPlace] = useState("");
  const [newMethod, setNewMethod] = useState("");
  const [invites, setInvites] = useState<any[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [inviteRole, setInviteRole] = useState<"viewer" | "user" | "admin">("user");
  const [pendingPhoto, setPendingPhoto] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, []);
  const tt = t;
  const formatRemaining = (expiresAtIso: string) => {
    const ms = new Date(expiresAtIso).getTime() - now;
    if (ms <= 0) return tt("settings.expired");
    const totalMin = Math.floor(ms / 60_000);
    const h = Math.floor(totalMin / 60);
    const m = totalMin % 60;
    if (h <= 0) return `${m}m`;
    return `${h}h ${m}m`;
  };

  const onPickChildPhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) setPendingPhoto(f);
    e.target.value = "";
  };

  const uploadChildPhoto = async (blob: Blob) => {
    if (!activeChild || !user) return;
    setPendingPhoto(null);
    const path = `${user.id}/${activeChild.id}-${Date.now()}.jpg`;
    const up = await supabase.storage.from("child-photos").upload(path, blob, { upsert: true, contentType: "image/jpeg" });
    if (up.error) { toast.error(up.error.message); return; }
    const { data } = supabase.storage.from("child-photos").getPublicUrl(path);
    const { error } = await supabase.from("children").update({ photo_url: data.publicUrl }).eq("id", activeChild.id);
    if (error) toast.error(error.message);
    else { toast.success(t("common.saved")); refresh(); }
  };

  const load = async () => {
    if (!activeChild) return;
    setChildName(activeChild.name ?? "");
    setBirthDate(activeChild.birth_date ?? "");
    // Always load invites — RLS already restricts visibility to linked users,
    // and we render the section based on `canManageMembers(role)` which may
    // resolve after the first load() call.
    const invitesQuery = supabase.from("child_invites").select("*")
      .eq("child_id", activeChild.id)
      .is("redeemed_at", null).is("revoked_at", null)
      .order("created_at", { ascending: false });
    const [se, p, m, inv, links, roles, profs] = await Promise.all([
      supabase.from("child_settings").select("*").eq("child_id", activeChild.id).single(),
      supabase.from("sleep_places").select("id,name").eq("child_id", activeChild.id).order("name"),
      supabase.from("settling_methods").select("id,name").eq("child_id", activeChild.id).order("name"),
      invitesQuery,
      supabase.from("child_users").select("user_id").eq("child_id", activeChild.id),
      supabase.from("child_user_roles").select("user_id,role").eq("child_id", activeChild.id),
      supabase.from("profiles").select("id,display_name"),
    ]);
    setS(se.data); setPlaces(p.data ?? []); setMethods(m.data ?? []);
    setInvites(((inv as any)?.data ?? []).filter((i: any) => new Date(i.expires_at) > new Date()));
    const roleMap = new Map((roles.data ?? []).map((r: any) => [r.user_id, r.role]));
    const profMap = new Map((profs.data ?? []).map((p: any) => [p.id, p.display_name]));
    setMembers((links.data ?? []).map((l: any) => ({
      user_id: l.user_id,
      display_name: profMap.get(l.user_id) ?? null,
      role: roleMap.get(l.user_id) ?? "user",
    })));
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
    if (error) toast.error(error.message); else { toast.success(t("common.saved")); refreshSettings(); }
  };

  const saveChild = async () => {
    if (!activeChild || !isAdmin) return;
    const name = (childName ?? "").trim();
    if (!name) return;
    const { error } = await supabase.from("children").update({
      name, birth_date: birthDate || null,
    }).eq("id", activeChild.id);
    if (error) toast.error(error.message); else { toast.success(t("common.saved")); refresh(); }
  };

  const generateInvite = async () => {
    if (!activeChild) return;
    const { error } = await supabase.rpc("create_child_invite", { _child_id: activeChild.id, _role: inviteRole } as any);
    if (error) { toast.error(error.message); return; }
    load();
  };
  const revokeInvite = async (id: string) => {
    await supabase.from("child_invites").update({ revoked_at: new Date().toISOString() }).eq("id", id);
    load();
  };
  const changeInviteRole = async (id: string, newRole: "viewer" | "user" | "admin") => {
    const { error } = await supabase.from("child_invites").update({ role: newRole }).eq("id", id);
    if (error) { toast.error(error.message); return; }
    setInvites((prev) => prev.map((i) => (i.id === id ? { ...i, role: newRole } : i)));
  };
  const copyCode = async (code: string) => {
    await navigator.clipboard.writeText(code);
    toast.success(t("settings.copied"));
  };

  const changeMemberRole = async (uid: string, newRole: "viewer" | "user" | "admin") => {
    if (!activeChild || !isAdmin) return;
    const { error } = await supabase.from("child_user_roles")
      .update({ role: newRole }).eq("child_id", activeChild.id).eq("user_id", uid);
    if (error) toast.error(error.message); else { toast.success(t("common.saved")); load(); }
  };

  const removeMember = async (uid: string) => {
    if (!activeChild || !isAdmin) return;
    if (!confirm(t("settings.confirmRemoveMember"))) return;
    const { error: e1 } = await supabase.from("child_user_roles").delete()
      .eq("child_id", activeChild.id).eq("user_id", uid);
    const { error: e2 } = await supabase.from("child_users").delete()
      .eq("child_id", activeChild.id).eq("user_id", uid);
    if (e1 || e2) toast.error((e1 || e2)!.message);
    else { toast.success(t("common.deleted")); load(); }
  };

  const deleteProfile = async () => {
    if (!activeChild || !isAdmin) return;
    if (!confirm(t("settings.confirmDeleteProfile"))) return;
    const { error } = await supabase.from("children").delete().eq("id", activeChild.id);
    if (error) toast.error(error.message);
    else { toast.success(t("common.deleted")); await refresh(); navigate("/"); }
  };

  if (!activeChild || !s) return (
    <main className="min-h-screen bg-hero p-4">
      <div className="max-w-md mx-auto py-4">
        <div className="h-8 w-24 bg-muted animate-pulse rounded-lg mb-4" />
        <div className="h-10 w-40 bg-muted animate-pulse rounded-lg mb-6" />
        {[120, 180, 96, 140, 96].map((h, i) => (
          <div key={i} className="bg-card rounded-xl shadow-card mb-4" style={{ height: h }}>
            <div className="h-full bg-muted/50 animate-pulse rounded-xl" />
          </div>
        ))}
      </div>
    </main>
  );

  // Viewers cannot edit any settings — show a read-only minimal screen.
  if (isViewer) {
    return (
      <main className="min-h-screen bg-hero p-4">
        <div className="max-w-md mx-auto py-4">
          <Button variant="ghost" size="sm" onClick={() => navigate(-1)} className="mb-4">
            <ArrowLeft className="w-4 h-4 mr-1" /> {t("common.back")}
          </Button>
          <h1 className="font-display text-3xl font-semibold mb-6">{t("settings.title")}</h1>
          <Card className="p-5 shadow-card mb-4 space-y-3">
            <h3 className="font-semibold">{t("common.language")}</h3>
            <Select value={language} onValueChange={(v: "en" | "ru") => changeLanguage(v)}>
              <SelectTrigger className="h-10 w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="en">English</SelectItem>
                <SelectItem value="ru">Русский</SelectItem>
              </SelectContent>
            </Select>
          </Card>
          <Card className="p-5 shadow-card mb-4">
            <h3 className="font-semibold mb-1">{activeChild.name}</h3>
            <p className="text-xs text-muted-foreground">{t("settings.role_viewer")}</p>
          </Card>
        </div>
      </main>
    );
  }

  const months = ageInMonths(birthDate || activeChild.birth_date);
  const ww = months !== null ? wakeWindowForAge(months) : null;

  return (
    <main className="min-h-screen bg-hero p-4">
      <div className="max-w-md mx-auto py-4">
        <Button variant="ghost" size="sm" onClick={() => navigate(-1)} className="mb-4">
          <ArrowLeft className="w-4 h-4 mr-1" /> {t("common.back")}
        </Button>
        <h1 className="font-display text-3xl font-semibold mb-6">{t("settings.title")}</h1>

        {/* Language */}
        <Card className="p-5 shadow-card mb-4 space-y-3">
          <h3 className="font-semibold">{t("common.language")}</h3>
          <Select value={language} onValueChange={(v: "en" | "ru") => changeLanguage(v)}>
            <SelectTrigger className="h-10 w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="en">English</SelectItem>
              <SelectItem value="ru">Русский</SelectItem>
            </SelectContent>
          </Select>
        </Card>

        {/* 1. Child */}
        <Card className="p-5 shadow-card mb-4 space-y-3">
          <h3 className="font-semibold">{t("settings.child")}</h3>
          <div className="flex items-center gap-3">
            <Avatar className="w-16 h-16">
              {activeChild.photo_url && <AvatarImage src={activeChild.photo_url} alt="" />}
              <AvatarFallback className="bg-primary/15 text-primary font-semibold">
                {(activeChild.name ?? "•").trim().slice(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            {isAdmin && (
              <>
                <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
                  <Camera className="w-4 h-4 mr-1" /> {t("child.changePhoto")}
                </Button>
                <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onPickChildPhoto} />
              </>
            )}
          </div>
          <ImageCropDialog file={pendingPhoto} open={!!pendingPhoto} onClose={() => setPendingPhoto(null)} onConfirm={uploadChildPhoto} />
          <div className="space-y-1.5">
            <Label>{t("child.name")}</Label>
            <Input value={childName} disabled={!isAdmin}
              onChange={(e) => setChildName(e.target.value)} onBlur={saveChild} />
          </div>
          <div className="space-y-1.5">
            <Label>{t("child.birthDate")}</Label>
            <Input type="date" value={birthDate} disabled={!isAdmin}
              onChange={(e) => setBirthDate(e.target.value)} onBlur={saveChild}
              className="block w-full justify-start text-left [&::-webkit-date-and-time-value]:text-left [&::-webkit-datetime-edit]:text-left" />
          </div>
          {ww && (
            <p className="text-xs text-muted-foreground">
              {t("settings.currentWW", { min: formatDuration(ww.min), max: formatDuration(ww.max) })}
            </p>
          )}
        </Card>

        {/* 2. Family access */}
        <Card className="p-5 shadow-card mb-4 space-y-3">
          <h3 className="font-semibold">{t("settings.family")}</h3>
          <p className="text-xs text-muted-foreground">{t("settings.familyHelp")}</p>

          {members.length > 0 && (
            <div className="space-y-1">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">{t("settings.members")}</div>
              {members.map((mem) => (
                <div key={mem.user_id} className="flex items-center gap-2 bg-muted/50 rounded-lg px-3 py-2">
                  <span className="font-medium text-sm flex-1 truncate">
                    {mem.display_name ?? mem.user_id.slice(0, 8)}
                    {mem.user_id === user?.id ? ` (${t("settings.you")})` : ""}
                  </span>
                  {isAdmin && mem.user_id !== user?.id ? (
                    <>
                      <Select value={mem.role} onValueChange={(v: any) => changeMemberRole(mem.user_id, v)}>
                        <SelectTrigger className="h-8 w-28 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="viewer">{t("settings.role_viewer")}</SelectItem>
                          <SelectItem value="user">{t("settings.role_user")}</SelectItem>
                          <SelectItem value="admin">{t("settings.role_admin")}</SelectItem>
                        </SelectContent>
                      </Select>
                      <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive"
                        onClick={() => removeMember(mem.user_id)} title={t("settings.removeMember")}>
                        <UserMinus className="w-4 h-4" />
                      </Button>
                    </>
                  ) : (
                    <span className="text-xs text-muted-foreground">{t(`settings.role_${mem.role}`)}</span>
                  )}
                </div>
              ))}
            </div>
          )}

          {canManageMembers(role) && invites.map((inv) => (
            <div key={inv.id} className="bg-muted/50 rounded-lg px-3 py-2 space-y-2">
              <div className="flex items-center gap-2">
                <span className="font-mono font-semibold tracking-widest text-lg">{inv.code}</span>
                <Button size="icon" variant="ghost" className="h-7 w-7 ml-auto" onClick={() => copyCode(inv.code)}>
                  <Copy className="w-3.5 h-3.5" />
                </Button>
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => revokeInvite(inv.id)}>
                  <X className="w-3.5 h-3.5" />
                </Button>
              </div>
              <div className="flex items-center gap-2">
                <Select value={inv.role} onValueChange={(v: "viewer" | "user" | "admin") => changeInviteRole(inv.id, v)}>
                  <SelectTrigger className="h-8 w-32 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="viewer">{t("settings.role_viewer")}</SelectItem>
                    <SelectItem value="user">{t("settings.role_user")}</SelectItem>
                    <SelectItem value="admin">{t("settings.role_admin")}</SelectItem>
                  </SelectContent>
                </Select>
                <span className="text-xs text-muted-foreground">
                  {t("settings.expiresIn", { time: formatRemaining(inv.expires_at) })}
                </span>
              </div>
            </div>
          ))}
          {canManageMembers(role) && (
            <div className="space-y-2">
              <Label className="text-xs">{t("settings.inviteRole")}</Label>
              <div className="flex gap-2">
                <Select value={inviteRole} onValueChange={(v: any) => setInviteRole(v)}>
                  <SelectTrigger className="h-10 w-36"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="viewer">{t("settings.role_viewer")}</SelectItem>
                    <SelectItem value="user">{t("settings.role_user")}</SelectItem>
                    <SelectItem value="admin">{t("settings.role_admin")}</SelectItem>
                  </SelectContent>
                </Select>
                <Button variant="outline" onClick={generateInvite} className="flex-1">
                  <Plus className="w-4 h-4 mr-1" /> {t("settings.generateCode")}
                </Button>
              </div>
            </div>
          )}
        </Card>

        {/* 3. Night window */}
        <Card className="p-5 shadow-card mb-4 space-y-3">
          <h3 className="font-semibold">{t("settings.nightWindow")}</h3>
          <p className="text-xs text-muted-foreground">{t("settings.nightWindowHelp")}</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>{t("settings.nightStarts")}</Label>
              <Input type="time" value={s.night_start_time}
                onChange={(e) => setS({ ...s, night_start_time: e.target.value })}
                className="block w-full justify-start text-left [&::-webkit-date-and-time-value]:text-left [&::-webkit-datetime-edit]:text-left" />
            </div>
            <div className="space-y-1.5">
              <Label>{t("settings.nightEnds")}</Label>
              <Input type="time" value={s.night_end_time}
                onChange={(e) => setS({ ...s, night_end_time: e.target.value })}
                className="block w-full justify-start text-left [&::-webkit-date-and-time-value]:text-left [&::-webkit-datetime-edit]:text-left" />
            </div>
          </div>
          <Button onClick={saveSettings} className="w-full">{t("common.save")}</Button>
        </Card>

        {/* 4. Display */}
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

        {/* 5. Sleep places */}
        <ListEditor title={t("settings.sleepPlaces")} items={places.map((p) => ({ ...p, label: localizePlace(p.name) }))}
          newValue={newPlace} setNewValue={setNewPlace} placeholder={t("settings.addNew")}
          onAdd={async () => {
            if (!newPlace.trim()) return;
            await supabase.from("sleep_places").insert({ child_id: activeChild.id, name: newPlace.trim() });
            setNewPlace(""); load();
          }}
          onDelete={async (id) => { await supabase.from("sleep_places").delete().eq("id", id); load(); }} />

        {/* 6. Settling methods */}
        <ListEditor title={t("settings.settlingMethods")} items={methods.map((m) => ({ ...m, label: localizeMethod(m.name) }))}
          renderIcon={(item: any) => {
            const Icon = iconForMethod(item.name);
            return <Icon className="w-4 h-4 text-muted-foreground shrink-0" />;
          }}
          newValue={newMethod} setNewValue={setNewMethod} placeholder={t("settings.addNew")}
          onAdd={async () => {
            if (!newMethod.trim()) return;
            await supabase.from("settling_methods").insert({ child_id: activeChild.id, name: newMethod.trim() });
            setNewMethod(""); load();
          }}
          onDelete={async (id) => { await supabase.from("settling_methods").delete().eq("id", id); load(); }} />

        {/* 8. Delete profile */}
        {isAdmin && (
          <Card className="p-5 shadow-card mb-4">
            <Button variant="outline" className="w-full text-destructive hover:text-destructive" onClick={deleteProfile}>
              <Trash2 className="w-4 h-4 mr-2" /> {t("settings.deleteProfile")}
            </Button>
          </Card>
        )}
      </div>
    </main>
  );
}

function ListEditor({ title, items, newValue, setNewValue, onAdd, onDelete, placeholder, renderIcon }: any) {
  return (
    <Card className="p-5 shadow-card mb-4 space-y-3">
      <h3 className="font-semibold">{title}</h3>
      <ul className="space-y-1">
        {items.map((i: any) => (
          <li key={i.id} className="flex items-center justify-between bg-muted/50 rounded-lg px-3 py-2">
            <span className="flex items-center gap-2 min-w-0">
              {renderIcon ? renderIcon(i) : null}
              <span className="truncate">{i.label ?? i.name}</span>
            </span>
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
