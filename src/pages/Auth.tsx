import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Moon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { readLastRoute } from "@/lib/last-route";
import { getAuthRedirectUrl } from "@/lib/native";

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
  const { user, loading } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  // Default to device locale on first render; user can change before completing signup.
  const [language, setLanguage] = useState<"en" | "ru">(() => {
    const stored = typeof localStorage !== "undefined" ? localStorage.getItem("i18nextLng") : null;
    const lang = stored || (typeof navigator !== "undefined" ? navigator.language : "en");
    return lang.toLowerCase().startsWith("ru") ? "ru" : "en";
  });
  useEffect(() => { if (i18n.language !== language) i18n.changeLanguage(language); }, [language]); // eslint-disable-line

  // Single routing point: fires when AuthContext resolves `user` after any
  // sign-in method. Removing explicit routePostAuth calls from handlers
  // eliminates the double child_users query that happened on password sign-in
  // (handler fired immediately, then useEffect fired on the re-render).
  useEffect(() => { if (!loading && user) routePostAuth(navigate); }, [user, loading, navigate]);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) toast.error(error.message);
    // Routing handled by the useEffect above once user state updates.
  };
  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true);
    const { error } = await supabase.auth.signUp({
      email, password,
      options: { emailRedirectTo: getAuthRedirectUrl(), data: { display_name: name } },
    });
    if (error) { setBusy(false); toast.error(error.message); return; }
    // Persist chosen language to the profile so it follows the user across devices.
    try {
      const { data: { user: u } } = await supabase.auth.getUser();
      if (u) await supabase.from("profiles").update({ language }).eq("id", u.id);
    } catch { /* ignore */ }
    setBusy(false);
    toast.success(t("auth.welcome"));
    // Routing handled by useEffect above.
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
                <div><Label htmlFor="email">{t("auth.email")}</Label>
                  <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></div>
                <div><Label htmlFor="pw">{t("auth.password")}</Label>
                  <Input id="pw" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} /></div>
                <Button type="submit" className="w-full" disabled={busy}>{t("auth.signIn")}</Button>
              </form>
            </TabsContent>
            <TabsContent value="signup">
              <form onSubmit={handleSignUp} className="space-y-4">
                <div><Label htmlFor="name">{t("auth.yourName")}</Label>
                  <Input id="name" required value={name} onChange={(e) => setName(e.target.value)} /></div>
                <div><Label htmlFor="email2">{t("auth.email")}</Label>
                  <Input id="email2" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></div>
                <div><Label htmlFor="pw2">{t("auth.password")}</Label>
                  <Input id="pw2" type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} /></div>
                <Button type="submit" className="w-full" disabled={busy}>{t("auth.createAccount")}</Button>
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
