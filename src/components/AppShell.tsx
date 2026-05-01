import { ReactNode } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { Moon, History, BarChart3, Settings, LogOut, ChevronDown, Plus, User } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useChildren } from "@/contexts/ChildContext";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent,
  DropdownMenuItem, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useTranslation } from "react-i18next";
import SyncStatus from "./SyncStatus";

export default function AppShell({ children }: { children: ReactNode }) {
  const { signOut } = useAuth();
  const { children: kids, activeChild, setActiveChildId } = useChildren();
  const navigate = useNavigate();
  const { t } = useTranslation();

  const initials = (activeChild?.name ?? "").trim().split(" ").map((p) => p[0]).join("").slice(0, 2).toUpperCase() || "•";

  return (
    <div className="min-h-screen bg-hero flex flex-col pb-20">
      <header className="px-4 pt-6 pb-3 flex items-center justify-between">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center gap-3 group">
              <Avatar className="w-10 h-10 bg-primary/15">
                <AvatarFallback className="bg-primary/15 text-primary font-semibold">{initials}</AvatarFallback>
              </Avatar>
              <div className="text-left">
                <div className="font-display text-lg font-semibold leading-tight flex items-center gap-1">
                  {activeChild?.name ?? t("child.noChild")} <ChevronDown className="w-4 h-4 opacity-60 group-hover:opacity-100" />
                </div>
                <div className="text-xs text-muted-foreground">{t("app.name")}</div>
              </div>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56">
            {kids.map((c) => (
              <DropdownMenuItem key={c.id} onClick={() => setActiveChildId(c.id)}>
                {c.name}{activeChild?.id === c.id ? " ✓" : ""}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => navigate("/child/new")}>
              <Plus className="w-4 h-4 mr-2" /> {t("child.addChild")}
            </DropdownMenuItem>
            {activeChild && (
              <DropdownMenuItem onClick={() => navigate("/settings")}>
                <Settings className="w-4 h-4 mr-2" /> {t("settings.title")}
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onClick={() => navigate("/profile")}>
              <User className="w-4 h-4 mr-2" /> {t("profile.open")}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={signOut} className="text-destructive">
              <LogOut className="w-4 h-4 mr-2" /> {t("auth.signOut")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </header>

      <SyncStatus />

      <main className="flex-1">{children}</main>

      <nav className="fixed bottom-0 inset-x-0 bg-card/95 backdrop-blur border-t border-border">
        <div className="max-w-md mx-auto grid grid-cols-3">
          <NavTab to="/" icon={<Moon />} label={t("common.sleepTab")} />
          <NavTab to="/history" icon={<History />} label={t("history.title")} />
          <NavTab to="/analytics" icon={<BarChart3 />} label={t("analytics.title")} />
        </div>
      </nav>
    </div>
  );
}

function NavTab({ to, icon, label }: { to: string; icon: ReactNode; label: string }) {
  return (
    <NavLink
      to={to}
      end
      className={({ isActive }) =>
        `flex flex-col items-center gap-1 py-3 text-xs font-medium transition-smooth ${
          isActive ? "text-primary" : "text-muted-foreground hover:text-foreground"
        }`
      }
    >
      <span className="w-5 h-5">{icon}</span>
      {label}
    </NavLink>
  );
}
