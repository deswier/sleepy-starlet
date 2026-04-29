import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useChildren } from "@/contexts/ChildContext";
import { toast } from "sonner";
import { ArrowLeft, Sparkles } from "lucide-react";

export default function NewChild() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { refresh, setActiveChildId, children: kids } = useChildren();
  const [name, setName] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [gender, setGender] = useState<"male" | "female" | "other" | "">("");
  const [relation, setRelation] = useState<"mother" | "father" | "other">("mother");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setBusy(true);
    const { data: child, error } = await supabase
      .from("children")
      .insert({ name, birth_date: birthDate || null, gender: gender || null })
      .select()
      .single();
    if (error || !child) { toast.error(error?.message ?? "Failed"); setBusy(false); return; }
    const { error: linkErr } = await supabase.from("child_users").insert({
      child_id: child.id, user_id: user.id, relation_type: relation,
    });
    if (linkErr) { toast.error(linkErr.message); setBusy(false); return; }
    await refresh();
    setActiveChildId(child.id);
    toast.success(`Welcome, ${child.name}!`);
    navigate("/");
  };

  return (
    <main className="min-h-screen bg-hero p-4 flex items-start sm:items-center justify-center">
      <div className="w-full max-w-md py-8">
        {kids.length > 0 && (
          <Button variant="ghost" size="sm" onClick={() => navigate(-1)} className="mb-4">
            <ArrowLeft className="w-4 h-4 mr-1" /> Back
          </Button>
        )}
        <div className="text-center mb-6">
          <div className="inline-flex w-14 h-14 rounded-full bg-primary/10 items-center justify-center mb-3">
            <Sparkles className="w-7 h-7 text-primary" strokeWidth={1.5} />
          </div>
          <h1 className="font-display text-3xl font-semibold">Add a child</h1>
          <p className="text-muted-foreground text-sm mt-1">A few details to get started</p>
        </div>
        <Card className="p-6 shadow-soft">
          <form onSubmit={submit} className="space-y-4">
            <div><Label htmlFor="n">Name</Label>
              <Input id="n" required value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Mia" /></div>
            <div><Label htmlFor="b">Birth date</Label>
              <Input id="b" type="date" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} /></div>
            <div>
              <Label>Gender</Label>
              <Select value={gender} onValueChange={(v: any) => setGender(v)}>
                <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="female">Girl</SelectItem>
                  <SelectItem value="male">Boy</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Your relation</Label>
              <Select value={relation} onValueChange={(v: any) => setRelation(v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="mother">Mother</SelectItem>
                  <SelectItem value="father">Father</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button type="submit" className="w-full" disabled={busy || !name}>Create</Button>
          </form>
        </Card>
      </div>
    </main>
  );
}
