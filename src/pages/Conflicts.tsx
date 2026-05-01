import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useTranslation } from "react-i18next";
import { db, ConflictRow, onQueueChange, resolveConflict } from "@/lib/offline-queue";
import { format } from "date-fns";
import { toast } from "sonner";

export default function Conflicts() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [items, setItems] = useState<ConflictRow[]>([]);

  const load = async () => setItems(await db.conflicts.orderBy("createdAt").toArray());
  useEffect(() => {
    load();
    const off = onQueueChange(load);
    return () => { off(); };
  }, []);

  const choose = async (c: ConflictRow, side: "mine" | "theirs") => {
    await resolveConflict(c.id!, side);
    toast.success(t("conflicts.resolved"));
  };

  return (
    <main className="min-h-screen bg-hero p-4">
      <div className="max-w-md mx-auto py-4">
        <Button variant="ghost" size="sm" onClick={() => navigate(-1)} className="mb-4">
          <ArrowLeft className="w-4 h-4 mr-1" /> {t("common.back")}
        </Button>
        <h1 className="font-display text-3xl font-semibold mb-2">{t("conflicts.title")}</h1>
        <p className="text-sm text-muted-foreground mb-4">{t("conflicts.description")}</p>
        {items.length === 0 && <Card className="p-6 text-center text-muted-foreground">{t("conflicts.none")}</Card>}
        <div className="space-y-3">
          {items.map((c) => (
            <Card key={c.id} className="p-4 space-y-3">
              <div className="text-xs text-muted-foreground">{c.table} · {format(c.createdAt, "dd.MM.yy HH:mm")}</div>
              <div className="grid grid-cols-2 gap-3 text-xs">
                <Side title={t("conflicts.yourVersion")} data={c.mine} />
                <Side title={t("conflicts.serverVersion")} data={c.theirs} />
              </div>
              <div className="flex gap-2">
                <Button size="sm" className="flex-1" onClick={() => choose(c, "mine")}>{t("conflicts.keepMine")}</Button>
                <Button size="sm" variant="outline" className="flex-1" onClick={() => choose(c, "theirs")}>{t("conflicts.keepTheirs")}</Button>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </main>
  );
}

function Side({ title, data }: { title: string; data: any }) {
  const fields: [string, string][] = [
    ["start_time", "Start"],
    ["end_time", "End"],
    ["sleep_type", "Type"],
    ["comment", "Comment"],
  ];
  const fmt = (k: string, v: any) => v == null ? "—" : (k.endsWith("_time") ? format(new Date(v), "dd.MM.yy HH:mm") : String(v));
  return (
    <div className="bg-muted/50 rounded-lg p-2">
      <div className="font-semibold mb-1">{title}</div>
      {fields.map(([k, label]) => (
        <div key={k} className="flex justify-between gap-2">
          <span className="text-muted-foreground">{label}</span>
          <span>{fmt(k, data?.[k])}</span>
        </div>
      ))}
    </div>
  );
}
