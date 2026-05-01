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
  const [gender, setGender] = useState<"male" | "female" | "">("");
  const [relation, setRelation] = useState<"mother" | "father" | "other">("mother");
  const [customRelation, setCustomRelation] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setBusy(true);
    const { data: childId, error } = await supabase.rpc("create_child_with_link", {
      _name: name,
      _birth_date: birthDate || null,
      _gender: (gender || null) as any,
      _relation: relation,
      _custom_relation_name: relation === "other" ? (customRelation.trim() || null) : null,
    });
    if (error || !childId) { toast.error(error?.message ?? "Failed"); setBusy(false); return; }
    await refresh();
    setActiveChildId(childId as string);
    toast.success(`Welcome, ${name}!`);
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
              <Input id="b" type="date" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} className="block w-full" /></div>
            <div>
              <Label>Gender</Label>
              <Select value={gender} onValueChange={(v: any) => setGender(v)}>
                <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="female">Girl</SelectItem>
                  <SelectItem value="male">Boy</SelectItem>
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
            {relation === "other" && (
              <div>
                <Label htmlFor="cr">Specify relation</Label>
                <Input
                  id="cr"
                  value={customRelation}
                  onChange={(e) => setCustomRelation(e.target.value)}
                  placeholder="e.g. Grandma, Nanny"
                />
              </div>
            )}
            <Button type="submit" className="w-full" disabled={busy || !name}>Create</Button>
          </form>
        </Card>
      </div>
    </main>
  );
}
