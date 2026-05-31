import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "app.alinamikh.lullaby",
  appName: "Lullaby",
  webDir: "dist",
  android: {
    allowMixedContent: false,
  },
  server: {
    androidScheme: "https",
  },
  plugins: {
    Keyboard: {
      // Resize the <body> element when the software keyboard appears so the
      // WebView content scrolls above the keyboard instead of being covered.
      // "body" is the correct mode for non-Ionic Capacitor apps on iOS.
      resize: "body",
      resizeOnFullScreen: true,
    },
  },
};

export default config;
