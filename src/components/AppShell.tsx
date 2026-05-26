import { memo, ReactNode, useMemo } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { Moon, History, BarChart3, Settings, LogOut, ChevronDown, Plus, User } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useChildren } from "@/contexts/ChildContext";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent,
  DropdownMenuItem, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { useTranslation } from "react-i18next";
import SyncStatus from "./SyncStatus";

export default function AppShell({ children }: { children: ReactNode }) {
  const { signOut } = useAuth();
  const { children: kids, activeChild, setActiveChildId } = useChildren();
  const navigate = useNavigate();
  const { t } = useTranslation();

  const initials = useMemo(() =>
    (activeChild?.name ?? "").trim().split(" ").map((p) => p[0]).join("").slice(0, 2).toUpperCase() || "•",
    [activeChild?.name]);

  return (
    <div className="min-h-screen bg-hero flex flex-col" style={{ paddingBottom: "calc(5rem + env(safe-area-inset-bottom))" }}>
      <header className="relative z-[60] px-4 pt-6 pb-3 flex items-center justify-between gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center gap-3 group">
              {/* Custom avatar (not Radix Avatar) so initials and image render in
                  one DOM tree with no React loading-state swap. SwipeBackHost
                  re-mounts AppShell during back-swipe; Radix Avatar's
                  loading→loaded transition flashes the fallback once per mount,
                  which is twice per back-swipe. Here the initials are always
                  painted underneath and the <img> overlays them as soon as the
                  browser decodes it (instant from cache). */}
              <div className="relative w-10 h-10 rounded-full bg-primary/15 overflow-hidden shrink-0 flex items-center justify-center text-primary font-semibold text-sm">
                {initials}
                {activeChild?.photo_url && (
                  <img
                    src={activeChild.photo_url}
                    alt=""
                    // decoding=sync makes the browser finish decoding before
                    // painting, so on remount (back-swipe) the photo lands in
                    // the same frame as the initials — no fallback flash.
                    decoding="sync"
                    className="absolute inset-0 w-full h-full object-cover"
                  />
                )}
              </div>
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
            <DropdownMenuItem onClick={() => navigate("/child/new", { state: { allowChildForm: true } })}>
              <Plus className="w-4 h-4 mr-2" /> {t("child.addChild")}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => navigate("/profile")}>
              <User className="w-4 h-4 mr-2" /> {t("profile.open")}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={signOut} className="text-destructive">
              <LogOut className="w-4 h-4 mr-2" /> {t("auth.signOut")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        {activeChild && (
          <Button variant="ghost" size="icon" onClick={() => navigate("/settings")} aria-label={t("settings.title")}>
            <Settings className="w-5 h-5" />
          </Button>
        )}
      </header>

      <SyncStatus />

      <main className="flex-1">{children}</main>

      <nav className="fixed bottom-0 inset-x-0 z-[60] bg-card/95 backdrop-blur border-t border-border" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
        <div className="max-w-md mx-auto grid grid-cols-3">
          <NavTab to="/" icon={<Moon />} label={t("common.sleepTab")} />
          <NavTab to="/history" icon={<History />} label={t("history.title")} />
          <NavTab to="/analytics" icon={<BarChart3 />} label={t("analytics.title")} />
        </div>
      </nav>
    </div>
  );
}

const NavTab = memo(function NavTab({ to, icon, label }: { to: string; icon: ReactNode; label: string }) {
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
});
