import { createContext, useCallback, useContext, useEffect, useRef, useState, ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import i18n from "@/i18n";
import { clearLastRoute } from "@/lib/last-route";
import { registerAuthDeepLinkListener } from "@/lib/native";
import { wipeChildResourceCaches } from "@/lib/child-resources-cache";
import type { TimeFormat } from "@/lib/sleep-utils";

interface AuthCtx {
  user: User | null;
  session: Session | null;
  loading: boolean;
  timeFormat: TimeFormat;
  setTimeFormat: (tf: TimeFormat) => void;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AuthCtx>({ user: null, session: null, loading: true, timeFormat: "system", setTimeFormat: () => {}, signOut: async () => {} });

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const navigate = useNavigate();
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [timeFormat, setTimeFormat] = useState<TimeFormat>("system");
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
      if (s?.user) syncLanguageFromProfile(s.user.id, setTimeFormat);
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
      localStorage.removeItem("device_id");
      localStorage.removeItem("analytics.tab");
      // Clear per-child keys (cs:isSleeping:*, analytics.day.*, etc.) without
      // knowing which child IDs were active — collect first, then remove.
      const prefixes = ["cs:isSleeping:", "analytics.day.", "analytics.weekOffset.", "analytics.weekExcluded.", "tour:"];
      const toRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && prefixes.some((p) => k.startsWith(p))) toRemove.push(k);
      }
      toRemove.forEach((k) => localStorage.removeItem(k));
    } catch { /* ignore quota / private-mode errors */ }
    // Wipe per-child Dexie caches so the next account on a shared device
    // doesn't see the previous user's settings / role / places / methods.
    await wipeChildResourceCaches().catch(() => { /* best effort */ });
    await supabase.auth.signOut();
  }, []);

  return (
    <Ctx.Provider value={{ user, session, loading, timeFormat, setTimeFormat, signOut }}>
      {children}
    </Ctx.Provider>
  );
};

export const useAuth = () => useContext(Ctx);

async function syncLanguageFromProfile(userId: string, onTimeFormat: (tf: TimeFormat) => void) {
  try {
    const { data } = await supabase.from("profiles").select("language,time_format").eq("id", userId).maybeSingle();
    const d = data as { language?: string; time_format?: string } | null;
    if (d?.language && (d.language === "ru" || d.language === "en") && i18n.language !== d.language) {
      i18n.changeLanguage(d.language);
    }
    if (d?.time_format && (["system", "h12", "h24"] as string[]).includes(d.time_format)) {
      onTimeFormat(d.time_format as TimeFormat);
    }
  } catch { /* ignore */ }
}
