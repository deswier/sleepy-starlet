import { lazy, Suspense, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Moon, Sun, Plus, Pause, Play, Pencil, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useChildren } from "@/contexts/ChildContext";
import { useAuth } from "@/contexts/AuthContext";
import { formatDuration, sessionDuration, inferSleepType, SleepSession } from "@/lib/sleep-utils";
import DateTimeField from "@/components/DateTimeField";

// SleepForm is only used inside dialogs — lazy-load to keep the initial bundle small.
const SleepForm = lazy(() => import("@/components/sleep/SleepForm"));
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { fmtDateTime, formatTime } from "@/lib/sleep-utils";
import { useChildRole, canCreateSleep, canEditOwnSleep, canEditAnySleep } from "@/hooks/useChildRole";
import { localizeMethod } from "@/lib/localize-default";
import { MethodOptionLabel } from "@/lib/method-icons";

export default function CurrentSleep() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { activeChild, loading: childLoading, settings } = useChildren();
  const { user } = useAuth();
  const { role } = useChildRole();
  const showInterruptionFlag = settings?.show_interruptions !== false;
  const showMethodFlag = settings?.show_falling_asleep_method !== false;
  const [active, setActive] = useState<SleepSession | null>(null);
  const [interruption, setInterruption] = useState<{ id: string; start_time: string } | null>(null);
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
  const [showManual, setShowManual] = useState(false);
  const [editingStart, setEditingStart] = useState(false);
  const [startDraft, setStartDraft] = useState<Date>(new Date());
  const [methods, setMethods] = useState<{ id: string; name: string }[]>([]);
  // Wake-up confirmation modal (draft, replaces silent save).
  const [confirmWake, setConfirmWake] = useState<SleepSession | null>(null);
  // Inline edit of active interruption start.
  const [editingIntrStart, setEditingIntrStart] = useState(false);
  const [intrStartDraft, setIntrStartDraft] = useState<Date>(new Date());
  // Stop-interruption modal (draft).
  const [stopIntrDraft, setStopIntrDraft] = useState<{
    id: string; start: Date; end: Date; methodId: string;
  } | null>(null);

  useEffect(() => {
    if (!childLoading && !activeChild) navigate("/child/new");
  }, [activeChild, childLoading, navigate]);

  useEffect(() => {
    if (!activeChild) return;
    supabase.from("settling_methods").select("id,name").eq("child_id", activeChild.id).order("name")
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
      const { data: open } = await supabase
        .from("sleep_interruptions").select("id,start_time")
        .eq("sleep_session_id", data.id).is("end_time", null).maybeSingle();
      setInterruption(open ?? null);
    } else setInterruption(null);
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
    if (!activeChild || !user) return;
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
  };

  // Wake Up: instead of silently saving, open a confirmation modal where the user
  // can edit start, end, interruptions, place, settling, and comment.
  const wakeUp = async () => {
    if (!active) return;
    const endIso = new Date().toISOString();
    // Auto-close any open interruption at sleepEndTime (acts as draft persisted in DB so the
    // edit modal can load it). On cancel we restore it back to "active".
    if (interruption) {
      await supabase.from("sleep_interruptions")
        .update({ end_time: endIso }).eq("id", interruption.id);
    }
    setConfirmWake({ ...active, end_time: endIso });
  };

  // FSM transitions for the pause/resume button.
  const toggleInterruption = async () => {
    if (!active || !user) return;
    if (interruption) {
      // Resume flow — open draft modal: edit start, end (default = now), settling method.
      setStopIntrDraft({
        id: interruption.id,
        start: new Date(interruption.start_time),
        end: new Date(),
        methodId: "",
      });
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

  // If user cancels wake-up, restore the auto-closed interruption.
  const cancelWake = async () => {
    if (interruption?.id) {
      await supabase.from("sleep_interruptions")
        .update({ end_time: null }).eq("id", interruption.id);
    }
    setConfirmWake(null);
    load();
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
  const canEditActive = canEditAnySleep(role) || (canEditOwnSleep(role) && ownsActive);
  const canEnd = canEditActive;
  const canStart = canCreateSleep(role);

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
            <div className="h-4 bg-white/10 animate-pulse rounded w-1/2 mx-auto mb-6" />
            <div className="h-14 bg-white/10 animate-pulse rounded-xl w-full mb-3" />
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
          <Button size="lg" className="w-full h-14 text-base shadow-glow" onClick={startSleep} disabled={!canStart}>
            <Moon className="w-5 h-5 mr-2" /> {t("sleep.startSleep")}
          </Button>
          {canStart && <Dialog open={showManual} onOpenChange={setShowManual}>
            <DialogTrigger asChild>
              <Button variant="ghost" className="w-full mt-3"><Plus className="w-4 h-4 mr-1" /> {t("sleep.addManually")}</Button>
            </DialogTrigger>
            <DialogContent className="max-h-[90vh] overflow-y-auto">
              <DialogHeader><DialogTitle>{t("sleep.addSleep")}</DialogTitle></DialogHeader>
              <Suspense fallback={null}>
                <SleepForm mode="manual" onDone={() => { setShowManual(false); load(); }} />
              </Suspense>
            </DialogContent>
          </Dialog>}
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
                time: fmtDateTime(new Date(active.start_time)),
                context: activeChild.gender === "male" ? "male"
                  : activeChild.gender === "female" ? "female" : "other",
              })}
              {canEditActive && <Pencil className="w-3 h-3" />}
            </button>
          )}
          <p className="font-display text-4xl font-semibold my-4">{formatDuration(sessionDuration(active, now))}</p>
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
                  {t("sleep.interruptionSince", { time: formatTime(interruption.start_time) })}
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
      <Dialog open={!!stopIntrDraft} onOpenChange={(o) => !o && setStopIntrDraft(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{t("sleep.endInterruption")}</DialogTitle></DialogHeader>
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
        </DialogContent>
      </Dialog>

      {/* Wake Up confirmation modal — full edit before saving. */}
      <Dialog open={!!confirmWake} onOpenChange={(o) => { if (!o) cancelWake(); }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t("sleep.wakeUp", {
              context: activeChild?.gender === "male" ? "male"
                : activeChild?.gender === "female" ? "female" : "other",
            })}</DialogTitle>
          </DialogHeader>
          {confirmWake && (
            <Suspense fallback={null}>
              <SleepForm
                mode="edit"
                sessionId={confirmWake.id}
                initial={confirmWake}
                onDone={() => { setConfirmWake(null); load(); }}
              />
            </Suspense>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}
