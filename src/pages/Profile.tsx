import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Camera } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import ImageCropDialog from "@/components/ImageCropDialog";

export default function Profile() {
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const [name, setName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [language, setLanguage] = useState<"en" | "ru">(i18n.language?.startsWith("ru") ? "ru" : "en");
  const [newPassword, setNewPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase.from("profiles").select("display_name,avatar_url,language").eq("id", user.id).maybeSingle();
      if (data) {
        setName(data.display_name ?? "");
        setAvatarUrl(data.avatar_url ?? null);
        if ((data as any).language) setLanguage((data as any).language);
      }
    })();
  }, [user?.id]);

  const saveProfile = async () => {
    if (!user) return;
    setBusy(true);
    const { error } = await supabase.from("profiles").update({
      display_name: name.trim() || null,
      language,
    }).eq("id", user.id);
    setBusy(false);
    if (error) toast.error(error.message); else { toast.success(t("common.saved")); i18n.changeLanguage(language); }
  };

  const onPickFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) setPendingFile(f);
    e.target.value = "";
  };

  const uploadCropped = async (blob: Blob) => {
    if (!user) return;
    setPendingFile(null);
    const path = `${user.id}/avatar-${Date.now()}.jpg`;
    setBusy(true);
    const up = await supabase.storage.from("avatars").upload(path, blob, { upsert: true, contentType: "image/jpeg" });
    if (up.error) { toast.error(up.error.message); setBusy(false); return; }
    const { data } = supabase.storage.from("avatars").getPublicUrl(path);
    await supabase.from("profiles").update({ avatar_url: data.publicUrl }).eq("id", user.id);
    setAvatarUrl(data.publicUrl);
    setBusy(false);
    toast.success(t("common.saved"));
  };

  const changePassword = async () => {
    if (!newPassword || newPassword.length < 6) { toast.error("min 6"); return; }
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setBusy(false);
    if (error) toast.error(error.message);
    else { setNewPassword(""); toast.success(t("profile.passwordChanged")); }
  };

  const initials = (name || user?.email || "?").trim().split(" ").map((p) => p[0]).join("").slice(0, 2).toUpperCase();

  return (
    <main className="min-h-screen bg-hero p-4">
      <div className="max-w-md mx-auto py-4">
        <Button variant="ghost" size="sm" onClick={() => navigate(-1)} className="mb-4">
          <ArrowLeft className="w-4 h-4 mr-1" /> {t("common.back")}
        </Button>
        <h1 className="font-display text-3xl font-semibold mb-6">{t("profile.title")}</h1>

        <Card className="p-5 shadow-card mb-4 space-y-4">
          <div className="flex items-center gap-4">
            <Avatar className="w-16 h-16">
              {avatarUrl && <AvatarImage src={avatarUrl} alt="" />}
              <AvatarFallback className="bg-primary/15 text-primary font-semibold">{initials}</AvatarFallback>
            </Avatar>
            <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={busy}>
              <Camera className="w-4 h-4 mr-1" /> {t("profile.changePhoto")}
            </Button>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onPickFile} />
          </div>
          <ImageCropDialog file={pendingFile} open={!!pendingFile} onClose={() => setPendingFile(null)} onConfirm={uploadCropped} />
          <div className="space-y-1.5">
            <Label>{t("profile.name")}</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={100} />
          </div>
          <div className="space-y-1.5">
            <Label>{t("profile.email")}</Label>
            <Input value={user?.email ?? ""} disabled />
          </div>
          <div className="space-y-1.5">
            <Label>{t("common.language")}</Label>
            <Select value={language} onValueChange={(v: "en" | "ru") => setLanguage(v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="en">{t("common.english")}</SelectItem>
                <SelectItem value="ru">{t("common.russian")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button onClick={saveProfile} className="w-full" disabled={busy}>{t("common.save")}</Button>
        </Card>

        <Card className="p-5 shadow-card mb-4 space-y-3">
          <h3 className="font-semibold">{t("profile.changePassword")}</h3>
          <div className="space-y-1.5">
            <Label>{t("profile.newPassword")}</Label>
            <Input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} minLength={6} />
          </div>
          <Button onClick={changePassword} className="w-full" disabled={busy || newPassword.length < 6}>
            {t("profile.changePassword")}
          </Button>
        </Card>
      </div>
    </main>
  );
}