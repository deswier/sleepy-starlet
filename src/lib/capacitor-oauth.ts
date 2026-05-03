import { Capacitor } from "@capacitor/core";
import { supabase } from "@/integrations/supabase/client";

export const isNative = () => Capacitor.isNativePlatform();

// Custom URL scheme registered in ios/android projects.
// Must also be added to Supabase Dashboard → Auth → URL Configuration → Redirect URLs.
export const DEEP_LINK_SCHEME = "dev.sleepystarlet.app";
export const OAUTH_REDIRECT_URI = `${DEEP_LINK_SCHEME}://auth/callback`;

/**
 * Opens Google OAuth in a native browser (SFSafariViewController / Chrome Custom Tab).
 * Uses PKCE so the code_verifier lives in the app's storage, not the external browser.
 * Returns an error string if the URL can't be obtained; actual session delivery happens
 * via the appUrlOpen deep-link handler in App.tsx → AuthContext.onAuthStateChange.
 */
export async function signInWithGoogleNative(): Promise<{ error?: string }> {
  // Lazy-import so the web bundle never pays the cost of @capacitor/browser.
  const { Browser } = await import("@capacitor/browser");

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: OAUTH_REDIRECT_URI,
      skipBrowserRedirect: true, // we open the URL ourselves
    },
  });

  if (error) return { error: error.message };
  if (!data.url) return { error: "No OAuth URL returned" };

  await Browser.open({ url: data.url, windowName: "_self" });
  return {};
}

/**
 * Called from the appUrlOpen deep-link handler with the full URL that arrived.
 * Exchanges the auth code for a session and closes the in-app browser.
 */
export async function handleOAuthCallback(url: string): Promise<void> {
  if (!url.startsWith(DEEP_LINK_SCHEME)) return;

  const { Browser } = await import("@capacitor/browser");
  await Browser.close();

  // Supabase PKCE: extract the code from the query string and exchange it.
  const parsed = new URL(url);
  const code = parsed.searchParams.get("code");
  if (code) {
    await supabase.auth.exchangeCodeForSession(code);
    // onAuthStateChange in AuthContext fires automatically — no extra routing needed.
  }
}
