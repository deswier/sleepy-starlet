import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { readFileSync } from "fs";

const pkg = JSON.parse(readFileSync("./package.json", "utf-8"));

export default defineConfig(({ mode }) => ({
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  server: {
    host: "::",
    port: 8080,
    hmr: { overlay: false },
  },
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
    dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime", "@tanstack/react-query", "@tanstack/query-core"],
  },
  build: {
    target: "esnext",
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("/node_modules/react/") ||
              id.includes("/node_modules/react-dom/") ||
              id.includes("/node_modules/react-router-dom/") ||
              id.includes("/node_modules/@remix-run/")) return "vendor-react";
          if (id.includes("/node_modules/@supabase/")) return "vendor-supabase";
          if (id.includes("/node_modules/@radix-ui/")) return "vendor-radix";
          if (id.includes("/node_modules/@tanstack/")) return "vendor-query";
          if (id.includes("/node_modules/date-fns/")) return "vendor-date-fns";
          if (id.includes("/node_modules/lucide-react/")) return "vendor-lucide";
          if (id.includes("/node_modules/dexie/")) return "vendor-dexie";
          if (id.includes("/node_modules/i18next/") ||
              id.includes("/node_modules/react-i18next/") ||
              id.includes("/node_modules/i18next-browser-languagedetector/")) return "vendor-i18n";
        },
      },
    },
  },
}));
