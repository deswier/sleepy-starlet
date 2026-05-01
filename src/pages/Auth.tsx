import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Moon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

async function routePostAuth(navigate: (to: string, opts?: any) => void) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) { navigate("/auth", { replace: true }); return; }
  const { data } = await supabase
    .from("child_users")
    .select("child_id")
    .eq("user_id", user.id)
    .limit(1);
  if (data && data.length > 0) navigate("/", { replace: true });
  else navigate("/child/new", { replace: true });
}

export default function Auth() {
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && user) routePostAuth(navigate);
  }, [user, loading, navigate]);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) toast.error(error.message);
    else routePostAuth(navigate);
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: window.location.origin, data: { display_name: name } },
    });
    setBusy(false);
    if (error) toast.error(error.message);
    else { toast.success("Welcome! Setting things up…"); routePostAuth(navigate); }
  };

  const handleGoogle = async () => {
    setBusy(true);
    const result = await lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin });
    if (result.error) { toast.error("Google sign-in failed"); setBusy(false); return; }
    if (result.redirected) return;
    routePostAuth(navigate);
  };

  return (
    <main className="min-h-screen bg-hero flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mb-4">
            <Moon className="w-8 h-8 text-primary" strokeWidth={1.5} />
          </div>
          <h1 className="font-display text-4xl font-semibold text-foreground">Lullaby</h1>
          <p className="text-muted-foreground mt-2">Gentle sleep tracking for your little one</p>
        </div>

        <Card className="p-6 shadow-soft border-border/50">
          <Tabs defaultValue="signin">
            <TabsList className="grid grid-cols-2 w-full mb-6">
              <TabsTrigger value="signin">Sign in</TabsTrigger>
              <TabsTrigger value="signup">Sign up</TabsTrigger>
            </TabsList>

            <TabsContent value="signin">
              <form onSubmit={handleSignIn} className="space-y-4">
                <div><Label htmlFor="email">Email</Label>
                  <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></div>
                <div><Label htmlFor="pw">Password</Label>
                  <Input id="pw" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} /></div>
                <Button type="submit" className="w-full" disabled={busy}>Sign in</Button>
              </form>
            </TabsContent>

            <TabsContent value="signup">
              <form onSubmit={handleSignUp} className="space-y-4">
                <div><Label htmlFor="name">Your name</Label>
                  <Input id="name" required value={name} onChange={(e) => setName(e.target.value)} /></div>
                <div><Label htmlFor="email2">Email</Label>
                  <Input id="email2" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></div>
                <div><Label htmlFor="pw2">Password</Label>
                  <Input id="pw2" type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} /></div>
                <Button type="submit" className="w-full" disabled={busy}>Create account</Button>
              </form>
            </TabsContent>
          </Tabs>

          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center"><span className="w-full border-t" /></div>
            <div className="relative flex justify-center text-xs uppercase tracking-wider">
              <span className="bg-card px-2 text-muted-foreground">Or</span>
            </div>
          </div>

          <Button variant="outline" className="w-full" onClick={handleGoogle} disabled={busy}>
            <svg className="w-4 h-4 mr-2" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
            Continue with Google
          </Button>
        </Card>
      </div>
    </main>
  );
}
