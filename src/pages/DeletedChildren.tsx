import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, RotateCcw } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useChildren } from "@/contexts/ChildContext";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { fmtDate } from "@/lib/sleep-utils";

interface DeletedChild {
  id: string;
  name: string;
  deleted_at: string;
  deleted_by_user_id: string | null;
  deletion_scheduled_at: string;
  deleted_by_name: string | null;
}

export default function DeletedChildren() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { refresh } = useChildren();
  const [items, setItems] = useState<DeletedChild[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    if (!user) return;
    setLoading(true);
    try {
      // Owners-only: filter on role=admin so the page never shows children the
      // viewer can't restore. The Restore RPC re-checks server-side.
      const { data, error } = await supabase
        .from("child_user_roles")
        .select("child:children(id,name,deleted_at,deleted_by_user_id,deletion_scheduled_at,status)")
        .eq("user_id", user.id)
        .eq("role", "admin");
      if (error) throw error;
      const rows = (data ?? [])
        .map((r: any) => r.child)
        .filter((c: any) => c && c.status === "deleted");
      const deleterIds = Array.from(
        new Set(rows.map((r: any) => r.deleted_by_user_id).filter(Boolean)),
      ) as string[];
      let nameMap = new Map<string, string>();
      if (deleterIds.length > 0) {
        const { data: profs } = await supabase
          .from("profiles")
          .select("id,display_name")
          .in("id", deleterIds);
        nameMap = new Map((profs ?? []).map((p: any) => [p.id, p.display_name ?? ""]));
      }
      setItems(
        rows.map((r: any) => ({
          id: r.id,
          name: r.name,
          deleted_at: r.deleted_at,
          deletion_scheduled_at: r.deletion_scheduled_at,
          deleted_by_user_id: r.deleted_by_user_id,
          deleted_by_name: r.deleted_by_user_id ? (nameMap.get(r.deleted_by_user_id) || null) : null,
        })),
      );
    } catch {
      toast.error(t("common.loadFailed"));
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, [user?.id]);

  const restore = async (id: string) => {
    const { error } = await supabase.rpc("restore_child", { _child_id: id } as any);
    if (error) { toast.error(error.message || t("remove.restoreFailed")); return; }
    toast.success(t("common.saved"));
    await refresh();
    load();
  };

  const daysLeft = (scheduledAt: string) => {
    const ms = new Date(scheduledAt).getTime() - Date.now();
    return Math.max(0, Math.ceil(ms / 86_400_000));
  };

  return (
    <main className="min-h-screen bg-hero p-4">
      <div className="max-w-md mx-auto py-4">
        <Button variant="ghost" size="sm" onClick={() => navigate(-1)} className="mb-4">
          <ArrowLeft className="w-4 h-4 mr-1" /> {t("common.back")}
        </Button>
        <h1 className="font-display text-3xl font-semibold mb-6">{t("remove.deletedChildren")}</h1>
        {!loading && items.length === 0 && (
          <Card className="p-5 text-center text-muted-foreground text-sm">
            {t("remove.deletedEmpty")}
          </Card>
        )}
        {items.map((it) => {
          const days = daysLeft(it.deletion_scheduled_at);
          return (
            <Card key={it.id} className="p-5 shadow-card mb-3 space-y-2">
              <h3 className="font-semibold">{it.name}</h3>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">{t("remove.deletedAt")}</span>
                <span>{fmtDate(it.deleted_at)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">{t("remove.deletedBy")}</span>
                <span>{it.deleted_by_name ?? t("remove.deletedUser")}</span>
              </div>
              <div className="text-sm text-muted-foreground">
                {t("remove.daysLeft", { count: days })}
              </div>
              <Button onClick={() => restore(it.id)} className="w-full">
                <RotateCcw className="w-4 h-4 mr-2" /> {t("remove.restore")}
              </Button>
            </Card>
          );
        })}
      </div>
    </main>
  );
}
