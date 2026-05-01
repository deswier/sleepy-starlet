import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Moon, Sun, Plus, Pause, Play, Pencil, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useChildren } from "@/contexts/ChildContext";
import { useAuth } from "@/contexts/AuthContext";
import { formatDuration, sessionDuration, formatTime, inferSleepType, SleepSession } from "@/lib/sleep-utils";
import SleepForm from "@/components/sleep/SleepForm";
import { toast } from "sonner";
import { format, parse, isValid } from "date-fns";

export default function CurrentSleep() {
  const navigate = useNavigate();
  const { activeChild, loading: childLoading } = useChildren();
  const { user } = useAuth();
  const [active, setActive] = useState<SleepSession | null>(null);
  const [interruption, setInterruption] = useState<{ id: string; start_time: string } | null>(null);
  const [now, setNow] = useState(new Date());
  const [showManual, setShowManual] = useState(false);
  const [editingStart, setEditingStart] = useState(false);
  const [startDraft, setStartDraft] = useState("");
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
      .from("sleep_sessions")
      .select("*")
      .eq("child_id", activeChild.id)
      .is("end_time", null)
      .order("start_time", { ascending: false })
      .limit(1)
      .maybeSingle();
    setActive(data as SleepSession | null);
    if (data) {
      const { data: open } = await supabase
        .from("sleep_interruptions")
        .select("id,start_time")
        .eq("sleep_session_id", data.id)
        .is("end_time", null)
        .maybeSingle();
      setInterruption(open ?? null);
    } else {
      setInterruption(null);
    }
  };

  useEffect(() => { load(); }, [activeChild]);
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(t);
  }, []);

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
    if (error) toast.error(error.message);
    else { load(); }
  };

  const wakeUp = async () => {
    if (!active) return;
    if (interruption) {
      await supabase.from("sleep_interruptions").update({ end_time: new Date().toISOString() }).eq("id", interruption.id);
    }
    const { error } = await supabase.from("sleep_sessions").update({ end_time: new Date().toISOString() }).eq("id", active.id);
    if (error) toast.error(error.message);
    else { load(); }
  };

  const toggleInterruption = async () => {
    if (!active || !user) return;
    if (interruption) {
      await supabase.from("sleep_interruptions").update({ end_time: new Date().toISOString() }).eq("id", interruption.id);
      load();
    } else if (showMethodFlag && methods.length > 0) {
      setPendingMethodId("");
      setAskMethod(true);
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
      sleep_session_id: active.id,
      start_time: new Date().toISOString(),
      created_by_user_id: user.id,
      settling_method_id: pendingMethodId || null,
    });
    setAskMethod(false);
    load();
  };

  const beginEditStart = () => {
    if (!active) return;
    setStartDraft(format(new Date(active.start_time), "dd.MM.yy HH:mm"));
    setEditingStart(true);
  };

  const saveEditStart = async () => {
    if (!active) return;
    const d = parse(startDraft, "dd.MM.yy HH:mm", new Date());
    if (!isValid(d)) { toast.error("Use format dd.MM.yy HH:mm"); return; }
    if (d > new Date()) { toast.error("Start cannot be in the future"); return; }
    const { error } = await supabase
      .from("sleep_sessions")
      .update({ start_time: d.toISOString() })
      .eq("id", active.id);
    if (error) toast.error(error.message);
    else { setEditingStart(false); load(); }
  };

  if (!activeChild) return null;

  return (
    <section className="px-4 max-w-md mx-auto w-full">
      {!active ? (
        <Card className="p-8 text-center shadow-soft border-border/50 mt-4">
          <div className="inline-flex w-20 h-20 rounded-full bg-primary/10 items-center justify-center mb-4">
            <Sun className="w-10 h-10 text-primary" strokeWidth={1.5} />
          </div>
          <h2 className="font-display text-2xl font-semibold mb-2">{activeChild.name} is awake</h2>
          <p className="text-muted-foreground text-sm mb-6">Ready when sleep starts</p>
          <Button size="lg" className="w-full h-14 text-base shadow-glow" onClick={startSleep}>
            <Moon className="w-5 h-5 mr-2" /> Start sleep
          </Button>
          <Dialog open={showManual} onOpenChange={setShowManual}>
            <DialogTrigger asChild>
              <Button variant="ghost" className="w-full mt-3"><Plus className="w-4 h-4 mr-1" /> Add manually</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Add sleep</DialogTitle></DialogHeader>
              <SleepForm mode="manual" onDone={() => { setShowManual(false); load(); }} />
            </DialogContent>
          </Dialog>
        </Card>
      ) : (
        <Card className="p-8 text-center bg-night text-primary-foreground shadow-glow border-0 mt-4">
          <div className="inline-flex w-20 h-20 rounded-full bg-white/10 items-center justify-center mb-4">
            <Moon className="w-10 h-10" strokeWidth={1.5} />
          </div>
          <h2 className="font-display text-2xl font-semibold mb-1">{activeChild.name} is sleeping</h2>
          {editingStart ? (
            <div className="flex items-center gap-2 justify-center mb-1">
              <Input
                value={startDraft}
                onChange={(e) => setStartDraft(e.target.value)}
                placeholder="dd.MM.yy HH:mm"
                className="h-8 w-44 text-foreground text-sm"
              />
              <Button size="icon" variant="ghost" className="h-8 w-8 text-primary-foreground hover:bg-white/10 hover:text-primary-foreground" onClick={saveEditStart}>
                <Check className="w-4 h-4" />
              </Button>
              <Button size="icon" variant="ghost" className="h-8 w-8 text-primary-foreground hover:bg-white/10 hover:text-primary-foreground" onClick={() => setEditingStart(false)}>
                <X className="w-4 h-4" />
              </Button>
            </div>
          ) : (
            <button
              type="button"
              onClick={beginEditStart}
              className="opacity-80 text-sm mb-1 inline-flex items-center gap-1 hover:opacity-100"
            >
              Started at {formatTime(active.start_time)}
              <Pencil className="w-3 h-3" />
            </button>
          )}
          <p className="font-display text-4xl font-semibold my-4">{formatDuration(sessionDuration(active, now))}</p>
          {interruption && (
            <div className="bg-white/10 rounded-xl px-4 py-2 mb-4 text-sm">
              ⏸ Interruption since {formatTime(interruption.start_time)}
            </div>
          )}
          <div className="space-y-2">
            <Button size="lg" variant="secondary" className="w-full h-14 text-base" onClick={wakeUp}>
              <Sun className="w-5 h-5 mr-2" /> Wake up
            </Button>
            {showInterruptionFlag && (
              <Button variant="outline" className="w-full bg-white/10 border-white/30 text-primary-foreground hover:bg-white/20 hover:text-primary-foreground" onClick={toggleInterruption}>
                {interruption ? <><Play className="w-4 h-4 mr-2" /> End interruption</> : <><Pause className="w-4 h-4 mr-2" /> Add interruption</>}
              </Button>
            )}
          </div>
        </Card>
      )}
      <Dialog open={askMethod} onOpenChange={setAskMethod}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add interruption</DialogTitle></DialogHeader>
          <p className="text-xs text-muted-foreground">
            Interruptions do not split the sleep session. Sleep is considered continuous.
            For long wake periods, end the current sleep and create a new one.
          </p>
          <div className="space-y-1.5">
            <Label>Settling method</Label>
            <Select value={pendingMethodId || "none"} onValueChange={(v) => setPendingMethodId(v === "none" ? "" : v)}>
              <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— None —</SelectItem>
                {methods.map((m) => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={confirmInterruption} className="w-full">Add interruption</Button>
        </DialogContent>
      </Dialog>
    </section>
  );
}
