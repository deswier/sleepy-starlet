import { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "dev.sleepystarlet.app",
  appName: "Lullaby",
  webDir: "dist",
  server: {
    // On Android use https scheme so cookies/localStorage work identically to web.
    androidScheme: "https",
  },
  plugins: {
    Browser: {
      // Opens OAuth in a SFSafariViewController / Chrome Custom Tab
      // so system credentials are available. Closes automatically
      // when the custom-scheme deep link fires back to the app.
    },
  },
};

export default config;
