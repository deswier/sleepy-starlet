import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { formatDuration, formatTime, sessionDuration, SleepSession } from "@/lib/sleep-utils";
import SleepForm from "./SleepForm";
import { format } from "date-fns";
import { Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";

export default function SleepDetail({ session, onClose, onChange }: {
  session: SleepSession; onClose: () => void; onChange: () => void;
}) {
  const [place, setPlace] = useState<string | null>(null);
  const [method, setMethod] = useState<string | null>(null);
  const [creator, setCreator] = useState<string | null>(null);
  const [interruptions, setInterruptions] = useState<{ start_time: string; end_time: string | null }[]>([]);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    (async () => {
      const tasks: any[] = [];
      if (session.sleep_place_id)
        tasks.push(supabase.from("sleep_places").select("name").eq("id", session.sleep_place_id).single().then((r) => setPlace(r.data?.name ?? null)));
      if (session.settling_method_id)
        tasks.push(supabase.from("settling_methods").select("name").eq("id", session.settling_method_id).single().then((r) => setMethod(r.data?.name ?? null)));
      if (session.created_by_user_id)
        tasks.push(supabase.from("profiles").select("display_name").eq("id", session.created_by_user_id).single().then((r) => setCreator(r.data?.display_name ?? null)));
      tasks.push(supabase.from("sleep_interruptions").select("start_time,end_time").eq("sleep_session_id", session.id).order("start_time").then((r) => setInterruptions(r.data ?? [])));
      await Promise.all(tasks);
    })();
  }, [session]);

  const del = async () => {
    if (!confirm("Delete this sleep?")) return;
    const { error } = await supabase.from("sleep_sessions").delete().eq("id", session.id);
    if (error) toast.error(error.message);
    else { toast.success("Deleted"); onChange(); onClose(); }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader><DialogTitle>{editing ? "Edit sleep" : "Sleep details"}</DialogTitle></DialogHeader>
        {editing ? (
          <SleepForm mode="edit" sessionId={session.id} initial={session} onDone={() => { setEditing(false); onChange(); onClose(); }} />
        ) : (
          <div className="space-y-3 text-sm">
            <Row label="Date" value={format(new Date(session.start_time), "MMMM d, yyyy")} />
            <Row label="Time" value={`${formatTime(session.start_time)} – ${session.end_time ? formatTime(session.end_time) : "—"}`} />
            <Row label="Duration" value={formatDuration(sessionDuration(session))} />
            <Row label="Type" value={session.sleep_type === "night" ? "Night sleep" : "Day sleep"} />
            {place && <Row label="Place" value={place} />}
            {method && <Row label="Settling" value={method} />}
            {interruptions.length > 0 && (
              <div>
                <div className="text-muted-foreground text-xs uppercase tracking-wide mb-1">Interruptions</div>
                <ul className="space-y-1">
                  {interruptions.map((i, idx) => (
                    <li key={idx} className="bg-muted/60 rounded-lg px-3 py-1.5">
                      {formatTime(i.start_time)} – {i.end_time ? formatTime(i.end_time) : "ongoing"}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {session.comment && <Row label="Comment" value={session.comment} />}
            {creator && <Row label="Created by" value={creator} />}
            <div className="flex gap-2 pt-3">
              <Button variant="outline" className="flex-1" onClick={() => setEditing(true)}>
                <Pencil className="w-4 h-4 mr-1" /> Edit
              </Button>
              <Button variant="outline" className="flex-1 text-destructive hover:text-destructive" onClick={del}>
                <Trash2 className="w-4 h-4 mr-1" /> Delete
              </Button>
            </div>
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
