import { createContext, useCallback, useContext, useEffect, useRef, useState, ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import i18n from "@/i18n";
import { clearLastRoute } from "@/lib/last-route";
import { registerAuthDeepLinkListener } from "@/lib/native";

interface AuthCtx {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AuthCtx>({ user: null, session: null, loading: true, signOut: async () => {} });

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const navigate = useNavigate();
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const lastSeenUserId = useRef<string | null>(null);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, s) => {
      // If the user identity changed (logout, or login as different account),
      // wipe the persisted last route so we don't restore another user's screen.
      const nextUserId = s?.user?.id ?? null;
      if (lastSeenUserId.current && nextUserId && lastSeenUserId.current !== nextUserId) clearLastRoute();
      lastSeenUserId.current = nextUserId;
      setUser(s?.user ?? null);
      setSession(s);
      setLoading(false);
      if (s?.user) syncLanguageFromProfile(s.user.id);
      // Forgot-password emails land back here with a recovery session;
      // route to the reset form so the user can set a new password.
      if (event === "PASSWORD_RECOVERY") navigate("/auth?mode=reset", { replace: true });
    });
    let removeDeepLink: (() => void) | undefined;
    registerAuthDeepLinkListener().then((off) => { removeDeepLink = off; });
    return () => {
      subscription.unsubscribe();
      removeDeepLink?.();
    };
  }, []);

  const signOut = useCallback(async () => {
    clearLastRoute();
    // Clear app-managed caches so the next account on a shared device sees a clean slate.
    // (Supabase handles its own auth tokens via auth.signOut.)
    try {
      localStorage.removeItem("children_cache_v1");
      localStorage.removeItem("active_child_id");
    } catch { /* ignore quota / private-mode errors */ }
    await supabase.auth.signOut();
  }, []);

  return (
    <Ctx.Provider value={{ user, session, loading, signOut }}>
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
