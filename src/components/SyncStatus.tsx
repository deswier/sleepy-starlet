import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { CloudOff, AlertTriangle } from "lucide-react";
import { useTranslation } from "react-i18next";
import { conflictCount, onQueueChange, pendingCount, flush } from "@/lib/offline-queue";

export default function SyncStatus() {
  const { t } = useTranslation();
  const [online, setOnline] = useState(navigator.onLine);
  const [pending, setPending] = useState(0);
  const [conflicts, setConflicts] = useState(0);

  useEffect(() => {
    const update = async () => {
      setPending(await pendingCount());
      setConflicts(await conflictCount());
    };
    update();
    const off = onQueueChange(update);
    const onUp = () => { setOnline(true); flush(); update(); };
    const onDown = () => setOnline(false);
    window.addEventListener("online", onUp);
    window.addEventListener("offline", onDown);

    // navigator.onLine can return true for 100-500ms after the app opens in
    // airplane mode (the "offline" event fired before our listener registered).
    // Re-read the flag after a short delay to catch this case.
    const recheckTimer = setTimeout(() => setOnline(navigator.onLine), 300);

    return () => {
      off();
      window.removeEventListener("online", onUp);
      window.removeEventListener("offline", onDown);
      clearTimeout(recheckTimer);
    };
  }, []);

  if (online && pending === 0 && conflicts === 0) return null;

  return (
    <div className="px-4 mb-2">
      <div className="rounded-xl bg-muted/70 text-xs px-3 py-2 flex items-center gap-3 border border-border/60">
        {!online && (
          <span className="inline-flex items-center gap-1 text-muted-foreground">
            <CloudOff className="w-3.5 h-3.5" /> {t("common.offline")}
          </span>
        )}
        {pending > 0 && <span className="text-muted-foreground">{t("common.pendingChanges", { count: pending })}</span>}
        {conflicts > 0 && (
          <Link to="/conflicts" className="ml-auto inline-flex items-center gap-1 text-[hsl(var(--ww-warn))] font-medium">
            <AlertTriangle className="w-3.5 h-3.5" /> {conflicts}
          </Link>
        )}
      </div>
    </div>
  );
}
