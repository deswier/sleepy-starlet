import { describe, it, expect } from "vitest";
import { authErrorMessage } from "@/lib/auth-errors";

// Mock t() — just returns the i18n key so we can assert on keys without loading i18n
const t = (key: string) => key;

describe("authErrorMessage", () => {
  describe("by error code", () => {
    it("invalid_credentials", () => {
      expect(authErrorMessage({ code: "invalid_credentials" }, t as any)).toBe("errors.invalidCredentials");
    });
    it("email_not_confirmed", () => {
      expect(authErrorMessage({ code: "email_not_confirmed" }, t as any)).toBe("errors.emailNotConfirmed");
    });
    it("user_already_exists", () => {
      expect(authErrorMessage({ code: "user_already_exists" }, t as any)).toBe("errors.userAlreadyRegistered");
    });
    it("user_already_registered", () => {
      expect(authErrorMessage({ code: "user_already_registered" }, t as any)).toBe("errors.userAlreadyRegistered");
    });
    it("weak_password", () => {
      expect(authErrorMessage({ code: "weak_password" }, t as any)).toBe("errors.weakPassword");
    });
    it("validation_failed", () => {
      expect(authErrorMessage({ code: "validation_failed" }, t as any)).toBe("errors.invalidEmail");
    });
    it("email_address_invalid", () => {
      expect(authErrorMessage({ code: "email_address_invalid" }, t as any)).toBe("errors.invalidEmail");
    });
    it("over_email_send_rate_limit", () => {
      expect(authErrorMessage({ code: "over_email_send_rate_limit" }, t as any)).toBe("errors.tooManyRequests");
    });
    it("over_request_rate_limit", () => {
      expect(authErrorMessage({ code: "over_request_rate_limit" }, t as any)).toBe("errors.tooManyRequests");
    });
    it("user_not_found", () => {
      expect(authErrorMessage({ code: "user_not_found" }, t as any)).toBe("errors.userNotFound");
    });
    it("same_password", () => {
      expect(authErrorMessage({ code: "same_password" }, t as any)).toBe("errors.sameEmail");
    });
    it("email_change_unchanged", () => {
      expect(authErrorMessage({ code: "email_change_unchanged" }, t as any)).toBe("errors.sameEmail");
    });
    it("otp_expired", () => {
      expect(authErrorMessage({ code: "otp_expired" }, t as any)).toBe("errors.linkExpired");
    });
    it("invalid_token", () => {
      expect(authErrorMessage({ code: "invalid_token" }, t as any)).toBe("errors.linkExpired");
    });
    it("unknown code falls through to unknown", () => {
      expect(authErrorMessage({ code: "some_unknown_code" }, t as any)).toBe("errors.unknown");
    });
  });

  describe("by message substring (legacy fallback)", () => {
    it("'invalid login' in message", () => {
      expect(authErrorMessage({ message: "Invalid login credentials" }, t as any)).toBe("errors.invalidCredentials");
    });
    it("'email not confirmed' in message", () => {
      expect(authErrorMessage({ message: "email not confirmed" }, t as any)).toBe("errors.emailNotConfirmed");
    });
    it("'already registered' in message", () => {
      expect(authErrorMessage({ message: "User already registered" }, t as any)).toBe("errors.userAlreadyRegistered");
    });
    it("'password should be' in message", () => {
      expect(authErrorMessage({ message: "Password should be at least 6 characters" }, t as any)).toBe("errors.weakPassword");
    });
    it("'invalid email' in message", () => {
      expect(authErrorMessage({ message: "Invalid email format" }, t as any)).toBe("errors.invalidEmail");
    });
    it("status 429", () => {
      expect(authErrorMessage({ message: "Quota exceeded", status: 429 }, t as any)).toBe("errors.tooManyRequests");
    });
    it("'user not found' in message", () => {
      expect(authErrorMessage({ message: "User not found" }, t as any)).toBe("errors.userNotFound");
    });
    it("'expired' in message", () => {
      expect(authErrorMessage({ message: "Token expired" }, t as any)).toBe("errors.linkExpired");
    });
    it("'auth session missing' in message", () => {
      expect(authErrorMessage({ message: "Auth session missing" }, t as any)).toBe("errors.linkExpired");
    });
    it("'fetch' in message (network error)", () => {
      expect(authErrorMessage({ message: "Failed to fetch" }, t as any)).toBe("errors.networkError");
    });
  });

  describe("special inputs", () => {
    it("TypeError maps to networkError", () => {
      expect(authErrorMessage(new TypeError("Failed to fetch"), t as any)).toBe("errors.networkError");
    });
    it("null error maps to unknown", () => {
      expect(authErrorMessage(null, t as any)).toBe("errors.unknown");
    });
    it("undefined maps to unknown", () => {
      expect(authErrorMessage(undefined, t as any)).toBe("errors.unknown");
    });
  });
});
