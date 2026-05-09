import { createContext, useCallback, useContext, useEffect, useRef, useState, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./AuthContext";
import { devError } from "@/lib/logger";

export interface Child {
  id: string;
  name: string;
  birth_date: string | null;
  photo_url: string | null;
  gender: "male" | "female" | "other" | null;
}

export interface ChildSettings {
  child_id: string;
  night_start_time: string;
  night_end_time: string;
  split_night_sleep_by_date: boolean;
  show_sleep_place: boolean;
  show_falling_asleep_method: boolean;
  show_interruptions: boolean;
}

export type ChildRole = "viewer" | "user" | "admin" | null;

interface ChildCtx {
  children: Child[];
  activeChild: Child | null;
  setActiveChildId: (id: string) => void;
  refresh: () => Promise<void>;
  refreshSettings: () => void;
  loading: boolean;
  settings: ChildSettings | null;
  role: ChildRole;
}

const Ctx = createContext<ChildCtx>({} as ChildCtx);
const STORAGE_KEY = "active_child_id";
const CHILDREN_CACHE_KEY = "children_cache_v1";

interface ChildrenCache { userId: string; children: Child[] }

function readChildrenCache(): ChildrenCache | null {
  try { return JSON.parse(localStorage.getItem(CHILDREN_CACHE_KEY) ?? "null"); }
  catch { return null; }
}

export const ChildProvider = ({ children }: { children: ReactNode }) => {
  const { user } = useAuth();
  const [list, setList] = useState<Child[]>([]);
  const [activeId, setActiveId] = useState<string | null>(localStorage.getItem(STORAGE_KEY));
  const [loading, setLoading] = useState(true);
  const [loadedUserId, setLoadedUserId] = useState<string | null>(null);
  const [settings, setSettings] = useState<ChildSettings | null>(null);
  const [role, setRole] = useState<ChildRole>(null);

  const activeIdRef = useRef(activeId);
  useEffect(() => { activeIdRef.current = activeId; }, [activeId]);

  // Role is per (child, user). Single source of truth — pages and components
  // read it from this context instead of each running their own query.
  useEffect(() => {
    if (!user || !activeId) { setRole(null); return; }
    let cancelled = false;
    supabase.from("child_user_roles")
      .select("role")
      .eq("child_id", activeId).eq("user_id", user.id)
      .maybeSingle()
      .then(({ data }) => { if (!cancelled) setRole((data?.role as ChildRole) ?? "user"); });
    return () => { cancelled = true; };
  }, [activeId, user?.id]);

  // Fetch settings whenever active child changes.
  // activeId is available from localStorage on first render, so this fires immediately —
  // no need to wait for the children list to load first.
  // Cancel-ref guards against a stale response from a previous activeId
  // overwriting the new one when the user switches children mid-fetch.
  useEffect(() => {
    if (!activeId) { setSettings(null); return; }
    let cancelled = false;
    supabase.from("child_settings")
      .select("child_id,night_start_time,night_end_time,split_night_sleep_by_date,show_sleep_place,show_falling_asleep_method,show_interruptions")
      .eq("child_id", activeId).single()
      .then(({ data }) => { if (!cancelled) setSettings(data as ChildSettings | null); });
    return () => { cancelled = true; };
  }, [activeId]);

  const refreshSettings = useCallback(() => {
    if (!activeId) return;
    supabase.from("child_settings")
      .select("child_id,night_start_time,night_end_time,split_night_sleep_by_date,show_sleep_place,show_falling_asleep_method,show_interruptions")
      .eq("child_id", activeId).single()
      .then(({ data }) => setSettings(data as ChildSettings | null));
  }, [activeId]);

  const refresh = useCallback(async () => {
    if (!user) { setList([]); setLoadedUserId(null); setLoading(false); return; }

    // Restore from cache instantly if same user — renders the page without waiting for network.
    const cache = readChildrenCache();
    if (cache?.userId === user.id && cache.children.length > 0) {
      setList(cache.children);
      if (!activeIdRef.current || !cache.children.find((k) => k.id === activeIdRef.current)) {
        const firstId = cache.children[0].id;
        setActiveId(firstId);
        localStorage.setItem(STORAGE_KEY, firstId);
      }
      setLoadedUserId(user.id);
      setLoading(false);
    } else {
      setLoading(true);
    }

    // Always fetch fresh data in background. try/finally guarantees we exit
    // the loading state even if the network call throws — otherwise the app
    // would be stuck on the splash screen forever after a transient failure.
    try {
      const { data, error } = await supabase
        .from("child_users")
        .select("child:children(id, name, birth_date, photo_url, gender, status)")
        .eq("user_id", user.id);
      if (error) throw error;
      // Soft-deleted children stay in the DB for the 30-day restore window
      // but must not appear anywhere in normal app flow — only in the
      // dedicated "Deleted children" page.
      const kids = (data ?? [])
        .map((r: any) => r.child)
        .filter((c: any) => c && c.status === "active")
        .sort((a: Child, b: Child) => (a.name || "").localeCompare(b.name || "") || a.id.localeCompare(b.id)) as Child[];
      setList(kids);
      const cacheData: ChildrenCache = { userId: user.id, children: kids };
      localStorage.setItem(CHILDREN_CACHE_KEY, JSON.stringify(cacheData));
      if (kids.length && (!activeIdRef.current || !kids.find((k) => k.id === activeIdRef.current))) {
        setActiveId(kids[0].id);
        localStorage.setItem(STORAGE_KEY, kids[0].id);
      }
    } catch (e) {
      devError("[ChildContext] refresh failed", e);
    } finally {
      setLoadedUserId(user.id);
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { refresh(); }, [user]); // eslint-disable-line

  const setActiveChildId = (id: string) => {
    setActiveId(id);
    localStorage.setItem(STORAGE_KEY, id);
  };

  const activeChild = list.find((c) => c.id === activeId) ?? null;
  const effectiveLoading = loading || (!!user && loadedUserId !== user.id);

  return (
    <Ctx.Provider value={{ children: list, activeChild, setActiveChildId, refresh, refreshSettings, loading: effectiveLoading, settings, role }}>
      {children}
    </Ctx.Provider>
  );
};

export const useChildren = () => useContext(Ctx);
