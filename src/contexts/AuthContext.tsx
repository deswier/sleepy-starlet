import { createContext, useContext, useEffect, useRef, useState, ReactNode } from "react";
import { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import i18n from "@/i18n";
import { clearLastRoute } from "@/lib/last-route";

interface AuthCtx {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AuthCtx>({ user: null, session: null, loading: true, signOut: async () => {} });

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const lastSeenUserId = useRef<string | null>(null);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => {
      // If the user identity changed (logout, or login as different account),
      // wipe the persisted last route so we don't restore another user's screen.
      const nextUserId = s?.user?.id ?? null;
      if (lastSeenUserId.current && nextUserId && lastSeenUserId.current !== nextUserId) clearLastRoute();
      lastSeenUserId.current = nextUserId;
      setUser(s?.user ?? null);
      setSession(s);
      setLoading(false);
      if (s?.user) syncLanguageFromProfile(s.user.id);
    });
    return () => subscription.unsubscribe();
  }, []);

  return (
    <Ctx.Provider value={{ user, session, loading, signOut: async () => { clearLastRoute(); await supabase.auth.signOut(); } }}>
      {children}
    </Ctx.Provider>
  );
};

export const useAuth = () => useContext(Ctx);

async function syncLanguageFromProfile(userId: string) {
  try {
    const { data } = await supabase.from("profiles").select("language").eq("id", userId).maybeSingle();
    const lang = (data as { language?: string } | null)?.language;
    if (lang && (lang === "ru" || lang === "en") && i18n.language !== lang) {
      i18n.changeLanguage(lang);
    }
  } catch { /* ignore */ }
}
