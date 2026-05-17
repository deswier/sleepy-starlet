import { useEffect, useState } from "react";
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
} from "@/components/ui/responsive-dialog";
import {
  ResponsiveAlertDialog,
  ResponsiveAlertDialogAction,
  ResponsiveAlertDialogCancel,
  ResponsiveAlertDialogContent,
  ResponsiveAlertDialogFooter,
  ResponsiveAlertDialogHeader,
  ResponsiveAlertDialogTitle,
} from "@/components/ui/responsive-alert-dialog";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { sessionDuration, SleepSession, fmtDate } from "@/lib/sleep-utils";
import { useTimeFormat } from "@/lib/use-time-format";
import SleepForm from "./SleepForm";
import { Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/contexts/AuthContext";
import { useChildRole, canEditAnySleep, canEditOwnSleep } from "@/hooks/useChildRole";
import { localizePlace, localizeMethod } from "@/lib/localize-default";
import { DiscardChangesDialog } from "@/components/ui/discard-changes-dialog";

export default function SleepDetail({ session, onClose, onChange }: {
  session: SleepSession; onClose: () => void; onChange: () => void;
}) {
  const { t } = useTranslation();
  const { fmtTime, fmtDuration } = useTimeFormat();
  const { user } = useAuth();
  const { role } = useChildRole();
  const owns = session.created_by_user_id === user?.id;
  const canEdit = canEditAnySleep(role) || (canEditOwnSleep(role) && owns);
  const [place, setPlace] = useState<string | null>(null);
  const [method, setMethod] = useState<string | null>(null);
  const [creator, setCreator] = useState<string | null>(null);
  const [creatorLoaded, setCreatorLoaded] = useState(false);
  const [interruptions, setInterruptions] = useState<{ start_time: string; end_time: string | null; method_name: string | null }[]>([]);
  const [editing, setEditing] = useState(false);
  const [editFormDirty, setEditFormDirty] = useState(false);
  const [showDiscardEdit, setShowDiscardEdit] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Fetch every related row in a single round-trip via Supabase joins
  // instead of issuing 4 separate queries. Cancel-ref prevents stale
  // responses from overwriting state when the user opens a different
  // session quickly.
  useEffect(() => {
    let cancelled = false;
    // Run the session join (place + method + interruptions) and the creator
    // profile lookup separately because the FK on sleep_sessions.created_by_user_id
    // points to auth.users, not profiles, so PostgREST can't auto-resolve a
    // creator embed in the same query.
    Promise.all([
      supabase
        .from("sleep_sessions")
        .select(`
          sleep_place:sleep_places(name),
          settling_method:settling_methods(name),
          interruptions:sleep_interruptions(start_time,end_time,method:settling_methods(name))
        `)
        .eq("id", session.id)
        .single(),
      session.created_by_user_id
        ? supabase.from("profiles").select("display_name").eq("id", session.created_by_user_id).maybeSingle()
        : Promise.resolve({ data: null, error: null } as any),
    ]).then(([{ data, error }, { data: prof }]) => {
      if (cancelled || error || !data) return;
      const d = data as any;
      setPlace(d.sleep_place?.name ? localizePlace(d.sleep_place.name) : null);
      setMethod(d.settling_method?.name ? localizeMethod(d.settling_method.name) : null);
      setCreator((prof as any)?.display_name ?? null);
      setCreatorLoaded(true);
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
    setDeleting(true);
    const { error } = await supabase.from("sleep_sessions").delete().eq("id", session.id);
    setDeleting(false);
    setConfirmDelete(false);
    if (error) toast.error(error.message);
    else { toast.success(t("common.deleted")); onChange(); onClose(); }
  };

  const handleOpenChange = (o: boolean) => {
    if (!o && editing && editFormDirty) { setShowDiscardEdit(true); return; }
    onClose();
  };

  return (
    <ResponsiveDialog open onOpenChange={handleOpenChange}>
      <ResponsiveDialogContent>
        <ResponsiveDialogHeader><ResponsiveDialogTitle>{editing ? t("sleep.editSleep") : t("sleep.details")}</ResponsiveDialogTitle></ResponsiveDialogHeader>
        {editing ? (
          <SleepForm mode="edit" sessionId={session.id} initial={session} onDirtyChange={setEditFormDirty} onDone={() => { setEditing(false); setEditFormDirty(false); onChange(); onClose(); }} />
        ) : (
          <div className="space-y-3 text-sm">
            <Row label={t("sleep.start")} value={fmtDate(session.start_time)} />
            <Row label={t("sleep.time")} value={`${fmtTime(session.start_time)} – ${session.end_time ? fmtTime(session.end_time) : "—"}`} />
            <Row label={t("sleep.duration")} value={fmtDuration(sessionDuration(session))} />
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
                        {fmtTime(i.start_time)} – {i.end_time ? fmtTime(i.end_time) : t("sleep.ongoing")}
                      </span>
                      <span className="flex items-center gap-2">
                        {i.method_name && <span className="text-muted-foreground text-xs">{i.method_name}</span>}
                        <span className="text-xs font-medium tabular-nums">
                          {i.end_time
                            ? (() => {
                                const m = Math.max(0, Math.round((new Date(i.end_time).getTime() - new Date(i.start_time).getTime()) / 60000));
                                return fmtDuration(m);
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
            {creatorLoaded && (
              <Row label={t("sleep.createdBy")} value={creator ?? t("remove.deletedUser")} />
            )}
            {canEdit && (
              <div className="flex gap-2 pt-3">
                <Button variant="outline" className="flex-1" onClick={() => { setEditing(true); setEditFormDirty(false); }}>
                  <Pencil className="w-4 h-4 mr-1" /> {t("common.edit")}
                </Button>
                <Button type="button" variant="outline" className="flex-1 text-destructive hover:text-destructive"
                  onClick={() => setConfirmDelete(true)}>
                  <Trash2 className="w-4 h-4 mr-1" /> {t("common.delete")}
                </Button>
              </div>
            )}
          </div>
        )}
      </ResponsiveDialogContent>
      <DiscardChangesDialog
        open={showDiscardEdit}
        onOpenChange={setShowDiscardEdit}
        onDiscard={() => { setEditing(false); setEditFormDirty(false); onClose(); }}
      />
      <ResponsiveAlertDialog
        open={confirmDelete}
        onOpenChange={(o) => !o && !deleting && setConfirmDelete(false)}
        dismissible={!deleting}
      >
        <ResponsiveAlertDialogContent>
          <ResponsiveAlertDialogHeader>
            <ResponsiveAlertDialogTitle>{t("common.confirmDelete")}</ResponsiveAlertDialogTitle>
          </ResponsiveAlertDialogHeader>
          <ResponsiveAlertDialogFooter>
            <ResponsiveAlertDialogCancel disabled={deleting}>{t("common.cancel")}</ResponsiveAlertDialogCancel>
            <ResponsiveAlertDialogAction
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(e) => { e.preventDefault(); del(); }}
            >
              {t("common.delete")}
            </ResponsiveAlertDialogAction>
          </ResponsiveAlertDialogFooter>
        </ResponsiveAlertDialogContent>
      </ResponsiveAlertDialog>
    </ResponsiveDialog>
  );
}

const Row = ({ label, value }: { label: string; value: string }) => (
  <div className="flex justify-between gap-3">
    <span className="text-muted-foreground">{label}</span>
    <span className="font-medium text-right">{value}</span>
  </div>
);
