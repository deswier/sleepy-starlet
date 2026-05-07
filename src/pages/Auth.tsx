import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Mail, Moon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/PasswordInput";
import { RequiredMark } from "@/components/RequiredMark";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { readLastRoute } from "@/lib/last-route";
import { getAuthRedirectUrl } from "@/lib/native";
import { authErrorMessage } from "@/lib/auth-errors";

async function routePostAuth(navigate: (to: string, opts?: any) => void) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) { navigate("/auth", { replace: true }); return; }
  const { data } = await supabase.from("child_users").select("child_id").eq("user_id", user.id).limit(1);
  if (data && data.length > 0) {
    const last = readLastRoute(user.id);
    navigate(last?.path || "/", { replace: true });
  } else {
    navigate("/child/new", { replace: true });
  }
}

export default function Auth() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isResetMode = searchParams.get("mode") === "reset";
  const { user, loading } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [repeatPassword, setRepeatPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmationSent, setConfirmationSent] = useState(false);
  // Forgot-password flow has its own two-step state: request screen, then
  // "we sent a link" screen. The PASSWORD_RECOVERY return is handled by URL
  // ?mode=reset (set by AuthContext when the recovery event fires).
  const [forgotMode, setForgotMode] = useState(false);
  const [resetEmailSent, setResetEmailSent] = useState(false);
  const passwordMismatch = repeatPassword.length > 0 && repeatPassword !== password;
  // Default to device locale on first render; user can change before completing signup.
  const [language, setLanguage] = useState<"en" | "ru">(() => {
    const stored = typeof localStorage !== "undefined" ? localStorage.getItem("i18nextLng") : null;
    const lang = stored || (typeof navigator !== "undefined" ? navigator.language : "en");
    return lang.toLowerCase().startsWith("ru") ? "ru" : "en";
  });
  useEffect(() => { if (i18n.language !== language) i18n.changeLanguage(language); }, [language]); // eslint-disable-line

  // Single routing point: fires when AuthContext resolves `user` after any
  // sign-in method. In recovery mode the user has a (temporary) session but
  // must set a password first — don't auto-route them home.
  useEffect(() => {
    if (!loading && user && !isResetMode) routePostAuth(navigate);
  }, [user, loading, navigate, isResetMode]);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) toast.error(authErrorMessage(error, t));
    // Routing handled by the useEffect above once user state updates.
  };
  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== repeatPassword) { toast.error(t("auth.passwordMismatch")); return; }
    setBusy(true);
    const { data, error } = await supabase.auth.signUp({
      email, password,
      options: { emailRedirectTo: getAuthRedirectUrl(), data: { display_name: name } },
    });
    if (error) { setBusy(false); toast.error(authErrorMessage(error, t)); return; }
    if (!data.session) {
      // Email confirmation required — show confirmation screen, don't route.
      setBusy(false);
      setConfirmationSent(true);
      return;
    }
    // Immediately signed in (email confirmation disabled in Supabase settings).
    try {
      const { data: { user: u } } = await supabase.auth.getUser();
      if (u) await supabase.from("profiles").update({ language }).eq("id", u.id);
    } catch { /* ignore */ }
    setBusy(false);
    toast.success(t("auth.welcome"));
    // Routing handled by useEffect above.
  };
  const handleForgot = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: getAuthRedirectUrl(),
    });
    setBusy(false);
    if (error) { toast.error(authErrorMessage(error, t)); return; }
    setResetEmailSent(true);
  };

  const handleResetSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return; // guard against double submit
    if (password !== repeatPassword) { toast.error(t("auth.passwordMismatch")); return; }
    setBusy(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) { toast.error(authErrorMessage(error, t)); return; }
      toast.success(t("auth.passwordResetSuccess"));
      // Navigate unconditionally — RequireAuth and Index.tsx already handle
      // the unauthenticated and no-children cases.
      navigate("/", { replace: true });
    } finally {
      setBusy(false);
    }
  };

  const handleGoogle = async () => {
    setBusy(true);
    // Supabase's signInWithOAuth navigates the browser to Google and back. On
    // return, detectSessionInUrl parses tokens, AuthContext picks them up via
    // onAuthStateChange, and the routing useEffect above runs.
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: getAuthRedirectUrl() },
    });
    if (error) { toast.error(t("auth.googleFailed")); setBusy(false); }
  };

  if (isResetMode) {
    // Recovery link without a recovery session = expired or already-used link.
    // Don't show the password form: it would just fail on submit; surface the
    // problem clearly and offer to request a fresh link.
    if (!loading && !user) {
      return (
        <main className="min-h-screen bg-hero flex items-center justify-center p-4">
          <div className="w-full max-w-md">
            <div className="text-center mb-8">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mb-4">
                <Moon className="w-8 h-8 text-primary" strokeWidth={1.5} />
              </div>
              <h1 className="font-display text-4xl font-semibold text-foreground">{t("app.name")}</h1>
            </div>
            <Card className="p-6 shadow-soft border-border/50 space-y-4 text-center">
              <h2 className="text-xl font-semibold">{t("auth.linkExpired")}</h2>
              <Button className="w-full"
                onClick={() => { navigate("/auth", { replace: true }); setForgotMode(true); }}>
                {t("auth.requestNewLink")}
              </Button>
              <Button variant="ghost" className="w-full"
                onClick={() => navigate("/auth", { replace: true })}>
                {t("auth.backToSignIn")}
              </Button>
            </Card>
          </div>
        </main>
      );
    }
    return (
      <main className="min-h-screen bg-hero flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mb-4">
              <Moon className="w-8 h-8 text-primary" strokeWidth={1.5} />
            </div>
            <h1 className="font-display text-4xl font-semibold text-foreground">{t("app.name")}</h1>
          </div>
          <Card className="p-6 shadow-soft border-border/50">
            <h2 className="text-xl font-semibold mb-4">{t("auth.resetPasswordTitle")}</h2>
            <form onSubmit={handleResetSubmit} className="space-y-4">
              <div>
                <Label htmlFor="newPw"><RequiredMark />{t("auth.newPassword")}</Label>
                <PasswordInput id="newPw" autoComplete="new-password" required minLength={6}
                  value={password} onChange={setPassword} />
              </div>
              <div>
                <Label htmlFor="newPw2"><RequiredMark />{t("auth.repeatPassword")}</Label>
                <PasswordInput id="newPw2" autoComplete="new-password" required minLength={6}
                  aria-invalid={passwordMismatch}
                  value={repeatPassword} onChange={setRepeatPassword} />
                {passwordMismatch && (
                  <p className="text-xs text-destructive mt-1">{t("auth.passwordMismatch")}</p>
                )}
              </div>
              <Button type="submit" className="w-full"
                disabled={busy || password.length < 6 || passwordMismatch || repeatPassword.length === 0}>
                {busy ? t("common.saving") : t("common.save")}
              </Button>
            </form>
          </Card>
        </div>
      </main>
    );
  }

  if (resetEmailSent) {
    return (
      <main className="min-h-screen bg-hero flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mb-4">
              <Moon className="w-8 h-8 text-primary" strokeWidth={1.5} />
            </div>
            <h1 className="font-display text-4xl font-semibold text-foreground">{t("app.name")}</h1>
          </div>
          <Card className="p-8 shadow-soft border-border/50 text-center space-y-4">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-green-100 dark:bg-green-900/30">
              <Mail className="w-7 h-7 text-green-600 dark:text-green-400" />
            </div>
            <h2 className="text-xl font-semibold">{t("auth.resetEmailSent")}</h2>
            <p className="text-muted-foreground text-sm leading-relaxed">
              {t("auth.resetEmailSentDesc", { email })}
            </p>
            <Button variant="ghost" onClick={() => { setResetEmailSent(false); setForgotMode(false); }}
              className="w-full">
              {t("auth.backToSignIn")}
            </Button>
          </Card>
        </div>
      </main>
    );
  }

  if (forgotMode) {
    return (
      <main className="min-h-screen bg-hero flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mb-4">
              <Moon className="w-8 h-8 text-primary" strokeWidth={1.5} />
            </div>
            <h1 className="font-display text-4xl font-semibold text-foreground">{t("app.name")}</h1>
          </div>
          <Card className="p-6 shadow-soft border-border/50">
            <h2 className="text-xl font-semibold mb-1">{t("auth.forgotPasswordTitle")}</h2>
            <p className="text-sm text-muted-foreground mb-4">{t("auth.forgotPasswordDesc")}</p>
            <form onSubmit={handleForgot} className="space-y-4">
              <div>
                <Label htmlFor="femail"><RequiredMark />{t("auth.email")}</Label>
                <Input id="femail" type="email" autoComplete="email" required
                  value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              <Button type="submit" className="w-full" disabled={busy || !email}>
                {t("auth.sendResetLink")}
              </Button>
              <Button type="button" variant="ghost" className="w-full"
                onClick={() => setForgotMode(false)}>
                {t("auth.backToSignIn")}
              </Button>
            </form>
          </Card>
        </div>
      </main>
    );
  }

  if (confirmationSent) {
    return (
      <main className="min-h-screen bg-hero flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mb-4">
              <Moon className="w-8 h-8 text-primary" strokeWidth={1.5} />
            </div>
            <h1 className="font-display text-4xl font-semibold text-foreground">{t("app.name")}</h1>
          </div>
          <Card className="p-8 shadow-soft border-border/50 text-center space-y-4">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-green-100 dark:bg-green-900/30">
              <Mail className="w-7 h-7 text-green-600 dark:text-green-400" />
            </div>
            <h2 className="text-xl font-semibold">{t("auth.checkEmail")}</h2>
            <p className="text-muted-foreground text-sm leading-relaxed">
              {t("auth.checkEmailDesc", { email })}
            </p>
            <p className="text-xs text-muted-foreground/70">
              {t("auth.checkEmailNote")}
            </p>
            <p className="text-xs text-muted-foreground pt-2 border-t border-border/50">
              {t("auth.resendHint")}
            </p>
          </Card>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-hero flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mb-4">
            <Moon className="w-8 h-8 text-primary" strokeWidth={1.5} />
          </div>
          <h1 className="font-display text-4xl font-semibold text-foreground">{t("app.name")}</h1>
          <p className="text-muted-foreground mt-2">{t("app.tagline")}</p>
        </div>
        <Card className="p-6 shadow-soft border-border/50">
          <div className="flex justify-end mb-3">
            <Select value={language} onValueChange={(v: "en" | "ru") => setLanguage(v)}>
              <SelectTrigger className="h-9 w-[140px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="en">English</SelectItem>
                <SelectItem value="ru">Русский</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Tabs defaultValue="signin">
            <TabsList className="grid grid-cols-2 w-full mb-6">
              <TabsTrigger value="signin">{t("auth.signIn")}</TabsTrigger>
              <TabsTrigger value="signup">{t("auth.signUp")}</TabsTrigger>
            </TabsList>
            <TabsContent value="signin">
              <form onSubmit={handleSignIn} className="space-y-4">
                <div>
                  <Label htmlFor="email"><RequiredMark />{t("auth.email")}</Label>
                  <Input id="email" type="email" autoComplete="email" required
                    value={email} onChange={(e) => setEmail(e.target.value)} />
                </div>
                <div>
                  <Label htmlFor="pw"><RequiredMark />{t("auth.password")}</Label>
                  <PasswordInput id="pw" autoComplete="current-password" required
                    value={password} onChange={setPassword} />
                </div>
                <Button type="submit" className="w-full" disabled={busy}>{t("auth.signIn")}</Button>
                <button type="button"
                  onClick={() => setForgotMode(true)}
                  className="w-full text-sm text-muted-foreground hover:text-foreground underline-offset-4 hover:underline">
                  {t("auth.forgotPassword")}
                </button>
              </form>
            </TabsContent>
            <TabsContent value="signup">
              <form onSubmit={handleSignUp} className="space-y-4">
                <div>
                  <Label htmlFor="name"><RequiredMark />{t("auth.yourName")}</Label>
                  <Input id="name" autoComplete="name" required
                    value={name} onChange={(e) => setName(e.target.value)} />
                </div>
                <div>
                  <Label htmlFor="email2"><RequiredMark />{t("auth.email")}</Label>
                  <Input id="email2" type="email" autoComplete="email" required
                    value={email} onChange={(e) => setEmail(e.target.value)} />
                </div>
                <div>
                  <Label htmlFor="pw2"><RequiredMark />{t("auth.password")}</Label>
                  <PasswordInput id="pw2" autoComplete="new-password" required minLength={6}
                    value={password} onChange={setPassword} />
                </div>
                <div>
                  <Label htmlFor="pw3"><RequiredMark />{t("auth.repeatPassword")}</Label>
                  <PasswordInput id="pw3" autoComplete="new-password" required minLength={6}
                    aria-invalid={passwordMismatch}
                    value={repeatPassword} onChange={setRepeatPassword} />
                  {passwordMismatch && (
                    <p className="text-xs text-destructive mt-1">{t("auth.passwordMismatch")}</p>
                  )}
                </div>
                <Button type="submit" className="w-full"
                  disabled={busy || passwordMismatch || repeatPassword.length === 0}>
                  {t("auth.createAccount")}
                </Button>
              </form>
            </TabsContent>
          </Tabs>
          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center"><span className="w-full border-t" /></div>
            <div className="relative flex justify-center text-xs uppercase tracking-wider">
              <span className="bg-card px-2 text-muted-foreground">{t("auth.or")}</span>
            </div>
          </div>
          <Button variant="outline" className="w-full" onClick={handleGoogle} disabled={busy}>
            <svg className="w-4 h-4 mr-2" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
            {t("auth.continueGoogle")}
          </Button>
        </Card>
      </div>
    </main>
  );
}
