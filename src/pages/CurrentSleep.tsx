import { useEffect, useState } from "react";
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
import SleepForm from "@/components/sleep/SleepForm";
import DateTimeField from "@/components/DateTimeField";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { enqueue } from "@/lib/offline-queue";
import { fmtDateTime, formatTime } from "@/lib/sleep-utils";
import { useChildRole, canCreateSleep, canEditOwnSleep, canEditAnySleep } from "@/hooks/useChildRole";

export default function CurrentSleep() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { activeChild, loading: childLoading } = useChildren();
  const { user } = useAuth();
  const { role } = useChildRole();
  const [active, setActive] = useState<SleepSession | null>(null);
  const [interruption, setInterruption] = useState<{ id: string; start_time: string } | null>(null);
  const [now, setNow] = useState(new Date());
  const [showManual, setShowManual] = useState(false);
  const [editingStart, setEditingStart] = useState(false);
  const [startDraft, setStartDraft] = useState<Date>(new Date());
  const [showInterruptionFlag, setShowInterruptionFlag] = useState(true);
  const [showMethodFlag, setShowMethodFlag] = useState(true);
  const [methods, setMethods] = useState<{ id: string; name: string }[]>([]);
  const [askMethod, setAskMethod] = useState(false);
  const [pendingMethodId, setPendingMethodId] = useState<string>("");

  useEffect(() => {
    if (!childLoading && !activeChild) navigate("/child/new");
  }, [activeChild, childLoading, navigate]);

  const load = async () => {
    if (!activeChild) return;
    const { data: cs } = await supabase
      .from("child_settings")
      .select("show_interruptions,show_falling_asleep_method")
      .eq("child_id", activeChild.id).single();
    setShowInterruptionFlag(cs?.show_interruptions !== false);
    setShowMethodFlag(cs?.show_falling_asleep_method !== false);
    const { data: mList } = await supabase
      .from("settling_methods").select("id,name").eq("child_id", activeChild.id).order("name");
    setMethods(mList ?? []);
    const { data } = await supabase
      .from("sleep_sessions").select("*")
      .eq("child_id", activeChild.id)
      .is("end_time", null)
      .order("start_time", { ascending: false })
      .limit(1).maybeSingle();
    setActive(data as SleepSession | null);
    if (data) {
      const { data: open } = await supabase
        .from("sleep_interruptions").select("id,start_time")
        .eq("sleep_session_id", data.id).is("end_time", null).maybeSingle();
      setInterruption(open ?? null);
    } else setInterruption(null);
  };

  useEffect(() => { load(); }, [activeChild]);
  useEffect(() => {
    const i = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(i);
  }, []);

  // Realtime: any change to this child's sleep sessions or interruptions reloads state.
  useEffect(() => {
    if (!activeChild) return;
    const ch = supabase
      .channel(`sleep-${activeChild.id}`)
      .on("postgres_changes",
        { event: "*", schema: "public", table: "sleep_sessions", filter: `child_id=eq.${activeChild.id}` },
        () => load())
      .on("postgres_changes",
        { event: "*", schema: "public", table: "sleep_interruptions" },
        () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [activeChild?.id]);

  const startSleep = async () => {
    if (!activeChild || !user) return;
    const { data: settings } = await supabase
      .from("child_settings").select("night_start_time,night_end_time").eq("child_id", activeChild.id).single();
    const startTime = new Date();
    const type = settings ? inferSleepType(startTime, settings.night_start_time, settings.night_end_time) : "day";
    const { error } = await supabase.from("sleep_sessions").insert({
      child_id: activeChild.id,
      start_time: startTime.toISOString(),
      sleep_type: type,
      created_by_user_id: user.id,
    });
    if (error) toast.error(error.message); else load();
  };

  const wakeUp = async () => {
    if (!active) return;
    if (interruption) {
      await supabase.from("sleep_interruptions").update({ end_time: new Date().toISOString() }).eq("id", interruption.id);
    }
    const endIso = new Date().toISOString();
    if (!navigator.onLine) {
      await enqueue({
        table: "sleep_sessions", op: "update",
        payload: { end_time: endIso },
        match: { id: active.id },
        baseUpdatedAt: (active as any).updated_at ?? null,
      });
      load();
      return;
    }
    const { error } = await supabase.from("sleep_sessions").update({ end_time: endIso }).eq("id", active.id);
    if (error) toast.error(error.message); else load();
  };

  const toggleInterruption = async () => {
    if (!active || !user) return;
    if (interruption) {
      await supabase.from("sleep_interruptions").update({ end_time: new Date().toISOString() }).eq("id", interruption.id);
      load();
    } else if (showMethodFlag && methods.length > 0) {
      setPendingMethodId(""); setAskMethod(true);
    } else {
      await supabase.from("sleep_interruptions").insert({
        sleep_session_id: active.id, start_time: new Date().toISOString(), created_by_user_id: user.id,
      });
      load();
    }
  };

  const confirmInterruption = async () => {
    if (!active || !user) return;
    await supabase.from("sleep_interruptions").insert({
      sleep_session_id: active.id, start_time: new Date().toISOString(),
      created_by_user_id: user.id, settling_method_id: pendingMethodId || null,
    });
    setAskMethod(false); load();
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
      {!active ? (
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
            <DialogContent>
              <DialogHeader><DialogTitle>{t("sleep.addSleep")}</DialogTitle></DialogHeader>
              <SleepForm mode="manual" onDone={() => { setShowManual(false); load(); }} />
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
              {t("sleep.startedAt", { time: fmtDateTime(new Date(active.start_time)) })}
              {canEditActive && <Pencil className="w-3 h-3" />}
            </button>
          )}
          <p className="font-display text-4xl font-semibold my-4">{formatDuration(sessionDuration(active, now))}</p>
          {interruption && (
            <div className="bg-white/10 rounded-xl px-4 py-2 mb-4 text-sm">
              {t("sleep.interruptionSince", { time: formatTime(interruption.start_time) })}
            </div>
          )}
          <div className="space-y-2">
            <Button size="lg" variant="secondary" className="w-full h-14 text-base" onClick={wakeUp} disabled={!canEnd}>
              <Sun className="w-5 h-5 mr-2" /> {t("sleep.wakeUp")}
            </Button>
            {showInterruptionFlag && canEnd && (
              <Button variant="outline" className="w-full bg-white/10 border-white/30 text-primary-foreground hover:bg-white/20 hover:text-primary-foreground" onClick={toggleInterruption}>
                {interruption ? <><Play className="w-4 h-4 mr-2" /> {t("sleep.endInterruption")}</> : <><Pause className="w-4 h-4 mr-2" /> {t("sleep.addInterruption")}</>}
              </Button>
            )}
          </div>
        </Card>
      )}
      <Dialog open={askMethod} onOpenChange={setAskMethod}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t("sleep.addInterruption")}</DialogTitle></DialogHeader>
          <p className="text-xs text-muted-foreground">{t("sleep.interruptionHelp")}</p>
          <div className="space-y-1.5">
            <Label>{t("sleep.settling")}</Label>
            <Select value={pendingMethodId || "none"} onValueChange={(v) => setPendingMethodId(v === "none" ? "" : v)}>
              <SelectTrigger><SelectValue placeholder={t("common.select")} /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">{t("common.none")}</SelectItem>
                {methods.map((m) => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={confirmInterruption} className="w-full">{t("sleep.addInterruption")}</Button>
        </DialogContent>
      </Dialog>
    </section>
  );
}
