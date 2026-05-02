import { createContext, useCallback, useContext, useEffect, useRef, useState, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./AuthContext";

export interface Child {
  id: string;
  name: string;
  birth_date: string | null;
  photo_url: string | null;
  gender: "male" | "female" | "other" | null;
}

interface ChildCtx {
  children: Child[];
  activeChild: Child | null;
  setActiveChildId: (id: string) => void;
  refresh: () => Promise<void>;
  loading: boolean;
}

const Ctx = createContext<ChildCtx>({} as ChildCtx);
const STORAGE_KEY = "active_child_id";

export const ChildProvider = ({ children }: { children: ReactNode }) => {
  const { user } = useAuth();
  const [list, setList] = useState<Child[]>([]);
  const [activeId, setActiveId] = useState<string | null>(localStorage.getItem(STORAGE_KEY));
  const [loading, setLoading] = useState(true);
  const [loadedUserId, setLoadedUserId] = useState<string | null>(null);

  // Ref so refresh always reads the latest activeId without becoming a dep.
  const activeIdRef = useRef(activeId);
  useEffect(() => { activeIdRef.current = activeId; }, [activeId]);

  const refresh = useCallback(async () => {
    if (!user) {
      setList([]);
      setLoadedUserId(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data } = await supabase
      .from("child_users")
      .select("child:children(id, name, birth_date, photo_url, gender)")
      .eq("user_id", user.id);
    const kids = (data ?? [])
      .map((r: any) => r.child)
      .filter(Boolean)
      .sort((a: Child, b: Child) => (a.name || "").localeCompare(b.name || "") || a.id.localeCompare(b.id)) as Child[];
    setList(kids);
    if (kids.length && (!activeIdRef.current || !kids.find((k) => k.id === activeIdRef.current))) {
      setActiveId(kids[0].id);
      localStorage.setItem(STORAGE_KEY, kids[0].id);
    }
    setLoadedUserId(user.id);
    setLoading(false);
  }, [user]);

  useEffect(() => { refresh(); }, [user]); // eslint-disable-line

  const setActiveChildId = (id: string) => {
    setActiveId(id);
    localStorage.setItem(STORAGE_KEY, id);
  };

  const activeChild = list.find((c) => c.id === activeId) ?? null;

  const effectiveLoading = loading || (!!user && loadedUserId !== user.id);

  return (
    <Ctx.Provider value={{ children: list, activeChild, setActiveChildId, refresh, loading: effectiveLoading }}>
      {children}
    </Ctx.Provider>
  );
};

export const useChildren = () => useContext(Ctx);
