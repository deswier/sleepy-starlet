import type { TFunction } from "i18next";

// Maps Supabase auth errors to localized strings. Supabase v2 attaches a
// stable `code` on AuthError; older releases (and some non-auth helpers)
// only set `message`, so we fall back to substring matching.
export function authErrorMessage(error: unknown, t: TFunction): string {
  if (!error) return t("errors.unknown");
  if (error instanceof TypeError) return t("errors.networkError"); // "Failed to fetch"

  const err = error as { code?: string; message?: string; status?: number };

  switch (err.code) {
    case "invalid_credentials":          return t("errors.invalidCredentials");
    case "email_not_confirmed":          return t("errors.emailNotConfirmed");
    case "user_already_exists":
    case "user_already_registered":      return t("errors.userAlreadyRegistered");
    case "weak_password":                return t("errors.weakPassword");
    case "validation_failed":
    case "email_address_invalid":        return t("errors.invalidEmail");
    case "over_email_send_rate_limit":
    case "over_request_rate_limit":      return t("errors.tooManyRequests");
    case "user_not_found":               return t("errors.userNotFound");
    case "same_password":
    case "email_change_unchanged":       return t("errors.sameEmail");
  }

  const m = (err.message ?? "").toLowerCase();
  if (m.includes("invalid login")) return t("errors.invalidCredentials");
  if (m.includes("email not confirmed")) return t("errors.emailNotConfirmed");
  if (m.includes("already registered") || m.includes("already exists")) return t("errors.userAlreadyRegistered");
  if (m.includes("password should be")) return t("errors.weakPassword");
  if (m.includes("invalid email") || m.includes("invalid format")) return t("errors.invalidEmail");
  if (m.includes("rate limit") || err.status === 429) return t("errors.tooManyRequests");
  if (m.includes("user not found")) return t("errors.userNotFound");
  if (m.includes("fetch")) return t("errors.networkError");

  if (err.message) console.warn("[auth-errors] unmapped:", err.message);
  return t("errors.unknown");
}
