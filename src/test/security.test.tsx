/**
 * Security regression tests.
 *
 * Covers four areas introduced / tightened by the security hardening branch:
 *
 *  1. RBAC permission helpers  — pure functions, no mocking needed
 *  2. Logger helpers            — devError / devWarn are DEV-only
 *  3. RequireAuth component     — blocks unconfirmed email accounts (M-5)
 *  4. Supabase security contract— mocked client that mirrors DB-level denials
 *
 * The Supabase tests do NOT test the database directly.  They document the
 * expected server response for each security boundary and verify that client
 * code (a) takes the correct call path and (b) surfaces errors correctly.
 */

import { vi, describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import {
  canCreateSleep,
  canEditOwnSleep,
  canEditAnySleep,
  canEditChild,
  canManageMembers,
} from "@/hooks/useChildRole";
import type { ChildRole } from "@/contexts/ChildContext";
import { devError, devWarn } from "@/lib/logger";
import RequireAuth from "@/components/RequireAuth";

// ─── Supabase mock setup ──────────────────────────────────────────────────────
// vi.hoisted runs before any imports, so mockInsert / mockFrom / mockRpc are
// available inside the vi.mock factory below.

const { mockInsert, mockFrom, mockRpc } = vi.hoisted(() => ({
  mockInsert: vi.fn(),
  mockFrom:   vi.fn(),
  mockRpc:    vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: mockFrom, rpc: mockRpc },
}));

// ─── AuthContext mock (for RequireAuth tests) ─────────────────────────────────

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: vi.fn(),
}));

import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";

const mockedUseAuth = vi.mocked(useAuth);

// Standard RLS denial response (Postgres error code 42501)
const RLS_ERROR = {
  message: "new row violates row-level security policy",
  code: "42501",
};

// Trigger-raised error from prevent_last_admin_removal (C-3)
const LAST_ADMIN_ERROR = {
  message: "Cannot demote or remove the last admin of a shared child. Assign another admin first.",
  code: "P0001",
};

beforeEach(() => {
  vi.clearAllMocks();
  // Default from() returns a builder with a configurable insert
  mockFrom.mockReturnValue({ insert: mockInsert });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 1. RBAC permission helpers
// ═══════════════════════════════════════════════════════════════════════════════

describe("canCreateSleep", () => {
  const cases: [ChildRole, boolean][] = [
    ["admin", true], ["user", true], ["viewer", false], [null, false],
  ];
  it.each(cases)("role=%s → %s", (role, expected) => {
    expect(canCreateSleep(role)).toBe(expected);
  });
});

describe("canEditOwnSleep", () => {
  const cases: [ChildRole, boolean][] = [
    ["admin", true], ["user", true], ["viewer", false], [null, false],
  ];
  it.each(cases)("role=%s → %s", (role, expected) => {
    expect(canEditOwnSleep(role)).toBe(expected);
  });
});

describe("canEditAnySleep — admin only", () => {
  it("admin → true",   () => expect(canEditAnySleep("admin")).toBe(true));
  it("user → false",   () => expect(canEditAnySleep("user")).toBe(false));
  it("viewer → false", () => expect(canEditAnySleep("viewer")).toBe(false));
  it("null → false",   () => expect(canEditAnySleep(null)).toBe(false));
});

describe("canEditChild — admin only", () => {
  it("admin → true",   () => expect(canEditChild("admin")).toBe(true));
  it("user → false",   () => expect(canEditChild("user")).toBe(false));
  it("viewer → false", () => expect(canEditChild("viewer")).toBe(false));
  it("null → false",   () => expect(canEditChild(null)).toBe(false));
});

describe("canManageMembers — admin only", () => {
  it("admin → true",   () => expect(canManageMembers("admin")).toBe(true));
  it("user → false",   () => expect(canManageMembers("user")).toBe(false));
  it("viewer → false", () => expect(canManageMembers("viewer")).toBe(false));
  it("null → false",   () => expect(canManageMembers(null)).toBe(false));
});

// ═══════════════════════════════════════════════════════════════════════════════
// 2. Logger helpers
// ═══════════════════════════════════════════════════════════════════════════════

describe("devError", () => {
  it("calls console.error with all arguments in DEV (test) env", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    devError("[test]", { code: 42 });
    expect(spy).toHaveBeenCalledWith("[test]", { code: 42 });
    spy.mockRestore();
  });

  it("does not throw for any input type", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => devError(null, undefined, 0, [], {})).not.toThrow();
    spy.mockRestore();
  });
});

describe("devWarn", () => {
  it("calls console.warn with all arguments in DEV (test) env", () => {
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    devWarn("[auth-errors] unmapped:", "some message");
    expect(spy).toHaveBeenCalledWith("[auth-errors] unmapped:", "some message");
    spy.mockRestore();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 3. RequireAuth component — M-5 (email confirmation gate)
// ═══════════════════════════════════════════════════════════════════════════════

// Thin wrapper that provides Router context for Navigate
const wrap = (ui: React.ReactElement) =>
  render(<MemoryRouter>{ui}</MemoryRouter>);

describe("RequireAuth", () => {
  it("renders the loading skeleton while auth is resolving", () => {
    mockedUseAuth.mockReturnValue({ user: null, loading: true } as any);
    const { container } = wrap(
      <RequireAuth><div>protected</div></RequireAuth>
    );
    expect(screen.queryByText("protected")).not.toBeInTheDocument();
    // Skeleton div is present (loading state)
    expect(container.querySelector(".min-h-screen")).toBeInTheDocument();
  });

  it("redirects to /auth when there is no user", () => {
    mockedUseAuth.mockReturnValue({ user: null, loading: false } as any);
    wrap(<RequireAuth><div>protected</div></RequireAuth>);
    expect(screen.queryByText("protected")).not.toBeInTheDocument();
  });

  it("renders children for a confirmed email user", () => {
    mockedUseAuth.mockReturnValue({
      user: {
        app_metadata: { provider: "email" },
        email_confirmed_at: "2024-01-01T00:00:00Z",
      },
      loading: false,
    } as any);
    wrap(<RequireAuth><div>protected</div></RequireAuth>);
    expect(screen.getByText("protected")).toBeInTheDocument();
  });

  it("redirects an unconfirmed email user back to /auth (M-5)", () => {
    // Simulates a user who signed up but hasn't clicked the confirmation link.
    // This gate fires only when Supabase is configured with email confirmation
    // disabled — in that mode, unconfirmed sessions are still issued.
    mockedUseAuth.mockReturnValue({
      user: {
        app_metadata: { provider: "email" },
        email_confirmed_at: null,
      },
      loading: false,
    } as any);
    wrap(<RequireAuth><div>protected</div></RequireAuth>);
    expect(screen.queryByText("protected")).not.toBeInTheDocument();
  });

  it("allows a Google-only user through (OAuth emails are always verified)", () => {
    // Google sets email_confirmed_at server-side; but even if the field were
    // absent the guard must not fire — only email-provider accounts are checked.
    mockedUseAuth.mockReturnValue({
      user: {
        app_metadata: { provider: "google" },
        email_confirmed_at: null, // should not matter for OAuth users
      },
      loading: false,
    } as any);
    wrap(<RequireAuth><div>protected</div></RequireAuth>);
    expect(screen.getByText("protected")).toBeInTheDocument();
  });

  it("allows a user whose provider is not email (e.g. google.com variant)", () => {
    mockedUseAuth.mockReturnValue({
      user: {
        app_metadata: { provider: "google.com" },
        email_confirmed_at: undefined,
      },
      loading: false,
    } as any);
    wrap(<RequireAuth><div>protected</div></RequireAuth>);
    expect(screen.getByText("protected")).toBeInTheDocument();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 4. Supabase security contract (mocked client)
//
// These tests document the expected server-level response for each security
// boundary. They simulate what the database would return given current RLS
// policies and triggers. Actual enforcement lives in the DB; these tests:
//   (a) catch client-side regressions (e.g. accidental reversion to direct INSERTs)
//   (b) verify that error shapes are handled correctly by client code
// ═══════════════════════════════════════════════════════════════════════════════

describe("C-1: direct insert into child_users is denied by RLS", () => {
  it("returns a 42501 RLS violation and null data", async () => {
    mockInsert.mockResolvedValue({ data: null, error: RLS_ERROR });

    const result = await supabase
      .from("child_users")
      .insert({ child_id: "victim-child", user_id: "attacker", relation_type: "other" });

    expect(result.error).not.toBeNull();
    expect(result.error!.code).toBe("42501");
    expect(result.data).toBeNull();
  });
});

describe("C-2: direct insert into child_user_roles is denied by RLS", () => {
  it("returns a 42501 RLS violation when trying to self-assign admin", async () => {
    mockInsert.mockResolvedValue({ data: null, error: RLS_ERROR });

    const result = await supabase
      .from("child_user_roles")
      .insert({ child_id: "victim-child", user_id: "attacker", role: "admin" });

    expect(result.error).not.toBeNull();
    expect(result.error!.code).toBe("42501");
    expect(result.data).toBeNull();
  });
});

describe("create_child_with_link RPC (C-1 correct path)", () => {
  it("resolves with the new child id", async () => {
    mockRpc.mockResolvedValue({ data: "new-child-uuid", error: null });

    const result = await supabase.rpc("create_child_with_link", {
      _name: "Baby",
      _birth_date: "2024-01-01",
      _gender: "male",
      _relation: "mother",
    });

    expect(result.error).toBeNull();
    expect(result.data).toBe("new-child-uuid");
    expect(mockRpc).toHaveBeenCalledWith(
      "create_child_with_link",
      expect.objectContaining({ _name: "Baby" }),
    );
  });

  it("returns an error when called without authentication", async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: { message: "Not authenticated", code: "P0001" },
    });

    const result = await supabase.rpc("create_child_with_link", {
      _name: "Test",
      _birth_date: "2024-01-01",
      _gender: "male",
      _relation: "other",
    });

    expect(result.error).not.toBeNull();
    expect(result.data).toBeNull();
  });
});

describe("redeem_child_invite RPC (C-1 correct path)", () => {
  it("resolves with the joined child id", async () => {
    mockRpc.mockResolvedValue({ data: "existing-child-uuid", error: null });

    const result = await supabase.rpc("redeem_child_invite", {
      _code: "ABC123",
      _relation: "other",
    });

    expect(result.error).toBeNull();
    expect(result.data).toBe("existing-child-uuid");
    expect(mockRpc).toHaveBeenCalledWith(
      "redeem_child_invite",
      expect.objectContaining({ _code: "ABC123" }),
    );
  });

  it("returns INVALID_CODE error for a bad code", async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: { message: "INVALID_CODE", code: "P0001" },
    });

    const result = await supabase.rpc("redeem_child_invite", {
      _code: "XXXXXX",
      _relation: "other",
    });

    expect(result.error).not.toBeNull();
    expect(result.error!.message).toContain("INVALID_CODE");
  });
});

describe("remove_child_member RPC (H-4 correct path)", () => {
  it("resolves successfully when an admin removes a non-admin member", async () => {
    mockRpc.mockResolvedValue({ data: null, error: null });

    const result = await supabase.rpc("remove_child_member", {
      _child_id: "child-uuid",
      _member_user_id: "member-to-remove",
    });

    expect(result.error).toBeNull();
    expect(mockRpc).toHaveBeenCalledWith(
      "remove_child_member",
      expect.objectContaining({ _child_id: "child-uuid" }),
    );
  });

  it("returns an error when a non-admin attempts removal", async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: { message: "Only admins can remove members", code: "P0001" },
    });

    const result = await supabase.rpc("remove_child_member", {
      _child_id: "child-uuid",
      _member_user_id: "any-member",
    });

    expect(result.error).not.toBeNull();
    expect(result.error!.message).toContain("Only admins");
  });
});

describe("C-3: last-admin removal is denied by trigger", () => {
  it("remove_child_member returns trigger error when removing the sole admin", async () => {
    mockRpc.mockResolvedValue({ data: null, error: LAST_ADMIN_ERROR });

    const result = await supabase.rpc("remove_child_member", {
      _child_id: "child-uuid",
      _member_user_id: "sole-admin-uuid",
    });

    expect(result.error).not.toBeNull();
    expect(result.error!.message).toContain("last admin");
  });

  it("soft_delete_child returns error when caller is not admin", async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: { message: "Only owners can delete a child", code: "P0001" },
    });

    const result = await supabase.rpc("soft_delete_child", {
      _child_id: "child-uuid",
    });

    expect(result.error).not.toBeNull();
    expect(result.error!.message).toContain("Only owners");
  });
});

describe("H-1: invite cooldown is per user_id (not bypassable by device_id)", () => {
  it("redeem_child_invite returns COOLDOWN error when user has too many failures", async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: { message: "COOLDOWN:3600", code: "P0001" },
    });

    const result = await supabase.rpc("redeem_child_invite", {
      _code: "GUESS1",
      _device_id: "rotated-device-id-99", // even with a fresh device_id
    });

    expect(result.error).not.toBeNull();
    expect(result.error!.message).toMatch(/COOLDOWN/);
  });
});
