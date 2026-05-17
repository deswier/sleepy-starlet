import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Moon, Sun, Plus, Pause, Play, Pencil, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
  ResponsiveDialogTrigger,
} from "@/components/ui/responsive-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useChildren } from "@/contexts/ChildContext";
import { useAuth } from "@/contexts/AuthContext";
import { sessionDuration, inferSleepType, SleepSession } from "@/lib/sleep-utils";
import { useTimeFormat } from "@/lib/use-time-format";
import DateTimeField from "@/components/DateTimeField";

// SleepForm is only used inside dialogs — lazy-load to keep the initial bundle small.
const SleepForm = lazy(() => import("@/components/sleep/SleepForm"));
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { useChildRole, canCreateSleep, canEditOwnSleep, canEditAnySleep } from "@/hooks/useChildRole";
import type { DraftInterruption } from "@/components/sleep/InterruptionsEditor";
import { localizeMethod } from "@/lib/localize-default";
import { MethodOptionLabel } from "@/lib/method-icons";
import { DiscardChangesDialog } from "@/components/ui/discard-changes-dialog";

export default function CurrentSleep() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { activeChild, loading: childLoading, settings } = useChildren();
  const { user } = useAuth();
  const { role } = useChildRole();
  const { fmtTime, fmtDateTime, fmtDuration } = useTimeFormat();
  const showInterruptionFlag = settings?.show_interruptions !== false;
  const showMethodFlag = settings?.show_falling_asleep_method !== false;
  const [active, setActive] = useState<SleepSession | null>(null);
  const [interruption, setInterruption] = useState<{ id: string; start_time: string } | null>(null);
  // Stats about completed interruptions in the current sleep session.
  const [intrStats, setIntrStats] = useState<{ count: number; lastEnd: string | null }>({ count: 0, lastEnd: null });
  // Two-phase loading: first resolve "is child sleeping?" so we can render the
  // correctly-colored shell immediately, then load secondary details
  // (interruption) without blocking the initial paint.
  const [checkingActive, setCheckingActive] = useState(true);
  // Optimistic guess for the skeleton color, taken from the last known state
  // in localStorage (per child). Avoids a neutral flash before the first
  // network response resolves.
  const cacheKey = activeChild ? `cs:isSleeping:${activeChild.id}` : null;
  const [optimisticSleeping, setOptimisticSleeping] = useState<boolean>(() => {
    if (typeof window === "undefined" || !cacheKey) return false;
    return window.localStorage.getItem(cacheKey) === "1";
  });
  const [now, setNow] = useState(new Date());
  const [starting, setStarting] = useState(false);
  const [showManual, setShowManual] = useState(false);
  const [manualFormDirty, setManualFormDirty] = useState(false);
  const [showDiscardManual, setShowDiscardManual] = useState(false);
  const [editingStart, setEditingStart] = useState(false);
  const [startDraft, setStartDraft] = useState<Date>(new Date());
  const [methods, setMethods] = useState<{ id: string; name: string }[]>([]);
  // Wake-up confirmation modal — holds the draft session + pre-built
  // interruptions list so we never modify the DB before the user confirms.
  const [confirmWake, setConfirmWake] = useState<{
    session: SleepSession; interruptions: DraftInterruption[];
  } | null>(null);
  const [wakeFormDirty, setWakeFormDirty] = useState(false);
  const [showDiscardWake, setShowDiscardWake] = useState(false);
  // Inline edit of active interruption start.
  const [editingIntrStart, setEditingIntrStart] = useState(false);
  const [intrStartDraft, setIntrStartDraft] = useState<Date>(new Date());
  // Stop-interruption modal (draft).
  const [stopIntrDraft, setStopIntrDraft] = useState<{
    id: string; start: Date; end: Date; methodId: string;
  } | null>(null);
  // Snapshot of stopIntrDraft values at open time — used for dirty comparison.
  const stopIntrInitialRef = useRef<{ start: Date; end: Date; methodId: string } | null>(null);
  const [showDiscardStopIntr, setShowDiscardStopIntr] = useState(false);

  useEffect(() => {
    if (!childLoading && !activeChild) navigate("/child/new");
  }, [activeChild, childLoading, navigate]);

  useEffect(() => {
    if (!activeChild) return;
    supabase.from("settling_methods").select("id,name").eq("child_id", activeChild.id).is("deleted_at", null).order("name")
      .then(({ data: mList }) => setMethods(mList ?? []));
  }, [activeChild?.id]);

  const load = async () => {
    if (!activeChild) return;
    const { data } = await supabase
      .from("sleep_sessions").select("*")
      .eq("child_id", activeChild.id)
      .is("end_time", null)
      .order("start_time", { ascending: false })
      .limit(1).maybeSingle();
    setActive(data as SleepSession | null);
    setCheckingActive(false);
    // Persist last known state so the skeleton colors correctly next time.
    if (cacheKey) {
      try { window.localStorage.setItem(cacheKey, data ? "1" : "0"); } catch {}
    }
    setOptimisticSleeping(!!data);
    if (data) {
      const { data: allIntrs } = await supabase
        .from("sleep_interruptions").select("id,start_time,end_time")
        .eq("sleep_session_id", data.id);
      const list = allIntrs ?? [];
      const open = list.find((i: any) => !i.end_time) ?? null;
      const closed = list.filter((i: any) => i.end_time) as { end_time: string }[];
      const lastEnd = closed.length
        ? closed.reduce((a, b) => (new Date(a.end_time) > new Date(b.end_time) ? a : b)).end_time
        : null;
      setInterruption(open ? { id: open.id, start_time: open.start_time } : null);
      setIntrStats({ count: closed.length, lastEnd });
    } else {
      setInterruption(null);
      setIntrStats({ count: 0, lastEnd: null });
    }
  };

  // Re-read cache when child changes (initial state above only runs once).
  useEffect(() => {
    if (!cacheKey || typeof window === "undefined") return;
    setOptimisticSleeping(window.localStorage.getItem(cacheKey) === "1");
    setCheckingActive(true);
  }, [cacheKey]);

  useEffect(() => { load(); }, [activeChild?.id]);
  useEffect(() => {
    const i = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(i);
  }, []);

  // Realtime: react to changes in this child's sessions.
  useEffect(() => {
    if (!activeChild) return;
    const ch = supabase
      .channel(`sleep-${activeChild.id}`)
      .on("postgres_changes",
        { event: "*", schema: "public", table: "sleep_sessions", filter: `child_id=eq.${activeChild.id}` },
        () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [activeChild?.id]);

  // Interruptions realtime is filtered to the *active* session only — without
  // a filter we'd react to every other child's interruptions too. The channel
  // is recreated when the active session changes.
  useEffect(() => {
    if (!active?.id) return;
    const ch = supabase
      .channel(`intr-${active.id}`)
      .on("postgres_changes",
        { event: "*", schema: "public", table: "sleep_interruptions",
          filter: `sleep_session_id=eq.${active.id}` },
        () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [active?.id]);

  const startSleep = async () => {
    if (starting || !activeChild || !user) return;
    setStarting(true);
    try {
      const startTime = new Date();
      const type = settings ? inferSleepType(startTime, settings.night_start_time, settings.night_end_time) : "day";
      // Prevent overlap with any existing record for this child
      const { data: overlap } = await supabase.rpc("sleep_overlaps", {
        _child_id: activeChild.id,
        _start: startTime.toISOString(),
        _end: new Date(startTime.getTime() + 60_000).toISOString(),
        _exclude_id: null,
      });
      if (overlap === true) { toast.error(t("sleep.overlap")); return; }
      const { error } = await supabase.from("sleep_sessions").insert({
        child_id: activeChild.id,
        start_time: startTime.toISOString(),
        sleep_type: type,
        created_by_user_id: user.id,
      });
      if (error) toast.error(error.message); else load();
    } finally {
      setStarting(false);
    }
  };

  // Wake Up: build the draft entirely in local state — no DB write until
  // the user confirms. This prevents the previous "write + rollback on cancel"
  // pattern that could leave the DB inconsistent on browser crash.
  const wakeUp = async () => {
    if (!active) return;
    const endTime = new Date();
    const endIso = endTime.toISOString();
    // Fetch the full interruptions list for the current session so we can
    // build a complete draft (we need settling_method_id which load() omits).
    const { data: intrs } = await supabase
      .from("sleep_interruptions")
      .select("id,start_time,end_time,settling_method_id")
      .eq("sleep_session_id", active.id)
      .order("start_time");
    const draftIntrs: DraftInterruption[] = (intrs ?? []).map((r: any) => ({
      id: r.id,
      start_time: new Date(r.start_time),
      // Close any open interruption at the wake-up time (draft only).
      end_time: r.end_time ? new Date(r.end_time) : endTime,
      settling_method_id: r.settling_method_id,
    }));
    setConfirmWake({ session: { ...active, end_time: endIso }, interruptions: draftIntrs });
  };

  // FSM transitions for the pause/resume button.
  const toggleInterruption = async () => {
    if (!active || !user) return;
    if (interruption) {
      // Resume flow — open draft modal: edit start, end (default = now), settling method.
      const initStart = new Date(interruption.start_time);
      const initEnd = new Date();
      stopIntrInitialRef.current = { start: initStart, end: initEnd, methodId: "" };
      setStopIntrDraft({ id: interruption.id, start: initStart, end: initEnd, methodId: "" });
    } else {
      // Pause flow — start interruption immediately. Editable via pencil icon.
      const startIso = new Date().toISOString();
      const { error } = await supabase.from("sleep_interruptions").insert({
        sleep_session_id: active.id, start_time: startIso, created_by_user_id: user.id,
      }).select("id").single();
      if (error) { toast.error(error.message); return; }
      load();
    }
  };

  // Inline edit of the active interruption's start time.
  const beginEditIntrStart = () => {
    if (!interruption || !canEditActive) return;
    setIntrStartDraft(new Date(interruption.start_time));
    setEditingIntrStart(true);
  };
  const saveIntrStartInline = async () => {
    if (!interruption || !active) return;
    if (intrStartDraft < new Date(active.start_time)) {
      toast.error(t("sleep.interruptionOutsideSleep")); return;
    }
    if (intrStartDraft > new Date()) {
      toast.error(t("sleep.startNotFuture")); return;
    }
    const { error } = await supabase.from("sleep_interruptions")
      .update({ start_time: intrStartDraft.toISOString() })
      .eq("id", interruption.id);
    if (error) toast.error(error.message);
    else { setEditingIntrStart(false); load(); }
  };

  // Save stop-interruption draft: validate & write atomically.
  const saveStopIntr = async () => {
    if (!stopIntrDraft || !active) return;
    if (stopIntrDraft.start < new Date(active.start_time)) {
      toast.error(t("sleep.interruptionOutsideSleep")); return;
    }
    if (stopIntrDraft.end < stopIntrDraft.start) {
      toast.error(t("sleep.endAfterStart")); return;
    }
    if (stopIntrDraft.end > new Date(Date.now() + 60_000)) {
      toast.error(t("sleep.startNotFuture")); return;
    }
    const { error } = await supabase.from("sleep_interruptions")
      .update({
        start_time: stopIntrDraft.start.toISOString(),
        end_time: stopIntrDraft.end.toISOString(),
        settling_method_id: stopIntrDraft.methodId || null,
      })
      .eq("id", stopIntrDraft.id);
    if (error) toast.error(error.message);
    else { setStopIntrDraft(null); load(); }
  };

  // Cancel wake-up: just discard the local draft — nothing to roll back.
  const cancelWake = () => {
    setConfirmWake(null);
  };

  const beginEditStart = () => {
    if (!active) return;
    const owns = active.created_by_user_id === user?.id;
    if (!(canEditAnySleep(role) || (canEditOwnSleep(role) && owns))) return;
    setStartDraft(new Date(active.start_time));
    setEditingStart(true);
  };

  const saveEditStart = async () => {
    if (!active) return;
    if (startDraft > new Date()) { toast.error(t("sleep.startNotFuture")); return; }
    const { error } = await supabase.from("sleep_sessions").update({ start_time: startDraft.toISOString() }).eq("id", active.id);
    if (error) toast.error(error.message); else { setEditingStart(false); load(); }
  };

  if (!activeChild) return null;

  const ownsActive = active?.created_by_user_id === user?.id;
  // Any user/admin can stop an active sleep (wake up, pause, resume) even if
  // they didn't start it — a partner can always end the baby's nap.
  const canEnd = canCreateSleep(role);
  // Editing session data (start time, interruption times via pencil) requires
  // either having started or ended the session; admin can edit any session.
  const canEditActive = canEditAnySleep(role) || (canEditOwnSleep(role) && ownsActive);
  const canStart = canCreateSleep(role);

  const handleManualOpenChange = (o: boolean) => {
    if (!o && manualFormDirty) { setShowDiscardManual(true); return; }
    setShowManual(o);
    if (!o) setManualFormDirty(false);
  };

  const stopIntrIsDirty = !!stopIntrDraft && !!stopIntrInitialRef.current && (
    stopIntrDraft.start.getTime() !== stopIntrInitialRef.current.start.getTime() ||
    stopIntrDraft.end.getTime() !== stopIntrInitialRef.current.end.getTime() ||
    stopIntrDraft.methodId !== stopIntrInitialRef.current.methodId
  );

  const handleStopIntrOpenChange = (o: boolean) => {
    if (!o && stopIntrIsDirty) { setShowDiscardStopIntr(true); return; }
    if (!o) { setStopIntrDraft(null); stopIntrInitialRef.current = null; }
  };

  const handleWakeOpenChange = (o: boolean) => {
    if (!o && wakeFormDirty) { setShowDiscardWake(true); return; }
    if (!o) { cancelWake(); setWakeFormDirty(false); }
  };

  return (
    <section className="px-4 max-w-md mx-auto w-full">
      {checkingActive ? (
        // Skeleton uses the last-known sleep state from localStorage so the
        // background color matches what the resolved card will be — avoids
        // a flash from white → blue (or vice versa) when the query returns.
        optimisticSleeping ? (
          <Card className="p-8 text-center bg-night text-primary-foreground shadow-glow border-0 mt-4">
            <div className="w-20 h-20 rounded-full bg-white/10 animate-pulse mx-auto mb-4" />
            <div className="h-7 bg-white/10 animate-pulse rounded-lg w-3/4 mx-auto mb-2" />
            <div className="h-4 bg-white/10 animate-pulse rounded w-1/2 mx-auto mb-4" />
            <div className="h-12 bg-white/10 animate-pulse rounded-lg w-2/3 mx-auto my-4" />
            <div className="h-14 bg-white/10 animate-pulse rounded-xl w-full mb-2" />
            <div className="h-10 bg-white/10 animate-pulse rounded-xl w-full" />
          </Card>
        ) : (
          <Card className="p-8 text-center shadow-soft border-border/50 mt-4">
            <div className="w-20 h-20 rounded-full bg-primary/10 animate-pulse mx-auto mb-4" />
            <div className="h-7 bg-muted animate-pulse rounded-lg w-3/4 mx-auto mb-2" />
            <div className="h-4 bg-muted animate-pulse rounded w-1/2 mx-auto mb-6" />
            <div className="h-14 bg-muted animate-pulse rounded-xl w-full mb-3" />
            <div className="h-10 bg-muted animate-pulse rounded-xl w-full" />
          </Card>
        )
      ) : !active ? (
        <Card className="p-8 text-center shadow-soft border-border/50 mt-4">
          <div className="inline-flex w-20 h-20 rounded-full bg-primary/10 items-center justify-center mb-4">
            <Sun className="w-10 h-10 text-primary" strokeWidth={1.5} />
          </div>
          <h2 className="font-display text-2xl font-semibold mb-2">{t("sleep.awake", { name: activeChild.name })}</h2>
          <p className="text-muted-foreground text-sm mb-6">{t("sleep.readyWhen")}</p>
          <Button size="lg" className="w-full h-14 text-base shadow-glow" onClick={startSleep} disabled={!canStart || starting}>
            <Moon className="w-5 h-5 mr-2" /> {t("sleep.startSleep")}
          </Button>
          {canStart && <ResponsiveDialog open={showManual} onOpenChange={handleManualOpenChange}>
            <ResponsiveDialogTrigger asChild>
              <Button variant="ghost" className="w-full mt-3"><Plus className="w-4 h-4 mr-1" /> {t("sleep.addManually")}</Button>
            </ResponsiveDialogTrigger>
            <ResponsiveDialogContent>
              <ResponsiveDialogHeader><ResponsiveDialogTitle>{t("sleep.addSleep")}</ResponsiveDialogTitle></ResponsiveDialogHeader>
              <Suspense fallback={null}>
                <SleepForm mode="manual" onDirtyChange={setManualFormDirty} onDone={() => { setShowManual(false); setManualFormDirty(false); load(); }} />
              </Suspense>
            </ResponsiveDialogContent>
          </ResponsiveDialog>}
        </Card>
      ) : (
        <Card className="p-8 text-center bg-night text-primary-foreground shadow-glow border-0 mt-4">
          <div className="inline-flex w-20 h-20 rounded-full bg-white/10 items-center justify-center mb-4">
            <Moon className="w-10 h-10" strokeWidth={1.5} />
          </div>
          <h2 className="font-display text-2xl font-semibold mb-1">{t("sleep.sleeping", { name: activeChild.name })}</h2>
          {editingStart ? (
            <div className="flex items-center gap-2 justify-center mb-1 text-foreground bg-background/95 rounded-lg p-2">
              <DateTimeField value={startDraft} onChange={setStartDraft} />
              <Button size="icon" variant="ghost" className="h-8 w-8" onClick={saveEditStart}><Check className="w-4 h-4" /></Button>
              <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setEditingStart(false)}><X className="w-4 h-4" /></Button>
            </div>
          ) : (
            <button type="button" onClick={beginEditStart} disabled={!canEditActive}
              className="opacity-80 text-sm mb-1 inline-flex items-center gap-1 hover:opacity-100 disabled:cursor-default">
              {t("sleep.startedAt", {
                time: fmtDateTime(active.start_time),
                context: activeChild.gender === "male" ? "male"
                  : activeChild.gender === "female" ? "female" : "other",
              })}
              {canEditActive && <Pencil className="w-3 h-3" />}
            </button>
          )}
          <p className="font-display text-4xl font-semibold my-4">{fmtDuration(sessionDuration(active, now))}</p>
          {intrStats.count > 0 && (
            <div className="text-sm opacity-80 mb-3">
              {t("sleep.interruptionsCount", { count: intrStats.count })}
              {!interruption && intrStats.lastEnd && (
                <> · {t("sleep.lastWokeAgo", {
                  duration: fmtDuration(Math.max(0, Math.round((now.getTime() - new Date(intrStats.lastEnd).getTime()) / 60000))),
                })}</>
              )}
            </div>
          )}
          {interruption && (
            <div className="bg-white/10 rounded-xl px-4 py-2 mb-4 text-sm">
              {editingIntrStart ? (
                <div className="flex items-center gap-2 justify-center text-foreground bg-background/95 rounded-lg p-2">
                  <DateTimeField value={intrStartDraft} onChange={setIntrStartDraft} />
                  <Button size="icon" variant="ghost" className="h-8 w-8" onClick={saveIntrStartInline}><Check className="w-4 h-4" /></Button>
                  <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setEditingIntrStart(false)}><X className="w-4 h-4" /></Button>
                </div>
              ) : (
                <button type="button" onClick={beginEditIntrStart} disabled={!canEditActive}
                  className="inline-flex items-center gap-1 hover:opacity-100 disabled:cursor-default">
                  {t("sleep.interruptionSince", { time: fmtTime(interruption.start_time) })}
                  {canEditActive && <Pencil className="w-3 h-3" />}
                </button>
              )}
            </div>
          )}
          <div className="space-y-2">
            <Button size="lg" variant="secondary" className="w-full h-14 text-base" onClick={wakeUp} disabled={!canEnd}>
              <Sun className="w-5 h-5 mr-2" /> {t("sleep.wakeUp", {
                context: activeChild.gender === "male" ? "male"
                  : activeChild.gender === "female" ? "female" : "other",
              })}
            </Button>
            {showInterruptionFlag && canEnd && (
              <Button variant="outline" className="w-full bg-white/10 border-white/30 text-primary-foreground hover:bg-white/20 hover:text-primary-foreground" onClick={toggleInterruption}>
                {interruption ? <><Play className="w-4 h-4 mr-2" /> {t("sleep.endInterruption")}</> : <><Pause className="w-4 h-4 mr-2" /> {t("sleep.addInterruption")}</>}
              </Button>
            )}
          </div>
        </Card>
      )}
      {/* Stop-interruption modal — draft-based. */}
      <ResponsiveDialog open={!!stopIntrDraft} onOpenChange={handleStopIntrOpenChange}>
        <ResponsiveDialogContent>
          <ResponsiveDialogHeader><ResponsiveDialogTitle>{t("sleep.endInterruption")}</ResponsiveDialogTitle></ResponsiveDialogHeader>
          {stopIntrDraft && (
            <div className="space-y-3">
              <DateTimeField label={t("sleep.start")} value={stopIntrDraft.start}
                onChange={(d) => setStopIntrDraft({ ...stopIntrDraft, start: d })} />
              <DateTimeField label={t("sleep.end")} value={stopIntrDraft.end}
                onChange={(d) => setStopIntrDraft({ ...stopIntrDraft, end: d })} />
              {showMethodFlag && methods.length > 0 && (
                <div className="space-y-1.5">
                  <Label>{t("sleep.settling")}</Label>
                  <Select value={stopIntrDraft.methodId || "none"}
                    onValueChange={(v) => setStopIntrDraft({ ...stopIntrDraft, methodId: v === "none" ? "" : v })}>
                    <SelectTrigger><SelectValue placeholder={t("common.select")} /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">{t("common.none")}</SelectItem>
                      {methods.map((m) => (
                        <SelectItem key={m.id} value={m.id}>
                          <MethodOptionLabel name={m.name} label={localizeMethod(m.name)} />
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="flex gap-2 pt-2">
                <Button variant="outline" className="flex-1" onClick={() => setStopIntrDraft(null)}>
                  {t("common.cancel")}
                </Button>
                <Button className="flex-1" onClick={saveStopIntr}>{t("common.save")}</Button>
              </div>
            </div>
          )}
        </ResponsiveDialogContent>
      </ResponsiveDialog>

      {/* Wake Up confirmation modal — full edit before saving. */}
      <ResponsiveDialog open={!!confirmWake} onOpenChange={handleWakeOpenChange}>
        <ResponsiveDialogContent>
          <ResponsiveDialogHeader>
            <ResponsiveDialogTitle>{t("sleep.wakeUp", {
              context: activeChild?.gender === "male" ? "male"
                : activeChild?.gender === "female" ? "female" : "other",
            })}</ResponsiveDialogTitle>
          </ResponsiveDialogHeader>
          {confirmWake && (
            <Suspense fallback={null}>
              <SleepForm
                mode="edit"
                sessionId={confirmWake.session.id}
                initial={confirmWake.session}
                initialInterruptions={confirmWake.interruptions}
                onDirtyChange={setWakeFormDirty}
                onDone={() => { setConfirmWake(null); setWakeFormDirty(false); load(); }}
              />
            </Suspense>
          )}
        </ResponsiveDialogContent>
      </ResponsiveDialog>

      <DiscardChangesDialog
        open={showDiscardManual}
        onOpenChange={setShowDiscardManual}
        onDiscard={() => { setShowManual(false); setManualFormDirty(false); }}
      />
      <DiscardChangesDialog
        open={showDiscardStopIntr}
        onOpenChange={setShowDiscardStopIntr}
        onDiscard={() => { setStopIntrDraft(null); stopIntrInitialRef.current = null; }}
      />
      <DiscardChangesDialog
        open={showDiscardWake}
        onOpenChange={setShowDiscardWake}
        onDiscard={() => { cancelWake(); setWakeFormDirty(false); }}
      />
    </section>
  );
}
