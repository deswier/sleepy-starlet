import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Camera, Trash2, Archive } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import ImageCropDialog from "@/components/ImageCropDialog";
import { PasswordInput } from "@/components/PasswordInput";
import { RequiredMark } from "@/components/RequiredMark";
import { authErrorMessage } from "@/lib/auth-errors";
import { getAuthRedirectUrl } from "@/lib/native";
import { useSwipeBack } from "@/hooks/use-swipe-back";
import {
  ResponsiveAlertDialog,
  ResponsiveAlertDialogAction,
  ResponsiveAlertDialogCancel,
  ResponsiveAlertDialogContent,
  ResponsiveAlertDialogDescription,
  ResponsiveAlertDialogFooter,
  ResponsiveAlertDialogHeader,
  ResponsiveAlertDialogTitle,
} from "@/components/ui/responsive-alert-dialog";

interface DeletionCheck {
  blocking: { id: string; name: string }[];
  solo_destructive: { id: string; name: string }[];
  unlink: { id: string; name: string }[];
  is_blocked: boolean;
}

export default function Profile() {
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const { user, timeFormat: savedTimeFormat, setTimeFormat: setCtxTimeFormat } = useAuth();
  const [name, setName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [language, setLanguage] = useState<"en" | "ru">(i18n.language?.startsWith("ru") ? "ru" : "en");
  const [timeFormatPref, setTimeFormatPref] = useState(savedTimeFormat);
  // Sync if the context value loads asynchronously after mount.
  useEffect(() => { setTimeFormatPref(savedTimeFormat); }, [savedTimeFormat]);
  const [emailDraft, setEmailDraft] = useState("");
  useEffect(() => { if (user?.email) setEmailDraft(user.email); }, [user?.email]);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [repeatNewPassword, setRepeatNewPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const passwordMismatch = repeatNewPassword.length > 0 && repeatNewPassword !== newPassword;

  const providers: string[] = [
    ...((user?.app_metadata?.providers as string[] | undefined) ?? []),
    ...(user?.identities?.map((i) => i.provider) ?? []),
  ];
  const hasPasswordProvider = providers.some((p) => p === "email" || p === "password");
  const hasGoogleProvider = providers.some((p) => p === "google" || p === "google.com");
  const fileRef = useRef<HTMLInputElement>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteCheck, setDeleteCheck] = useState<DeletionCheck | null>(null);
  const [isOwnerAnywhere, setIsOwnerAnywhere] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);

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
      time_format: timeFormatPref,
    }).eq("id", user.id);
    setBusy(false);
    if (error) toast.error(authErrorMessage(error, t));
    else { toast.success(t("common.saved")); i18n.changeLanguage(language); setCtxTimeFormat(timeFormatPref); }
  };

  const onPickFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f && f.type.startsWith("image/")) setPendingFile(f);
    e.target.value = "";
  };

  const uploadCropped = async (blob: Blob) => {
    if (!user) return;
    setPendingFile(null);
    const path = `${user.id}/avatar-${Date.now()}.jpg`;
    setBusy(true);
    const up = await supabase.storage.from("avatars").upload(path, blob, { upsert: true, contentType: "image/jpeg" });
    if (up.error) { toast.error(authErrorMessage(up.error, t)); setBusy(false); return; }
    const { data } = supabase.storage.from("avatars").getPublicUrl(path);
    await supabase.from("profiles").update({ avatar_url: data.publicUrl }).eq("id", user.id);
    setAvatarUrl(data.publicUrl);
    setBusy(false);
    toast.success(t("common.saved"));
  };

  const changeEmail = async () => {
    if (!emailDraft || !user || emailDraft === user.email) return;
    setBusy(true);
    const { error } = await supabase.auth.updateUser(
      { email: emailDraft },
      { emailRedirectTo: getAuthRedirectUrl() },
    );
    setBusy(false);
    if (error) toast.error(authErrorMessage(error, t));
    else toast.success(t("profile.emailChangeSent"));
  };

  const changePassword = async () => {
    if (!currentPassword) return;
    if (newPassword.length < 6) { toast.error(t("errors.weakPassword")); return; }
    if (newPassword !== repeatNewPassword) { toast.error(t("auth.passwordMismatch")); return; }
    if (!user?.email) return;
    setBusy(true);
    // Re-authenticate to verify current password before allowing the change.
    const { error: reauthError } = await supabase.auth.signInWithPassword({ email: user.email, password: currentPassword });
    if (reauthError) {
      setBusy(false);
      toast.error(t("errors.wrongCurrentPassword"));
      return;
    }
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setBusy(false);
    if (error) { toast.error(authErrorMessage(error, t)); return; }
    setCurrentPassword("");
    setNewPassword("");
    setRepeatNewPassword("");
    toast.success(t("auth.passwordResetSuccess"));
  };

  const sendForgotPassword = async () => {
    if (!user?.email) return;
    setBusy(true);
    const { error } = await supabase.auth.resetPasswordForEmail(user.email, { redirectTo: getAuthRedirectUrl() });
    setBusy(false);
    if (error) toast.error(authErrorMessage(error, t));
    else toast.success(t("profile.resetPasswordSent"));
  };

  const openDeleteDialog = async () => {
    if (!user) return;
    // Run preview RPC + ownership check in parallel so the dialog opens with
    // the right scenario message and never has a flicker of wrong text.
    const [{ data, error }, ownerRes] = await Promise.all([
      supabase.rpc("account_deletion_check"),
      supabase.from("child_user_roles").select("child_id", { count: "exact", head: true })
        .eq("user_id", user.id).eq("role", "admin"),
    ]);
    if (error) { toast.error(error.message); return; }
    setDeleteCheck(data as unknown as DeletionCheck);
    setIsOwnerAnywhere((ownerRes.count ?? 0) > 0);
    setDeleteOpen(true);
  };

  const confirmDelete = async () => {
    setDeleteBusy(true);
    const { error } = await supabase.functions.invoke("delete-account");
    if (error) {
      toast.error(error.message || t("common.loadFailed"));
      setDeleteBusy(false);
      return;
    }
    try {
      await supabase.auth.signOut();
    } finally {
      navigate("/auth", { replace: true });
    }
  };

  // Pick the message for the strongest applicable scenario: 4.3 > 4.4 > 4.2 > 4.1.
  const scenario = (() => {
    if (!deleteCheck) return "default";
    if (deleteCheck.is_blocked) return "blocked";
    if (deleteCheck.solo_destructive.length > 0) return "solo";
    if (isOwnerAnywhere && deleteCheck.unlink.length > 0) return "ownerWithOthers";
    return "default";
  })();

  const initials = (name || user?.email || "?").trim().split(" ").map((p) => p[0]).join("").slice(0, 2).toUpperCase();

  const handleBack = () => navigate(-1);
  useSwipeBack({ enabled: !pendingFile && !deleteOpen, onBack: handleBack });

  return (
    <main className="min-h-screen bg-hero p-4">
      <div className="max-w-md mx-auto py-4">
        <Button type="button" variant="ghost" size="sm" onClick={handleBack} className="mb-4">
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
            <Label htmlFor="email">{t("profile.email")}</Label>
            <Input id="email" type="email" autoComplete="email"
              value={emailDraft} onChange={(e) => setEmailDraft(e.target.value)} />
            {emailDraft && emailDraft !== user?.email && (
              <>
                <p className="text-xs text-muted-foreground">{t("profile.changeEmailHint")}</p>
                <Button type="button" onClick={changeEmail} variant="outline" size="sm" disabled={busy}>
                  {t("profile.changeEmail")}
                </Button>
              </>
            )}
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
          <div className="space-y-1.5">
            <Label>{t("profile.timeFormat")}</Label>
            <Select value={timeFormatPref} onValueChange={(v) => setTimeFormatPref(v as typeof timeFormatPref)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="system">{t("profile.timeFormatSystem")}</SelectItem>
                <SelectItem value="h12">{t("profile.timeFormat12h")}</SelectItem>
                <SelectItem value="h24">{t("profile.timeFormat24h")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button type="button" onClick={saveProfile} className="w-full" disabled={busy}>{t("common.save")}</Button>
        </Card>

        <Card className="p-5 shadow-card mb-4 space-y-3">
          <h3 className="font-semibold">{t("profile.changePassword")}</h3>
          {hasPasswordProvider ? (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="curPw"><RequiredMark />{t("profile.currentPassword")}</Label>
                <PasswordInput id="curPw" autoComplete="current-password"
                  value={currentPassword} onChange={setCurrentPassword} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="newPw"><RequiredMark />{t("profile.newPassword")}</Label>
                <PasswordInput id="newPw" autoComplete="new-password" minLength={6}
                  value={newPassword} onChange={setNewPassword} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="newPw2"><RequiredMark />{t("auth.repeatPassword")}</Label>
                <PasswordInput id="newPw2" autoComplete="new-password" minLength={6}
                  aria-invalid={passwordMismatch}
                  value={repeatNewPassword} onChange={setRepeatNewPassword} />
                {passwordMismatch && (
                  <p className="text-xs text-destructive">{t("auth.passwordMismatch")}</p>
                )}
              </div>
              <Button type="button" onClick={changePassword} className="w-full"
                disabled={busy || !currentPassword || newPassword.length < 6 || passwordMismatch || repeatNewPassword.length === 0}>
                {t("profile.changePassword")}
              </Button>
              <button type="button" onClick={sendForgotPassword} disabled={busy}
                className="w-full text-sm text-muted-foreground hover:text-foreground underline-offset-4 hover:underline">
                {t("auth.forgotPassword")}
              </button>
            </>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">{t("profile.passwordLoginNotEnabled")}</p>
              <Button type="button" variant="outline" className="w-full" onClick={sendForgotPassword} disabled={busy}>
                {t("profile.setPasswordViaEmail")}
              </Button>
            </>
          )}
        </Card>

        <Card className="p-5 shadow-card mb-4">
          <Button type="button" variant="outline" className="w-full" onClick={() => navigate("/deleted-children")}>
            <Archive className="w-4 h-4 mr-2" /> {t("remove.deletedChildren")}
          </Button>
        </Card>

        <Card className="p-5 shadow-card mb-4">
          <Button type="button" variant="outline" className="w-full text-destructive hover:text-destructive"
            onClick={openDeleteDialog} disabled={busy}>
            <Trash2 className="w-4 h-4 mr-2" /> {t("remove.deleteProfile")}
          </Button>
        </Card>

        <ResponsiveAlertDialog
          open={deleteOpen}
          onOpenChange={(o) => !o && !deleteBusy && setDeleteOpen(false)}
          dismissible={!deleteBusy}
        >
          <ResponsiveAlertDialogContent>
            <ResponsiveAlertDialogHeader>
              <ResponsiveAlertDialogTitle>
                {scenario === "blocked"
                  ? t("remove.deleteProfileBlockedTitle")
                  : t("remove.deleteProfileTitle")}
              </ResponsiveAlertDialogTitle>
              <ResponsiveAlertDialogDescription className="whitespace-pre-line">
                {scenario === "blocked"   && t("remove.deleteProfileBodyBlocked")}
                {scenario === "solo"      && t("remove.deleteProfileBodySolo")}
                {scenario === "ownerWithOthers" && t("remove.deleteProfileBodyOwnerWithOthers")}
                {scenario === "default"   && t("remove.deleteProfileBodyDefault")}
              </ResponsiveAlertDialogDescription>
              {deleteCheck && (deleteCheck.blocking.length + deleteCheck.solo_destructive.length + deleteCheck.unlink.length) > 0 && (
                <ul className="mt-2 text-xs text-muted-foreground space-y-0.5">
                  {[...deleteCheck.blocking, ...deleteCheck.solo_destructive, ...deleteCheck.unlink]
                    .map((c) => <li key={c.id}>• {c.name}</li>)}
                </ul>
              )}
            </ResponsiveAlertDialogHeader>
            <ResponsiveAlertDialogFooter>
              {scenario === "blocked" ? (
                <>
                  <ResponsiveAlertDialogCancel>{t("common.cancel")}</ResponsiveAlertDialogCancel>
                  <ResponsiveAlertDialogAction onClick={() => { setDeleteOpen(false); navigate("/settings"); }}>
                    {t("remove.deleteProfileGoToChild")}
                  </ResponsiveAlertDialogAction>
                </>
              ) : (
                <>
                  <ResponsiveAlertDialogCancel disabled={deleteBusy}>{t("common.cancel")}</ResponsiveAlertDialogCancel>
                  <ResponsiveAlertDialogAction
                    disabled={deleteBusy}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    onClick={(e) => { e.preventDefault(); confirmDelete(); }}
                  >
                    {deleteBusy ? t("remove.deleting") : t("remove.deleteForever")}
                  </ResponsiveAlertDialogAction>
                </>
              )}
            </ResponsiveAlertDialogFooter>
          </ResponsiveAlertDialogContent>
        </ResponsiveAlertDialog>
      </div>
    </main>
  );
}