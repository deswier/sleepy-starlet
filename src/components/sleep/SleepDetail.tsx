import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { formatDuration, formatTime, sessionDuration, SleepSession, fmtDate } from "@/lib/sleep-utils";
import { differenceInMinutes } from "date-fns";
import SleepForm from "./SleepForm";
import { Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/contexts/AuthContext";
import { useChildRole, canEditAnySleep, canEditOwnSleep } from "@/hooks/useChildRole";
import { localizePlace, localizeMethod } from "@/lib/localize-default";

export default function SleepDetail({ session, onClose, onChange }: {
  session: SleepSession; onClose: () => void; onChange: () => void;
}) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { role } = useChildRole();
  const owns = session.created_by_user_id === user?.id;
  const canEdit = canEditAnySleep(role) || (canEditOwnSleep(role) && owns);
  const [place, setPlace] = useState<string | null>(null);
  const [method, setMethod] = useState<string | null>(null);
  const [creator, setCreator] = useState<string | null>(null);
  const [interruptions, setInterruptions] = useState<{ start_time: string; end_time: string | null; method_name: string | null }[]>([]);
  const [editing, setEditing] = useState(false);

  // Fetch every related row in a single round-trip via Supabase joins
  // instead of issuing 4 separate queries. Cancel-ref prevents stale
  // responses from overwriting state when the user opens a different
  // session quickly.
  useEffect(() => {
    let cancelled = false;
    supabase
      .from("sleep_sessions")
      .select(`
        sleep_place:sleep_places(name),
        settling_method:settling_methods(name),
        creator:profiles!sleep_sessions_created_by_user_id_fkey(display_name),
        interruptions:sleep_interruptions(start_time,end_time,method:settling_methods(name))
      `)
      .eq("id", session.id)
      .single()
      .then(({ data, error }) => {
        if (cancelled || error || !data) return;
        const d = data as any;
        setPlace(d.sleep_place?.name ? localizePlace(d.sleep_place.name) : null);
        setMethod(d.settling_method?.name ? localizeMethod(d.settling_method.name) : null);
        setCreator(d.creator?.display_name ?? null);
        const intrs = (d.interruptions ?? []) as any[];
        setInterruptions(
          intrs
            .slice()
            .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime())
            .map((row) => ({
              start_time: row.start_time,
              end_time: row.end_time,
              method_name: row.method?.name ? localizeMethod(row.method.name) : null,
            })),
        );
      });
    return () => { cancelled = true; };
  }, [session.id]);

  const del = async () => {
    if (!confirm(t("common.confirmDelete"))) return;
    const { error } = await supabase.from("sleep_sessions").delete().eq("id", session.id);
    if (error) toast.error(error.message);
    else { toast.success(t("common.deleted")); onChange(); onClose(); }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{editing ? t("sleep.editSleep") : t("sleep.details")}</DialogTitle></DialogHeader>
        {editing ? (
          <SleepForm mode="edit" sessionId={session.id} initial={session} onDone={() => { setEditing(false); onChange(); onClose(); }} />
        ) : (
          <div className="space-y-3 text-sm">
            <Row label={t("sleep.start")} value={fmtDate(session.start_time)} />
            <Row label={t("sleep.time")} value={`${formatTime(session.start_time)} – ${session.end_time ? formatTime(session.end_time) : "—"}`} />
            <Row label={t("sleep.duration")} value={formatDuration(sessionDuration(session))} />
            <Row label={t("sleep.type")} value={session.sleep_type === "night" ? t("sleep.night") : t("sleep.day")} />
            {place && <Row label={t("sleep.place_label")} value={place} />}
            {method && <Row label={t("sleep.settling_label")} value={method} />}
            {interruptions.length > 0 && (
              <div>
                <div className="text-muted-foreground text-xs uppercase tracking-wide mb-1">{t("sleep.interruptions")}</div>
                <ul className="space-y-1">
                  {interruptions.map((i, idx) => (
                    <li key={idx} className="bg-muted/60 rounded-lg px-3 py-1.5 flex justify-between gap-2 items-center">
                      <span>
                        {formatTime(i.start_time)} – {i.end_time ? formatTime(i.end_time) : t("sleep.ongoing")}
                      </span>
                      <span className="flex items-center gap-2">
                        {i.method_name && <span className="text-muted-foreground text-xs">{i.method_name}</span>}
                        <span className="text-xs font-medium tabular-nums">
                          {i.end_time
                            ? (() => {
                                const m = Math.max(0, differenceInMinutes(new Date(i.end_time), new Date(i.start_time)));
                                return m === 0 ? "0m" : formatDuration(m);
                              })()
                            : t("sleep.active")}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {session.comment && <Row label={t("sleep.comment")} value={session.comment} />}
            {creator && <Row label={t("sleep.createdBy")} value={creator} />}
            {canEdit && (
              <div className="flex gap-2 pt-3">
                <Button variant="outline" className="flex-1" onClick={() => setEditing(true)}>
                  <Pencil className="w-4 h-4 mr-1" /> {t("common.edit")}
                </Button>
                <Button variant="outline" className="flex-1 text-destructive hover:text-destructive" onClick={del}>
                  <Trash2 className="w-4 h-4 mr-1" /> {t("common.delete")}
                </Button>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

const Row = ({ label, value }: { label: string; value: string }) => (
  <div className="flex justify-between gap-3">
    <span className="text-muted-foreground">{label}</span>
    <span className="font-medium text-right">{value}</span>
  </div>
);
