import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { CloudOff, AlertTriangle } from "lucide-react";
import { useTranslation } from "react-i18next";
import { conflictCount, onQueueChange, pendingCount, flush } from "@/lib/offline-queue";
import { getOnline, onConnectivityChange } from "@/lib/connectivity";

export default function SyncStatus() {
  const { t } = useTranslation();
  // Use connectivity.ts as the source of truth — it is updated by actual
  // network call results, making it reliable in iOS PWAs where navigator.onLine
  // and window online/offline events are broken.
  const [online, setOnline] = useState(getOnline);
  const [pending, setPending] = useState(0);
  const [conflicts, setConflicts] = useState(0);

  useEffect(() => {
    const update = async () => {
      setPending(await pendingCount());
      setConflicts(await conflictCount());
    };
    update();
    const offQueue = onQueueChange(update);
    const offConn = onConnectivityChange((isOnline) => {
      setOnline(isOnline);
      if (isOnline) { flush(); update(); }
    });
    return () => { offQueue(); offConn(); };
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
