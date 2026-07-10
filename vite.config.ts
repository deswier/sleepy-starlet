import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { VitePWA } from "vite-plugin-pwa";
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
  plugins: [
    react(),
    mode === "development" && componentTagger(),
    VitePWA({
      registerType: "autoUpdate",
      // We handle registration manually in main.tsx so we can skip it on
      // Capacitor (iOS/Android), where the native WebView scheme makes SW unreliable.
      injectRegister: null,
      // Keep our hand-crafted public/manifest.json — plugin must not overwrite it.
      manifest: false,
      workbox: {
        // Precache all built JS/CSS/HTML chunks + static assets.
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff,woff2}"],
        // Also precache the manifest so "Add to Home Screen" works offline.
        additionalManifestEntries: [{ url: "/manifest.json", revision: null }],
        // All navigation requests fall back to the cached index.html (SPA).
        navigateFallback: "index.html",
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            // Google Fonts CSS — rarely changes, keep for a year.
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "google-fonts-stylesheets",
              expiration: { maxEntries: 5, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // Google Fonts woff2 files — static, keep for a year.
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "google-fonts-webfonts",
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          // Supabase REST/Realtime traffic is intentionally NOT cached here —
          // dynamic data is handled by the app's own Dexie offline cache.
        ],
      },
      devOptions: {
        // Never run a service worker in dev — it would cache stale HMR output.
        enabled: false,
      },
    }),
  ].filter(Boolean),
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
