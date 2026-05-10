import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import "./i18n";
import { initSystemTimeFormat } from "./lib/sleep-utils";

// Resolve system 12/24h preference before first render on web/Android
// (synchronous inside), and as early as possible on iOS (async native call).
initSystemTimeFormat();

createRoot(document.getElementById("root")!).render(<App />);

// Flush queued offline mutations after the app renders —
// keeps Dexie off the critical-path bundle for online users.
if (navigator.onLine) {
  import("./lib/offline-queue").then(({ flush }) => flush());
}
