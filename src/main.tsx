import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import "./i18n";
import { initSystemTimeFormat } from "./lib/sleep-utils";
import { initStatusBar, isNative } from "./lib/native";

// Resolve system 12/24h preference before first render on web/Android
// (synchronous inside), and as early as possible on iOS (async native call).
initSystemTimeFormat();
initStatusBar();

createRoot(document.getElementById("root")!).render(<App />);

// Register service worker for PWA offline support.
// Skip on Capacitor (iOS/Android) — the native WebView handles caching
// differently and an SW on a custom URL scheme causes more harm than good.
if (!isNative()) {
  import("virtual:pwa-register").then(({ registerSW }) => {
    registerSW({ immediate: false });
  });
}

// Flush queued offline mutations after the app renders —
// keeps Dexie off the critical-path bundle for online users.
if (navigator.onLine) {
  import("./lib/offline-queue").then(({ flush }) => flush());
}
