import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import "./i18n";

createRoot(document.getElementById("root")!).render(<App />);

// Flush queued offline mutations after the app renders —
// keeps Dexie off the critical-path bundle for online users.
if (navigator.onLine) {
  import("./lib/offline-queue").then(({ flush }) => flush());
}
