// On web, OAuth and email-confirm links round-trip through window.location.origin.
// In a Capacitor wrapper there is no real origin, so we register a custom URL
// scheme and finalize the Supabase session in an `appUrlOpen` listener. Web
// path is unchanged: getAuthRedirectUrl() returns window.location.origin and
// registerAuthDeepLinkListener() is a no-op.

import { Capacitor } from "@capacitor/core";
import { App, type URLOpenListenerEvent } from "@capacitor/app";
import { supabase } from "@/integrations/supabase/client";
import { devError } from "@/lib/logger";

export const NATIVE_AUTH_REDIRECT = "app.lullaby://auth/callback";

export const isNative = () => Capacitor.isNativePlatform();

export const getAuthRedirectUrl = () =>
  isNative() ? NATIVE_AUTH_REDIRECT : window.location.origin;

export async function registerAuthDeepLinkListener(): Promise<() => void> {
  if (!isNative()) return () => {};
  const handle = await App.addListener("appUrlOpen", (event: URLOpenListenerEvent) => {
    if (!event.url.startsWith(NATIVE_AUTH_REDIRECT)) return;
    finalizeAuthFromCallbackUrl(event.url).catch((e) => {
      devError("auth deep-link finalize failed", e);
    });
  });
  return () => { handle.remove(); };
}

async function finalizeAuthFromCallbackUrl(url: string) {
  const u = new URL(url);
  const code = u.searchParams.get("code");
  if (code) {
    await supabase.auth.exchangeCodeForSession(code);
    return;
  }
  const hash = u.hash.startsWith("#") ? u.hash.slice(1) : u.hash;
  if (!hash) return;
  const params = new URLSearchParams(hash);
  const access_token = params.get("access_token");
  const refresh_token = params.get("refresh_token");
  if (access_token && refresh_token) {
    await supabase.auth.setSession({ access_token, refresh_token });
  }
}
