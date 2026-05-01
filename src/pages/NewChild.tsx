import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useChildren } from "@/contexts/ChildContext";
import { toast } from "sonner";
import { ArrowLeft, Sparkles } from "lucide-react";
import { useTranslation } from "react-i18next";

export default function NewChild() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { refresh, setActiveChildId, children: kids } = useChildren();
  const [name, setName] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [gender, setGender] = useState<"male" | "female" | "">("");
  const [relation, setRelation] = useState<"mother" | "father" | "other">("mother");
  const [customRelation, setCustomRelation] = useState("");
  const [busy, setBusy] = useState(false);

  const [code, setCode] = useState("");
  const [joinRelation, setJoinRelation] = useState<"mother" | "father" | "other">("other");
  const [joinCustom, setJoinCustom] = useState("");
  const [joining, setJoining] = useState(false);

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
    toast.success(t("child.welcomeChild", { name }));
    navigate("/");
  };

  const join = async (e: React.FormEvent) => {
    e.preventDefault();
    setJoining(true);
    const { data: childId, error } = await supabase.rpc("redeem_child_invite", {
      _code: code.trim().toUpperCase(),
      _relation: joinRelation,
      _custom_relation_name: joinRelation === "other" ? (joinCustom.trim() || null) : null,
    });
    setJoining(false);
    if (error || !childId) { toast.error(error?.message ?? "Failed"); return; }
    await refresh();
    setActiveChildId(childId as string);
    toast.success(t("child.joined"));
    navigate("/");
  };

  return (
    <main className="min-h-screen bg-hero p-4 flex items-start sm:items-center justify-center">
      <div className="w-full max-w-md py-8">
        {kids.length > 0 && (
          <Button variant="ghost" size="sm" onClick={() => navigate(-1)} className="mb-4">
            <ArrowLeft className="w-4 h-4 mr-1" /> {t("common.back")}
          </Button>
        )}
        <div className="text-center mb-6">
          <div className="inline-flex w-14 h-14 rounded-full bg-primary/10 items-center justify-center mb-3">
            <Sparkles className="w-7 h-7 text-primary" strokeWidth={1.5} />
          </div>
          <h1 className="font-display text-3xl font-semibold">{t("child.title")}</h1>
          <p className="text-muted-foreground text-sm mt-1">{t("child.subtitle")}</p>
        </div>
        <Card className="p-6 shadow-soft">
          <Tabs defaultValue="new">
            <TabsList className="grid grid-cols-2 w-full mb-4">
              <TabsTrigger value="new">{t("child.addChild")}</TabsTrigger>
              <TabsTrigger value="join">{t("child.joinExisting")}</TabsTrigger>
            </TabsList>
            <TabsContent value="new">
              <form onSubmit={submit} className="space-y-4">
                <div><Label htmlFor="n">{t("child.name")}</Label>
                  <Input id="n" required value={name} onChange={(e) => setName(e.target.value)} /></div>
                <div><Label htmlFor="b">{t("child.birthDate")}</Label>
                  <Input id="b" type="date" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} className="block w-full" /></div>
                <div>
                  <Label>{t("child.gender")}</Label>
                  <Select value={gender} onValueChange={(v: any) => setGender(v)}>
                    <SelectTrigger><SelectValue placeholder={t("common.select")} /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="female">{t("child.girl")}</SelectItem>
                      <SelectItem value="male">{t("child.boy")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>{t("child.relation")}</Label>
                  <Select value={relation} onValueChange={(v: any) => setRelation(v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="mother">{t("child.mother")}</SelectItem>
                      <SelectItem value="father">{t("child.father")}</SelectItem>
                      <SelectItem value="other">{t("child.other")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {relation === "other" && (
                  <div>
                    <Label htmlFor="cr">{t("child.specifyRelation")}</Label>
                    <Input id="cr" value={customRelation} onChange={(e) => setCustomRelation(e.target.value)} placeholder={t("child.specifyPlaceholder")} />
                  </div>
                )}
                <Button type="submit" className="w-full" disabled={busy || !name}>{t("common.create")}</Button>
              </form>
            </TabsContent>
            <TabsContent value="join">
              <form onSubmit={join} className="space-y-4">
                <p className="text-xs text-muted-foreground">{t("child.haveCode")}</p>
                <div>
                  <Label htmlFor="code">{t("child.enterCode")}</Label>
                  <Input id="code" required value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} className="font-mono uppercase tracking-widest" maxLength={6} />
                </div>
                <div>
                  <Label>{t("child.relation")}</Label>
                  <Select value={joinRelation} onValueChange={(v: any) => setJoinRelation(v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="mother">{t("child.mother")}</SelectItem>
                      <SelectItem value="father">{t("child.father")}</SelectItem>
                      <SelectItem value="other">{t("child.other")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {joinRelation === "other" && (
                  <div>
                    <Label htmlFor="jcr">{t("child.specifyRelation")}</Label>
                    <Input id="jcr" value={joinCustom} onChange={(e) => setJoinCustom(e.target.value)} placeholder={t("child.specifyPlaceholder")} />
                  </div>
                )}
                <Button type="submit" className="w-full" disabled={joining || code.length < 4}>{joining ? t("child.joining") : t("common.create")}</Button>
              </form>
            </TabsContent>
          </Tabs>
        </Card>
      </div>
    </main>
  );
}
