# Security Audit — Lullaby (Baby Sleep Tracker)

**Scope:** read-only review of `src/`, `supabase/migrations/*.sql`, `supabase/functions/delete-account/`, and `vercel.json`. Stack: React + Vite + Supabase (Postgres + RLS).

**Bottom line:** the server-side perimeter (RLS + RPCs) is mostly sound, but **two policies in combination make every child trivially takeover-able by any authenticated user** who knows or guesses a child UUID. Several other findings are smaller but real. Notably absent: open redirect, XSS, hardcoded secrets, eval, or `dangerouslySetInnerHTML`.

---

## 1. Critical vulnerabilities

### C-1. Cross-tenant child takeover via self-INSERT on `child_users` (IDOR + privilege escalation)

**Description.** RLS on `child_users` has a permissive INSERT policy:
```
-- supabase/migrations/20260429195725_…sql:86-88
CREATE POLICY "Insert own link or to a shared child"
  ON public.child_users FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() OR public.user_has_child_access(auth.uid(), child_id));
```
The `user_id = auth.uid()` branch is unconditional — any authenticated user can insert a `child_users` row linking themselves to **any** child whose UUID they know.

`user_has_child_access(uid, child_id)` (the predicate used by every per-child SELECT/INSERT/UPDATE policy on `children`, `child_settings`, `sleep_sessions`, `sleep_interruptions`, `sleep_places`, `settling_methods`, `child_invites`, `wake_window_rules`) is defined as:
```
-- migration 20260429195725:59-67
SELECT EXISTS(SELECT 1 FROM public.child_users WHERE user_id = _user_id AND child_id = _child_id)
```
So the moment the row exists, the attacker has read access to the entire family's data and (via the auto-create trigger `handle_child_user_link`, migration 20260501182641:50-66) gets a `child_user_roles` row with role `'user'` — write access to sleep sessions follows.

**Impact.** Critical confidentiality and integrity breach. Disclosure: child name, birth date, photo URL, all sleep history, comments, family members' display names, invite codes. Integrity: write/edit own sleep sessions, add custom places/methods, generate fake history.

**Evidence.** Two files combine:
- `supabase/migrations/20260429195725_…sql:86-88` (the policy)
- `supabase/migrations/20260429195725_…sql:59-67` (`user_has_child_access` keyed off `child_users`, not `child_user_roles`)
- The `20260503100000_security_hardening.sql` migration tightened many things but explicitly left this INSERT policy untouched.

**How to reproduce.** As any authenticated user, with knowledge of a victim's `child_id` (UUID — leaked via screenshot, support, family member's device, or direct probing of someone's invite redemption flow):
```js
await supabase.from("child_users").insert({
  child_id: "<victim child uuid>",
  user_id: <my uid>,           // RLS: user_id = auth.uid() ✓
  relation_type: "other",
});
// Trigger creates child_user_roles row with role='user' (since other roles exist).
// All per-child reads/writes are now allowed.
```

**Suggested fix.** Replace the INSERT policy so the only legitimate path is the `redeem_child_invite` RPC: `WITH CHECK (false)` (and let the SECURITY DEFINER RPC do the insert), or restrict to `user_has_child_access(...)` only (drop the `user_id = auth.uid()` branch). The `create_child_with_link` RPC already runs as SECURITY DEFINER and bypasses RLS, so this won't break new-child creation.

---

### C-2. Self-promotion to `admin` via direct INSERT on `child_user_roles`

**Description.** `child_user_roles` has two permissive policies; for INSERT the broader one wins:
```
-- supabase/migrations/20260501182641_…sql:32-39
CREATE POLICY "Admins manage roles" ON public.child_user_roles
  FOR ALL TO authenticated
  USING (public.has_child_role(auth.uid(), child_id, 'admin'))
  WITH CHECK (public.has_child_role(auth.uid(), child_id, 'admin'));

CREATE POLICY "Self insert default role" ON public.child_user_roles
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());      -- no role check, no membership check
```
Postgres RLS combines permissive policies with OR. The "Self insert default role" predicate has **no constraint on the `role` column or on membership**. The trigger `handle_child_user_link` only auto-creates a role row *if none already exists for `(child_id, user_id)`* (it uses `ON CONFLICT DO NOTHING`). Therefore an attacker can pre-empt the trigger:

```js
// 1) Insert role first as 'admin' (legal under "Self insert default role")
await supabase.from("child_user_roles").insert({
  child_id: "<victim child>", user_id: <my uid>, role: "admin",
});
// 2) Then insert the child_users link (legal under C-1 above)
await supabase.from("child_users").insert({
  child_id: "<victim child>", user_id: <my uid>, relation_type: "other",
});
// The AFTER-INSERT trigger tries (child, me, 'user') ON CONFLICT DO NOTHING
// → kept as 'admin'. The attacker is now an admin.
```

**Impact.** Full admin on any child. Combined with C-1, an attacker can: rotate roles, evict the legitimate owner, generate invite codes, soft-delete the child, restore it 30 days later, edit *any* member's sleep sessions. End-to-end takeover.

**Evidence.** `supabase/migrations/20260501182641_…sql:32-66` (policies + trigger).

**Suggested fix.** Remove "Self insert default role" entirely and let the trigger be the only path that inserts roles, OR strengthen its `WITH CHECK` to: `user_id = auth.uid() AND role = 'user' AND NOT EXISTS (SELECT 1 FROM child_user_roles WHERE child_id = NEW.child_id AND user_id = NEW.user_id)`. Also consider a `BEFORE INSERT/UPDATE` trigger that forbids non-admins from inserting/updating any row to `role = 'admin'`.

---

### C-3. Last admin can be silently demoted, orphaning a shared child

**Description.** `leave_child` and `delete_my_account_data` correctly block the sole admin from leaving a shared family. There is **no equivalent guard on UPDATE/DELETE of the `child_user_roles` row itself**. An admin (the only one) can run:
```js
await supabase.from("child_user_roles")
  .update({ role: "user" })
  .eq("child_id", X).eq("user_id", <self>);
```
The "Admins manage roles" policy allows this (they are still admin at the moment of the check); after commit, the child has zero admins. Per CLAUDE.md "A child must always have at least one admin" — the invariant is broken, and `Settings.tsx` will hide all admin UI for that family permanently.

**Impact.** Permanently orphans child data: no one can manage members, generate invites, edit anyone else's sleep sessions, or soft-delete the child. Recovery requires manual DB intervention. Combined with C-1/C-2, an attacker who self-promotes can also use this to lock the legitimate admin out before they realize what happened.

**Evidence.** `supabase/migrations/20260501182641_…sql:32-35` ("Admins manage roles" has no 'last admin' guard); migration `20260507100000_account_and_child_deletion.sql:88-139` (`leave_child` does have the guard).

**Suggested fix.** Add a `BEFORE UPDATE OR DELETE` trigger on `child_user_roles` that, when the row's previous role is `admin`, raises if no other admin would remain on the child *and* there are still other members (mirror `leave_child` logic).

---

## 2. High-risk issues

### H-1. Invite-redemption cooldown is bypassable by rotating the client-supplied `device_id`

**Description.** `redeem_child_invite(_code, _relation, _custom, _device_id)` (migration `20260501204805_…sql:56-99`) calls `invite_cooldown_remaining(_uid, _device_id)`. The cooldown query (`20260501191120_…sql:11-17`) is:
```
WHERE success = false
  AND attempted_at > now() - interval '24 hours'
  AND ((user_id IS NOT NULL AND user_id = _user_id)
       OR (device_id IS NOT NULL AND device_id = _device_id));
```
Failure attempts are recorded with the same client-supplied `_device_id` (lines 77, 83, 95). Sending a fresh random `_device_id` on every call yields zero matches on the device branch. The OR still binds the per-user branch (60s after 6 fails, 5min after 7, 15min after 8, 30min after 9, 4hrs after 10), so a single attacker is rate-limited per account — but a multi-account attacker brute-forcing 6-char codes (32 alphabet, ~10⁹ space) escapes the device branch entirely. The intent of the device branch was to slow down a single device across accounts; because `device_id` is just a string the client sends, it provides essentially no rate-limit value.

**Impact.** Online brute force of invite codes by attackers who can register multiple accounts (Supabase email signup does not require domain verification). Realistically more dangerous as a torrent of failed attempts costing CPU and storage.

**Evidence.** `redeem_child_invite` at `supabase/migrations/20260501204805_…sql:56-99`; cooldown function at `supabase/migrations/20260501191120_…sql:1-29`; `device_id` is plainly client-supplied at `src/lib/device-id.ts:1-8`.

**Suggested fix.** Remove `device_id` from the cooldown predicate (or keep it informational) and rely on `user_id` plus an IP-keyed bucket inferred server-side (e.g., via a request header passed in an Edge Function). At minimum bind cooldown to the `auth.uid()` only, and add an `expires_at` retention so old `invite_attempts` rows are purged.

---

### H-2. Google-only users can set a password with no reauth

**Description.** `Profile.tsx:121-141` correctly forces password reauth before changing a password for users who already have an email/password identity. But `Profile.tsx:143-154` (the "Set password" path for Google-only users):
```ts
const setPassword = async () => {
  if (newPassword.length < 6) { ... }
  if (newPassword !== repeatNewPassword) { ... }
  setBusy(true);
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  ...
};
```
calls `updateUser({ password })` directly — **no fresh proof of presence is required**. This means anyone with momentary control of an authenticated session (a stolen unlocked device, a hijacked browser tab, an attacker in physical possession, a shared kiosk where a previous user forgot to log out) can plant a password and gain persistent email/password access to the account, then walk away without any audit signal to the legitimate Google user.

**Impact.** Account takeover persistence. The Google user's only credentials are SSO; a password planted by an attacker is not visible to them, will work forever (until the legitimate user notices the "I never set a password" flow appears as "Change password"), and will let the attacker log in even if Google revokes the session.

**Evidence.** `src/pages/Profile.tsx:143-154`. Compare with `changePassword` at `src/pages/Profile.tsx:121-141` which correctly re-runs `signInWithPassword` first.

**Suggested fix.** Require reauth before `setPassword`. For OAuth-only users, the simplest is to send a confirmation email (`resetPasswordForEmail`) and complete the password set under a `PASSWORD_RECOVERY` session, exactly like the existing reset flow. Or trigger a Google reauth via `signInWithOAuth` and verify the returned access token before `updateUser`.

---

### H-3. `child_invites` UPDATE/revoke policy lacks role gate

**Description.** Migration `20260501164806_…sql:28-30`:
```
CREATE POLICY "Linked users revoke invites" ON public.child_invites FOR UPDATE TO authenticated
USING (public.user_has_child_access(auth.uid(), child_id));
```
Any member (including `viewer`) can revoke pending invites that the admin generated, and can also UPDATE any column not gated by a column-level constraint (e.g., flip `revoked_at`/`redeemed_at`). The RPC `create_child_invite` correctly requires admin (`20260501204805_…sql:35-37`), but RLS is the actual security perimeter — the RPC is just a convenience.

**Impact.** Operational sabotage: a viewer (e.g., a removed-then-relinked attacker via C-1) can deny invites; a malicious member can flip `redeemed_at` to invalidate codes the admin is sharing.

**Evidence.** `supabase/migrations/20260501164806_…sql:28-30`.

**Suggested fix.** Add `WITH CHECK (public.has_child_role(auth.uid(), child_id, 'admin'))` to the UPDATE policy, and tighten `USING` similarly.

---

### H-4. Member removal in Settings.tsx does multiple direct DB deletes; relies entirely on RLS for ordering and consistency

**Description.** `src/pages/Settings.tsx:205-214`:
```ts
const removeMember = async (uid: string) => {
  if (!activeChild || !isAdmin) return;
  if (!confirm(t("settings.confirmRemoveMember"))) return;
  const { error: e1 } = await supabase.from("child_user_roles").delete()
    .eq("child_id", activeChild.id).eq("user_id", uid);
  const { error: e2 } = await supabase.from("child_users").delete()
    .eq("child_id", activeChild.id).eq("user_id", uid);
  ...
};
```
Two non-transactional client-side deletes. If `e1` succeeds and `e2` fails, the member is left in `child_users` with no role row. The auto-create trigger only fires on `child_users` INSERT, so they are now in an undefined role state. Also, a removed user can immediately re-link via C-1 and rejoin (with role 'user' restored by the trigger) — admin removal is not durable.

**Impact.** Inconsistent state on partial failure; sticky access via re-linking. Combined with C-1, "remove member" is purely cosmetic.

**Evidence.** `src/pages/Settings.tsx:205-214`. Also note Settings.tsx:198-202 (role change) and Settings.tsx:524-531/545 (sleep_places / settling_methods inserts/deletes) similarly trust RLS — fine *if* RLS is correct, but C-1/C-2 show that's not a safe assumption here.

**Suggested fix.** Move member removal into a SECURITY DEFINER RPC (e.g., `remove_child_member(_child_id uuid, _user_id uuid)`) that validates admin, refuses to remove the last admin, and deletes both tables in one transaction. Same for the role-change UPDATE.

---

### H-5. CORS on `delete-account` Edge Function is wide open (`*`)

**Description.** `supabase/functions/delete-account/index.ts:18`:
```ts
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  ...
};
```
This is fine for *bearer-auth* APIs because browsers do not attach `Authorization: Bearer …` cross-origin without explicit JS, and the function correctly validates the JWT. But if the auth header is ever moved to cookies (e.g., because Supabase rolls out cookie sessions), the wildcard CORS would expose this destructive endpoint to CSRF.

**Impact.** Latent risk if auth mode changes. Not currently exploitable, but worth flagging.

**Evidence.** `supabase/functions/delete-account/index.ts:18-22`.

**Suggested fix.** Either restrict origin to the deployed domain(s) and `app.lullaby://` for native, or document the bearer-only assumption explicitly in the function.

---

## 3. Medium / Low issues

### M-1. `localStorage` retains potentially identifying state across logout
`AuthContext.signOut()` (`src/contexts/AuthContext.tsx:52-61`) clears `last_route_v1`, `last_route_user_v1`, `children_cache_v1`, `active_child_id`. It does **not** clear:
- `device_id` (`src/lib/device-id.ts:1-8`) — stable cross-account device identifier
- `cs:isSleeping:{childId}` (CurrentSleep.tsx:91)
- `analytics.tab`, `analytics.day:{ts}`, `analytics.weekOffset:{childId}`, `analytics.excluded:{childId}`
- `i18nextLng`

Of these, `device_id` is the most sensitive: it's the same identifier passed into `redeem_child_invite` for cooldown tracking (see H-1) and survives logout, account deletion, and re-signup. **Impact:** modest — allows correlating two accounts on the same device.

**Fix.** Clear `device_id` and the `analytics.*` keys in `signOut()`, or accept that they persist and document why.

---

### M-2. No length/format constraint on `child_users.custom_relation_name`
The hardening migration adds CHECKs to most user-input columns, but `child_users.custom_relation_name` (set by attacker during C-1 and during `redeem_child_invite`) is unbounded TEXT.

**Impact.** Storage DOS at row level (per-row, capped by Postgres TEXT limits but still abusable by mass insertion).

**Fix.** Add `CHECK (custom_relation_name IS NULL OR char_length(custom_relation_name) <= 100)`.

---

### M-3. `create_child_with_link` lacks `auth.uid() IS NOT NULL` guard
`supabase/migrations/20260501135844_…sql:1-29` is SECURITY DEFINER but does not check `auth.uid() IS NOT NULL` before inserting. Today Supabase rejects unauthenticated RPC calls at the API layer, but the function is one renaming-or-grant change away from creating orphan children with NULL `user_id`.

**Fix.** Add `IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;` at the top, matching the convention of every other recent RPC.

---

### M-4. No Content-Security-Policy header
`vercel.json` only has SPA rewrites — no `headers` block. There's no XSS path I could find (no `dangerouslySetInnerHTML`, no `eval`, no `<Trans components>` over user input, no `<a href={user_url}>` for `javascript:`), but CSP is the standard defense-in-depth control. Without it, a single future regression becomes a full XSS.

**Fix.** Add a Vercel `headers` rule with at minimum: `default-src 'self'; img-src 'self' data: https://*.supabase.co; connect-src 'self' https://*.supabase.co wss://*.supabase.co; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; object-src 'none'; frame-ancestors 'none'`.

---

### M-5. Email confirmation has no secondary client-side gate
`Auth.tsx:65-88` correctly shows a "check your inbox" screen if `data.session === null` after `signUp`. But there is no later check on `user.email_confirmed_at` before allowing app access. If Supabase email-confirmation is ever toggled off in dashboard settings, unconfirmed users walk straight into the app.

**Impact.** Configuration-dependent. Today, fine. Tomorrow, depends on dashboard toggles.

**Fix.** Either gate `RequireAuth` on `user.email_confirmed_at` (with a "please confirm" screen), or document that email confirmation is the contract.

---

### L-1. `last-route` validation is permissive
`src/lib/last-route.ts:12-29` accepts any path that isn't `/auth*` or `/child/new`. In practice paths come from React Router's `location.pathname`, so injection is not realistic, but a stricter allowlist (`/`, `/history`, `/analytics`, `/heatmap`, `/profile`, `/settings`, `/conflicts`, `/deleted-children`) would be defense-in-depth.

### L-2. Avatar/photo upload trusts client `contentType`
`src/pages/Profile.tsx:95-106` and `src/pages/Settings.tsx:89-99` upload with `contentType: "image/jpeg"`. Because storage bucket policies aren't in this repo (likely configured via dashboard), I can't confirm server-side MIME validation. The renders are all `<img src>`, so even an HTML payload wouldn't execute — but this is a "verify your bucket policy" item.

### L-3. `create_child_invite` collision loop unbounded
`supabase/migrations/20260501204805_…sql:39-46`. Realistic at current scale, but a `LIMIT 1000` safety would prevent pathological CPU burn.

### L-4. `confirmDelete` has no `try/finally` around `signOut()`
`src/pages/Profile.tsx:180-190`. If `signOut()` rejects, the user is left signed-in to a deleted account briefly. Auth state will reconcile but UI flickers are possible.

### L-5. `console.error` calls in production
`src/contexts/ChildContext.tsx:137`, `src/lib/native.ts:23`, `src/pages/Settings.tsx:132`, `src/pages/Analytics.tsx:90/171/448`, `src/pages/Heatmap.tsx:210`, `src/pages/NotFound.tsx:8`, `src/lib/auth-errors.ts:40`. None log tokens or full user objects — only error messages and pathnames. Acceptable but worth wrapping behind `import.meta.env.DEV`.

### L-6. `i18nextLng` is auto-cached by i18next; not in the explicit Don't-store list
Language preference. Trivially low.

### L-7. No `target="_blank"` `rel="noopener"` issues found, no inline event handlers
Confirmed clean.

---

## 4. Recommendations (prioritized)

**Must fix (Critical):**
1. **C-1** — Replace `child_users` "Insert own link…" policy with one that requires either a valid invite redemption (force RPC path) or existing access. The two-branch OR is the entire blast radius.
2. **C-2** — Drop "Self insert default role" or strengthen it to forbid non-`'user'` roles and self-insert when a row already exists. Also block self-promotion to admin via a `BEFORE INSERT OR UPDATE` trigger that rejects `role = 'admin'` from non-admin callers.
3. **C-3** — Add a trigger on `child_user_roles` UPDATE/DELETE that prevents removing the last admin while other members exist (mirror `leave_child`).

**Should fix (High):**
4. **H-1** — Drop `device_id` from `invite_cooldown_remaining`; bind cooldown to `auth.uid()` and consider IP via Edge Function.
5. **H-2** — Require reauth (recovery email or fresh OAuth) before letting Google-only users set a password via `Profile.tsx:setPassword`.
6. **H-3** — Add `WITH CHECK (has_child_role(auth.uid(), child_id, 'admin'))` to `child_invites` UPDATE policy.
7. **H-4** — Wrap member removal and role change in a SECURITY DEFINER RPC; same for direct sleep/place/method deletes.
8. **H-5** — Tighten CORS on `delete-account` to the actual deployed origins.

**Nice to have (Medium/Low):**
9. **M-1** — Clear `device_id`, `analytics.*`, `cs:isSleeping:*` in `signOut()` (or document why they persist).
10. **M-2** — Add length CHECK to `child_users.custom_relation_name`.
11. **M-3** — `auth.uid()` guard in `create_child_with_link`.
12. **M-4** — Add CSP via Vercel `headers`.
13. **M-5** — Gate `RequireAuth` on `email_confirmed_at`.
14. **L-1 … L-5** — see above.

---

## What looks good

- No XSS vectors found: no `dangerouslySetInnerHTML`, no `eval`/`Function`, no inline DOM writes, no `<a href={user_url}>` paths, i18n is `escapeValue:false` but renders into JSX text nodes (auto-escaped), `<Trans>` is unused.
- No hardcoded secrets in `src/`. Service-role key is only in the Edge Function via `Deno.env`.
- Password reset flow (`Auth.tsx:99-114`, `AuthContext.tsx:40-42`) delegates correctly to Supabase recovery sessions; no `?next=` open redirect.
- OAuth `redirectTo` uses `window.location.origin` on web and a hardcoded scheme `app.lullaby://auth/callback` on native (`src/lib/native.ts:15-44`); deep-link handler validates the URL prefix before processing.
- `delete-account` Edge Function correctly validates JWT, runs cleanup as the user, then promotes to service-role only for the `auth.users` delete.
- `RequireAuth` (`src/components/RequireAuth.tsx`) waits on `loading` so there's no unauthenticated flash.
- `RouteTracker` only writes when `user !== null` and excludes `/auth`, `/child/new` — no sensitive-route persistence.
- All the destructive RPCs (`soft_delete_child`, `restore_child`, `leave_child`, `delete_my_account_data`, `purge_expired_children`) check `auth.uid()` and admin role server-side; the sole-admin guard is correct in `leave_child` and `delete_my_account_data`.
- Hardened-migration text length/format CHECKs are applied to the major user-input columns (`children.name`, `children.photo_url`, `sleep_*.comment`, `sleep_places.name`, `settling_methods.name`, `profiles.display_name`, `profiles.avatar_url`).

---

**Audit complete.** The three Critical findings (C-1, C-2, C-3) collectively allow a full child-account takeover by any authenticated user who can obtain or guess a `child_id` UUID — fixing those is the highest-leverage work.
