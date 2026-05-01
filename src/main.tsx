import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import "./i18n";
import { flush } from "./lib/offline-queue";

// Try to flush any queued offline mutations on startup
if (navigator.onLine) flush();

createRoot(document.getElementById("root")!).render(<App />);
