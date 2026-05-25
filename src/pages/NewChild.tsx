import { useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { useSwipeBack } from "@/hooks/use-swipe-back";
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
import { ArrowLeft, Sparkles, User, LogOut } from "lucide-react";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent,
  DropdownMenuItem, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { useTranslation } from "react-i18next";
import { RequiredMark } from "@/components/RequiredMark";
import { getDeviceId } from "@/lib/device-id";
import { readLastRoute } from "@/lib/last-route";

type Relation = "mother" | "father" | "other";
type Gender = "male" | "female" | "";
type LocationState = { allowChildForm?: boolean } | null;

export default function NewChild() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const { user, signOut } = useAuth();
  const { refresh, setActiveChildId, children: kids, loading: childrenLoading } = useChildren();
  const [name, setName] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [gender, setGender] = useState<Gender>("");
  const [relation, setRelation] = useState<Relation>("mother");
  const [customRelation, setCustomRelation] = useState("");
  const [busy, setBusy] = useState(false);

  const [code, setCode] = useState("");
  const [joinRelation, setJoinRelation] = useState<Relation>("other");
  const [joinCustom, setJoinCustom] = useState("");
  const [joining, setJoining] = useState(false);

  const d = new Date();
  const todayStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (birthDate && birthDate > todayStr) {
      toast.error(t("child.birthDateFuture"));
      return;
    }
    setBusy(true);
    const { data: childId, error } = await supabase.rpc("create_child_with_link", {
      _name: name,
      _birth_date: birthDate || null,
      _gender: gender || null,
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
      _device_id: getDeviceId(),
    });
    setJoining(false);
    if (error || !childId) {
      const msg = error?.message ?? "";
      if (msg.includes("COOLDOWN")) {
        const secs = parseInt(msg.split(":")[1] || "0", 10);
        toast.error(t("child.cooldown", { time: humanCooldown(secs) }));
      } else {
        toast.error(t("child.invalidCode"));
      }
      return;
    }
    await refresh();
    setActiveChildId(childId as string);
    toast.success(t("child.joined"));
    navigate("/");
  };

  function humanCooldown(seconds: number): string {
    if (seconds >= 3600) return `${Math.ceil(seconds / 3600)} h`;
    if (seconds >= 60) return `${Math.ceil(seconds / 60)} min`;
    return `${seconds} s`;
  }

  const goBack = () => {
    const last = user ? readLastRoute(user.id)?.path : null;
    navigate(last && last !== "/child/new" ? last : "/", { replace: true });
  };

  useSwipeBack({ enabled: kids.length > 0, onBack: goBack });

  if (childrenLoading) {
    return <div className="min-h-screen bg-hero" />;
  }

  const allowChildForm = kids.length === 0 || (location.state as LocationState)?.allowChildForm === true;
  if (!allowChildForm) {
    const last = user ? readLastRoute(user.id)?.path : null;
    return <Navigate to={last && last !== "/child/new" ? last : "/"} replace />;
  }

  return (
    <main className="min-h-screen bg-hero p-4 flex items-start sm:items-center justify-center">
      <div className="w-full max-w-md py-8">
        <div className="flex items-center justify-between mb-4">
          {kids.length > 0 ? (
            <Button type="button" variant="ghost" size="sm" onClick={goBack}>
              <ArrowLeft className="w-4 h-4 mr-1" /> {t("common.back")}
            </Button>
          ) : <span />}
          <div className="flex items-center gap-2">
            <Select value={i18n.language?.startsWith("ru") ? "ru" : "en"} onValueChange={(v) => i18n.changeLanguage(v)}>
              <SelectTrigger className="h-9 w-[110px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="en">{t("common.english")}</SelectItem>
                <SelectItem value="ru">{t("common.russian")}</SelectItem>
              </SelectContent>
            </Select>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" aria-label={t("profile.open")}>
                  <User className="w-5 h-5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem onClick={() => navigate("/profile")}>
                  <User className="w-4 h-4 mr-2" /> {t("profile.open")}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={signOut} className="text-destructive">
                  <LogOut className="w-4 h-4 mr-2" /> {t("auth.signOut")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
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
              <TabsTrigger value="new">{t("child.addTab")}</TabsTrigger>
              <TabsTrigger value="join">{t("child.joinTab")}</TabsTrigger>
            </TabsList>
            <TabsContent value="new">
              <form onSubmit={submit} className="space-y-4">
                <div>
                  <Label htmlFor="n"><RequiredMark />{t("child.name")}</Label>
                  <Input id="n" required value={name} onChange={(e) => setName(e.target.value)} />
                </div>
                <div>
                  <Label htmlFor="b"><RequiredMark />{t("child.birthDate")}</Label>
                  <Input id="b" type="date" required value={birthDate} max={todayStr} onChange={(e) => setBirthDate(e.target.value)} className="block w-full" />
                </div>
                <div>
                  <Label><RequiredMark />{t("child.gender")}</Label>
                  <Select value={gender} onValueChange={(v) => setGender(v as Gender)}>
                    <SelectTrigger><SelectValue placeholder={t("common.select")} /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="female">{t("child.girl")}</SelectItem>
                      <SelectItem value="male">{t("child.boy")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label><RequiredMark />{t("child.relation")}</Label>
                  <Select value={relation} onValueChange={(v) => setRelation(v as Relation)}>
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
                    <Label htmlFor="cr"><RequiredMark />{t("child.specifyRelation")}</Label>
                    <Input id="cr" required value={customRelation} onChange={(e) => setCustomRelation(e.target.value)} placeholder={t("child.specifyPlaceholder")} />
                  </div>
                )}
                <Button type="submit" className="w-full"
                  disabled={busy || !name.trim() || !birthDate || !gender || (relation === "other" && !customRelation.trim())}>
                  {t("common.create")}
                </Button>
              </form>
            </TabsContent>
            <TabsContent value="join">
              <form onSubmit={join} className="space-y-4">
                <p className="text-xs text-muted-foreground">{t("child.haveCode")}</p>
                <div>
                  <Label htmlFor="code"><RequiredMark />{t("child.enterCode")}</Label>
                  <Input id="code" required value={code} onChange={(e) => setCode(e.target.value.replace(/`/g, "").toUpperCase())} className="font-mono uppercase tracking-widest" maxLength={8} />
                </div>
                <div>
                  <Label><RequiredMark />{t("child.relation")}</Label>
                  <Select value={joinRelation} onValueChange={(v) => setJoinRelation(v as Relation)}>
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
                    <Label htmlFor="jcr"><RequiredMark />{t("child.specifyRelation")}</Label>
                    <Input id="jcr" required value={joinCustom} onChange={(e) => setJoinCustom(e.target.value)} placeholder={t("child.specifyPlaceholder")} />
                  </div>
                )}
                <Button type="submit" className="w-full"
                  disabled={joining || code.length < 6 || (joinRelation === "other" && !joinCustom.trim())}>
                  {joining ? t("child.joining") : t("common.create")}
                </Button>
              </form>
            </TabsContent>
          </Tabs>
        </Card>
      </div>
    </main>
  );
}
