# Lullaby — Baby Sleep Tracker

PWA for tracking infant sleep (naps, night sleep, wake windows). Russian + English.

## Stack

- **Vite 5 + React 18 + TypeScript** (SWC plugin). Dev port `8080`.
- **Supabase** (Postgres + RLS + realtime + storage). Client uses `VITE_SUPABASE_URL` / `VITE_SUPABASE_PUBLISHABLE_KEY` (anon key only — never embed service role).
- **TanStack Query** for server state in `History.tsx` (other pages still use manual `useEffect` + `useState` with cancel-ref). `QueryClient` defaults set in `src/App.tsx`: `staleTime: 30s`, `retry: 1`, `refetchOnWindowFocus: false`.
- **Dexie** (IndexedDB) for the offline mutation queue → see `src/lib/offline-queue.ts`.
- **Tailwind + shadcn/ui** (Radix primitives in `src/components/ui/`).
- **react-router-dom v6**, **i18next** (en/ru), **date-fns**, **sonner** (toasts), **lucide-react** (icons).
- **Capacitor 6** for iOS/Android wrapping (`capacitor.config.ts`, `src/lib/native.ts`).
- Google OAuth via `supabase.auth.signInWithOAuth` directly — **not** the Lovable wrapper.

## Domain model

The whole app is per-child. A user is linked to N children via `child_users`; each link gets a row in `child_user_roles` with one of: `viewer`, `user`, `admin`.

Core tables (see `supabase/migrations/`):
- `children` — includes `status` (`active` | `deleted`), `deleted_at`, `deleted_by_user_id`, `deletion_scheduled_at`
- `child_users`, `child_user_roles`, `child_settings`
- `sleep_sessions` (`start_time`, nullable `end_time` = ongoing, `sleep_type` enum `day|night`)
- `sleep_interruptions` (per session, nullable `end_time` = ongoing)
- `sleep_places`, `settling_methods` (per child, defaulted via `handle_new_child` trigger)
- `child_invites` (6-char codes), `invite_attempts` (cooldown enforcement), `wake_window_rules`
- `profiles` — `display_name`, `avatar_url`, `language` (`en`|`ru`), `time_format` (`system`|`h12`|`h24`)

Key invariants:
- A child is created **only via the `create_child_with_link` RPC** (direct INSERT on `children` and `child_users` both blocked by RLS). The RPC creates the link in the same tx; trigger seeds settings + default places/methods.
- Joining an existing child requires `redeem_child_invite`; direct `child_users` INSERT is denied by RLS.
- `child_user_roles` rows are created **exclusively** by the `handle_child_user_link` trigger (AFTER INSERT on `child_users`); direct client INSERT is blocked by RLS.
- Member removal goes through `remove_child_member(_child_id, _member_user_id)` RPC — never via direct DELETE on `child_users` / `child_user_roles`.
- Interruption sync goes through `sync_session_interruptions(_session_id, _interruptions jsonb)` RPC — atomic delete-missing + upsert. Don't loop client-side.
- `sleep_overlaps` RPC checks for overlapping sessions before insert/update.
- `redeem_child_invite` enforces a **per-user** cooldown via `invite_attempts`. Device ID is recorded for forensics but is not trusted for cooldown (client-supplied).
- All RPCs are `SECURITY DEFINER SET search_path = public` and gate access via `user_has_child_access` / `has_child_role` / `user_has_session_access`.
- `ChildContext` always filters `status = 'active'` — soft-deleted children are invisible to the app.
- A child must always have at least one owner (`admin` role). The last admin of a shared child cannot be demoted or removed (enforced by `prevent_last_admin_removal` trigger). Profile deletion is blocked if the user is the sole owner of any child.

## Roles and permissions

| Role | Can start/stop sleep¹ | Can edit own sleep² | Can edit any sleep | Night window / places / methods³ | Members / display / delete child |
|---|---|---|---|---|---|
| `admin` | ✓ | ✓ | ✓ | ✓ | ✓ |
| `user` | ✓ | ✓ | ✗ | ✓ | ✗ |
| `viewer` | ✗ | ✗ | ✗ | ✗ | ✗ |

¹ "Stop" means ending any active session (wake-up, pause, resume) — including sessions started by someone else.  
² "Own sleep" = sessions where `created_by_user_id = user.id` (they started it) **or** `updated_by_user_id = user.id` (they ended/last-edited it). After a `user` stops someone else's sleep, `updated_by_user_id` is set to them and they gain edit rights on that session.  
³ Night-window (`child_settings.night_start_time/end_time`), sleep places, and settling methods. Display toggles (`show_sleep_place` etc.), member management, and child deletion remain admin-only.

- `canCreateSleep(role)` — `admin` or `user` (also used as `canEnd` — stopping any active sleep; and as `canEditFamilySettings` — night window, places, methods)
- `canEditOwnSleep(role)` — `admin` or `user`
- `canEditAnySleep(role)` — `admin` only
- `canEditChild(role)` — `admin` only
- `canManageMembers(role)` — `admin` only

## Sleep state machine

```
[awake]
  └─ startSleep() ──────────────────────────────► [sleeping]
                                                        │
                                            toggleInterruption() (pause)
                                                        │
                                                        ▼
                                              [sleeping + interruption active]
                                                        │
                                            toggleInterruption() (resume)
                                            → opens stop-interruption modal
                                                        │
                                                        ▼
                                                   [sleeping]
                                                        │
                                                    wakeUp()
                                                        │
                                                        ▼
                                            [wake-up confirmation modal]
                                            (draft only — no DB write yet)
                                                        │
                                              SleepForm confirm
                                                        │
                                                        ▼
                                                   [awake]
```

Key rules:
- `wakeUp()` builds a local draft (session + interruptions). Nothing is written to DB until the user confirms via `SleepForm`. Cancel discards the draft with no rollback needed.
- `startSleep()` runs `sleep_overlaps` RPC before INSERT. If overlap → toast error, abort.
- Interruptions do **not** split a session. Session duration is `end - start` regardless of interruptions.
- An interruption's start must be within `[session.start_time, session.end_time]`. Interruptions must not overlap each other.
- Only one active (no `end_time`) sleep session is allowed per child at a time.

## Wake window logic

- Computed from `birthDate` → `ageInMonths` → `wakeWindowForAge(months)` → `{min, max}` minutes.
- Displayed as a colored bar in History between sessions.
- Status: `"good"` if `ww >= min && ww <= max`, else `"warn"`.
- The ongoing wake window (after last completed sleep, today) is projected in real time.
- Night window (`night_start_time` / `night_end_time` from `child_settings`) determines whether a sleep is classified as `day` or `night`.

## Deletion and restoration flows

### Soft-delete a child (admin only)
1. `soft_delete_child(child_id)` RPC: sets `status = 'deleted'`, `deleted_at`, `deletion_scheduled_at = now() + 30 days`.
2. Child disappears from all participants' lists immediately (ChildContext filters `status = active`).
3. Data can be restored within 30 days via `restore_child(child_id)` RPC.
4. `purge_expired_children()` RPC hard-deletes children past the 30-day window.

### Leave a child (non-admin, or admin where other admins exist)
1. `leave_child(child_id)` RPC removes the caller's `child_users` + `child_user_roles` row.
2. Other participants are unaffected.

### Delete profile (user account)
Scenarios checked by `account_deletion_check()` RPC before showing the dialog:
- **blocked** — user is sole admin of a child that has other participants. Must assign another admin or delete the child first.
- **solo** — user is sole participant of a child. After deletion, that child cannot be restored.
- **ownerWithOthers** — user is admin but other admins exist. Other admins keep access.
- **default** — no children affected.

`delete-account` Edge Function calls `auth.admin.deleteUser` with the service role. Client always signs out after invoking it.

## Routing and auth flows

### Post-login routing
```
AuthContext onAuthStateChange (user set)
  → Auth.tsx useEffect fires
  → readLastRoute(user.id) from localStorage
  → navigate(last.path || "/")
  → Index.tsx:
      children.length === 0 → /child/new
      else → render home
```
- `readLastRoute` returns `null` for any path not in the explicit ALLOWED set: `/`, `/history`, `/analytics`, `/heatmap`, `/profile`, `/settings`, `/conflicts`, `/deleted-children`. Query params are stripped before the check.

### Password reset flow
```
Auth.tsx "Forgot password?" → handleForgot() → resetPasswordForEmail(email)
  → "reset email sent" screen

User clicks link in email
  → Supabase redirects to app URL with recovery token in hash
  → AuthContext onAuthStateChange fires PASSWORD_RECOVERY
  → navigate("/auth?mode=reset")
  → Auth.tsx renders reset form (isResetMode = true)

handleResetSubmit() → updateUser({ password })
  → navigate("/", { replace: true })   ← unconditional, no getUser() race
  → RequireAuth + Index.tsx handle the rest
```

### Provider-aware password management (Profile page)
- Detect providers: `user.app_metadata.providers` + `user.identities[].provider`.
- `hasPasswordProvider` = any provider is `"email"` or `"password"`.
- `hasGoogleProvider` = any provider is `"google"` or `"google.com"`.
- **Email/password users**: change password form with current-password re-auth via `signInWithPassword()` before `updateUser({ password })`.
- **Google-only users**: "Set password" button sends `resetPasswordForEmail` to the user's own address, routing through the existing recovery-email flow. `updateUser({ password })` is never called without a prior reauth challenge.
- Forgot password link in the change-password section sends a reset email to the user's own address.

### Email confirmation flow
- After `signUp()`, if `data.session` is `null`, show a "check your inbox" screen instead of routing.
- On mobile, the confirmation link opens the app via deep link.

## Time and duration formatting

All time display goes through centralized helpers in `src/lib/sleep-utils.ts`.  
**Never format time or duration inline in components.**

### Duration — `formatDuration(minutes, locale?)`
- Reads `i18n.language` automatically when `locale` is omitted.
- Format: `0m`, `15m`, `1h`, `1h05m`, `5h15m` (EN) / `0м`, `15м`, `1ч`, `1ч05м`, `5ч15м` (RU).
- Minutes are zero-padded when hours are present: `1h05m` not `1h5m`.
- Returns `0m`/`0м` for < 1 minute (not `<1m`).
- **Never** format durations as clock time (`HH:mm`).

### Clock time — `formatClockTime(date, locale, timeFormat)`
- `timeFormat` is `"system" | "h12" | "h24"` from the user's profile.
- `system`: detects via `navigator.language` (device preference, not app display language) using `Intl.DateTimeFormat.formatToParts` looking for a `dayPeriod` part.
- Renders via `Intl.DateTimeFormat` with `hour12` flag — never with `date-fns format("HH:mm")`.

### Date + time — `fmtDateTime(date, locale, timeFormat)`
- Date part: `dd.MM.yy` (date-fns, locale-aware).
- Time part: `formatClockTime(...)`.

### Date only — `fmtDate(d)`, `fmtWeekday(d)`
- No timeFormat dependency. Use as-is.

### `useTimeFormat()` hook
Use in components instead of importing formatting functions directly:
```ts
const { fmtTime, fmtDateTime, fmtDuration } = useTimeFormat();
```
Reads `timeFormat` from `AuthContext` and locale from `i18n`. Any change to either triggers a re-render.

**Do not** call `formatClockTime` / `fmtDateTime` directly from components — always go through the hook.

`formatDuration` may be called directly from module-level helpers (e.g., Analytics) since it auto-reads `i18n.language` at call time.

### Time format preference
- Stored in `profiles.time_format` (`system` | `h12` | `h24`), default `system`.
- Loaded by `AuthContext.syncLanguageFromProfile` alongside language.
- Exposed as `timeFormat` + `setTimeFormat` on `AuthContext`.
- User edits in Profile page; saved together with language on "Save".

## Localization rules

- Add every new string to **both** `src/i18n/en.ts` and `src/i18n/ru.ts`.
- Never hardcode user-visible strings. Never display raw i18n keys.
- Plurals: `_other` / `_few` / `_many` suffixes per i18next rules.
- Gendered text (e.g. `sleep.wakeUp`, `sleep.startedAt`): use `context: "male" | "female" | "other"` derived from `child.gender`.
- All places/methods stored in English in DB; translate at render time via `localizePlace()` / `localizeMethod()`.
- Duration suffixes: `h`/`m` (EN), `ч`/`м` (RU). Clock separator: locale-agnostic via `Intl`.

Namespaces in i18n files: `app`, `common`, `auth`, `child`, `sleep`, `history`, `analytics`, `settings`, `defaults`, `conflicts`, `profile`, `remove`, `errors`.

## Validation rules

- **New child form**: all fields required — name, birth date, gender, relation type. If relation is `"other"`, the custom-relation text field is also required. Submit button stays disabled until all are filled.
- **Join child form**: code (6 chars), relation type required. If relation is `"other"`, the custom-relation text field is required. Submit disabled until code is 6 chars and all required fields are filled.
- **Birth date**: must be ≤ today. Compare as `YYYY-MM-DD` strings (local date, no timezone shift). Compute today as `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`. Set `max={todayStr}` on date inputs. No minimum date restriction.
- **Sleep start/end**: neither can be in the future. End must be after start.
- **Interruption bounds**: must be within session `[start_time, end_time]`. Interruptions must not overlap.
- **Password**: minimum 6 characters.

## UI constraints

- Every `<Button>` that is **not** inside a `<form>` element must have `type="button"`. Omitting this causes browsers to treat it as `type="submit"` and associate it with nearby unformed inputs via implicit form context.
- `RequiredMark` (`<span className="text-destructive mr-0.5">*</span>`) on every required field label.
- `PasswordInput` with eye-toggle for all password fields; toggle button is `tabIndex={-1}` (keyboard tab skips it).
- Do not write to DB before a confirmation modal commits (see `wakeUp` pattern in `CurrentSleep.tsx`).
- Show loading state for async operations; disable submit buttons during requests; prevent double-submit.

## Directory layout

```
src/
  App.tsx                 routes + lazy pages + QueryClientProvider
  main.tsx                bootstrap
  contexts/
    AuthContext.tsx       supabase auth wrapper; exposes user, session,
                          loading, timeFormat, setTimeFormat, signOut.
                          Loads language + time_format from profile on
                          auth state change. Registers Capacitor deep link
                          listener for native auth callbacks.
    ChildContext.tsx      central state: list (status=active only),
                          activeChild, settings, role, refresh,
                          refreshSettings. Caches list in localStorage.
  hooks/
    useChildRole.ts       thin wrapper over ChildContext.role
    use-mobile.tsx, use-toast.ts
  lib/
    sleep-utils.ts        pure domain: formatDuration, formatClockTime,
                          fmtDateTime, fmtDate, fmtWeekday, sessionDuration,
                          inferSleepType, wakeWindowForAge, ageInMonthsAt,
                          wwThresholdsAt, wwStatus. Exports TimeFormat type.
    use-time-format.ts    useTimeFormat() hook; centralises fmtTime,
                          fmtDateTime, fmtDuration with locale + timeFormat
                          from context.
    offline-queue.ts      Dexie-backed mutation queue + conflict store
                          + flush() on online event
    auth-errors.ts        authErrorMessage(error, t) — maps Supabase error
                          codes to localized strings.
    last-route.ts         per-user route persistence. Saves only routes in the
                          explicit ALLOWED set; anything else is dropped.
                          Strips query params before the check.
    logger.ts             devError / devWarn — console wrappers that are
                          no-ops in production (import.meta.env.DEV guard).
                          Always use instead of console.error / console.warn.
    native.ts             Capacitor helpers: isNative(), getAuthRedirectUrl(),
                          NATIVE_AUTH_REDIRECT, registerAuthDeepLinkListener()
    device-id.ts          stable client id for invite cooldown
    localize-default.ts   localizes seeded place/method names
    method-icons.tsx      lucide icon mapping
    utils.ts              shadcn cn() helper
  i18n/
    index.ts              i18next setup (LanguageDetector + localStorage)
    en.ts, ru.ts          flat namespaces (see Localization rules)
  integrations/
    supabase/client.ts    auto-generated; keep as-is
    supabase/types.ts     auto-generated DB types
  components/
    AppShell.tsx          header + bottom nav (3 tabs)
    RequireAuth.tsx       gate; redirects to /auth for unauthenticated users
                          and for email-provider accounts whose
                          email_confirmed_at is null.
    RouteTracker.tsx      writes last-route on every nav (skips /auth*, /child/new)
    SyncStatus.tsx        offline / pending / conflicts banner
    DateTimeField.tsx     date picker + HH:mm input (always 24h for the
                          <input type="time"> — user-facing display uses
                          formatClockTime separately)
    ImageCropDialog.tsx   avatar crop
    PasswordInput.tsx     password field with eye-toggle (type="button"
                          on toggle, tabIndex={-1})
    RequiredMark.tsx      red asterisk for required labels
    NavLink.tsx
    sleep/
      SleepForm.tsx       create/edit sleep session + interruptions.
                          Lazy-loaded everywhere (dialog-only).
      SleepDetail.tsx     read-only view; one Supabase join.
      InterruptionsEditor.tsx  list editor + validateInterruptions()
    ui/                   shadcn/ui primitives — don't edit
  pages/
    Index.tsx             "/" — redirects to /child/new if no children
    CurrentSleep.tsx      home; start/wake/pause/resume.
    History.tsx           per-day list. TanStack Query + realtime.
    Analytics.tsx         Day/Week tabs. Exports sessionDay + NightWindow.
    Heatmap.tsx           7-day sleep grid
    Settings.tsx          child config + members + invites.
                          saveSettings uses optimistic lock on updated_at.
                          Language preference is NOT here — it lives in Profile.tsx.
    Auth.tsx              sign-in/up/forgot/reset + Google OAuth.
                          Single routing point post-login.
    NewChild.tsx          create child or redeem invite
    Profile.tsx           user profile: name, email, language, timeFormat,
                          photo, change/set password, delete account.
    DeletedChildren.tsx   admin view of soft-deleted children + restore.
    Conflicts.tsx         offline sync conflict resolution
    NotFound.tsx
  test/
supabase/
  config.toml
  migrations/             timestamped SQL migrations
  functions/
    delete-account/       Edge Function; calls auth.admin.deleteUser
                          with service role key.
public/                   PWA manifest + icons
vite.config.ts            manual chunks
vercel.json               SPA rewrite + security headers (CSP, X-Frame-Options,
                          X-Content-Type-Options, Referrer-Policy).
capacitor.config.ts       appId: "app.lullaby", webDir: "dist"
```

## Conventions

**Data fetching.** Read `settings`, `role`, `activeChild`, `children` **only from `ChildContext`**. Never re-query `child_settings`, `child_user_roles`, or `child_users` on a page.

**Race safety.** Every effect that writes state from a network response uses a `cancelled` ref:
```ts
useEffect(() => {
  let cancelled = false;
  someAsync().then((r) => { if (!cancelled) setState(r); });
  return () => { cancelled = true; };
}, [dep]);
```
For new code prefer `useQuery` (see `History.tsx`).

**Error handling.** Loading state must always exit. Use `.catch(...).finally(() => setLoading(false))` on chained `Promise.all`. `try/finally` for awaited multi-step flows. Show `toast.error(t("common.loadFailed"))` for read failures. Use `authErrorMessage(error, t)` from `src/lib/auth-errors.ts` for all Supabase auth errors.

**Realtime.** One channel per `(activeChild.id)` named `sleep-${id}`. Always pass `filter: child_id=eq.${id}` (or `sleep_session_id=eq.${id}` for interruptions). Unfiltered subs would leak row payloads across families. `sleep_interruptions` is intentionally not subscribed in `History.tsx` — `sessionDuration` is `end − start` and is unaffected by interruptions; `SleepDetail` fetches them fresh on open.

**Comments.** Lead with WHY, not WHAT. Prefer no comment over an obvious one.

**Types.** `as any` is tolerated for Supabase joins (typed weakly by the SDK) but avoid elsewhere.

**Lazy loading.** `SleepForm` and `SleepDetail` are dialog-only — always import via `lazy()` and wrap in `<Suspense fallback={null}>`.

**Buttons.** Every `<Button>` not inside a `<form>` must have `type="button"`. Omitting causes browsers to fire implicit form submission when unformed inputs are on the same page.

## RLS / security rules

- `profiles` SELECT restricted to self + members of shared children.
- `children` INSERT requires the RPC (direct INSERT policy dropped).
- `child_users` INSERT blocked client-side; only `create_child_with_link` and `redeem_child_invite` (both SECURITY DEFINER) may insert rows.
- `child_users.UPDATE` cannot change `child_id` / `user_id` (trigger enforced).
- `child_user_roles` INSERT blocked client-side; only the `handle_child_user_link` trigger (AFTER INSERT on `child_users`) may create role rows.
- `child_user_roles` UPDATE/DELETE: `prevent_last_admin_removal` trigger raises if the operation would leave a shared child with no admin.
- `child_invites` SELECT/UPDATE (view/revoke): **admin only**. Non-admins cannot see invite codes or revoke them, preventing a viewer from reading a pending admin-role code and redeeming it from a second account.
- `sleep_sessions` UPDATE: admin (any session) or user (`end_time IS NULL` — can stop any active sleep; or `created_by_user_id = uid`; or `updated_by_user_id = uid`). DELETE: admin or user with `created_by`/`updated_by`.
- `sleep_interruptions` INSERT/UPDATE/DELETE: gated by `has_session_edit_access()` (same rules as sleep_sessions UPDATE). Direct client INSERTs also require `created_by_user_id = auth.uid()`. `sync_session_interruptions` is SECURITY DEFINER and bypasses RLS.
- `sleep_places` / `settling_methods` INSERT/UPDATE: **admin or user**. DELETE: **admin only** — but clients never hard-delete; they soft-delete via `UPDATE deleted_at = now()`. Hard DELETE is reserved for admin housekeeping only.
- `child_settings` UPDATE: **admin or user** (night-window fields). Display toggles are in the same row but the UI gates them with `isAdmin`.
- TEXT columns have CHECK constraints (length, `^https?://` for URLs). `child_users.custom_relation_name` ≤ 100 chars. Add constraints on new user-input columns.
- Edge Functions that need admin access use the service role key from environment — never expose it to the browser. `delete-account` CORS is restricted to the `SITE_URL` env var.

## Critical invariants

- A child must always have at least one admin. The last admin of a shared child cannot be demoted or removed (enforced server-side by `prevent_last_admin_removal` trigger and by `leave_child` / `delete_my_account_data` RPCs). Profile deletion is blocked if the user would leave any child without an owner.
- `child_users` and `child_user_roles` rows are never inserted directly from the client; all join flows go through RPCs.
- Interruptions must not overlap within a session.
- Interruption start and end must be within the parent session's time range.
- Only one active (no `end_time`) session is allowed per child.
- Never write to the DB before a confirmation modal (wake-up confirmation is draft-only until `SleepForm` commits).
- `ChildContext` must always filter `status = 'active'`; soft-deleted children are never shown.
- `sleep_places` and `settling_methods` use soft-delete (`deleted_at` column). Never hard-delete these rows — the FK `ON DELETE SET NULL` on `sleep_sessions` and `sleep_interruptions` would silently wipe place/method attribution from historical records. Set `deleted_at = now()` instead. Active-item queries must filter `deleted_at IS NULL`; `SleepDetail` JOINs deliberately skip this filter so historical names remain visible.
- Birth date cannot be in the future (validated before save and via `max` on the date input).
- Auth redirect URL for native: `app.lullaby://auth/callback`. Use `getAuthRedirectUrl()` everywhere — never hardcode.

## How to run / build / test

```sh
bun install                  # bun.lockb is the canonical lockfile
bun run dev                  # Vite dev on :8080
bun run build                # production build (esnext target)
bun run lint                 # eslint flat config
bun run test                 # vitest run
bun run test:watch           # vitest watch
bun run db:push              # supabase db push (apply migrations)
bun run db:types             # regenerate src/integrations/supabase/types.ts
```

Env: `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` in `.env` (see `.env.example`).

Migrations: timestamped, monotonic. Apply via `supabase db push`. Never edit applied migrations.

## Things to avoid

- **Two lockfiles.** `bun.lockb` is canonical. Don't run `npm install`.
- Don't fetch `child_settings`, `child_user_roles`, or `child_users` on individual pages — they live in `ChildContext`.
- Don't write to DB before a confirmation modal commits.
- Don't run `Promise.all` on read queries without `.catch` — loading state will hang.
- Don't add unfiltered realtime channels.
- Don't loop client-side INSERT/UPDATE/DELETE on related rows — write an RPC.
- Don't bypass `localizePlace` / `localizeMethod` when rendering seeded names.
- Don't hardcode user-visible strings — always use `t("key")`.
- Don't use `toISOString()` or `toLocaleDateString()` for date-only comparisons — compute `YYYY-MM-DD` from local date parts to avoid timezone shift.
- Don't format duration as `HH:mm` — use `formatDuration()`.
- Don't call `formatClockTime` / `fmtDateTime` directly from components — use `useTimeFormat()` hook.
- Don't omit `type="button"` on `<Button>` components outside `<form>` elements.
- Don't embed the Supabase service role key in client-side code.
- Don't INSERT directly into `child_users` — use `create_child_with_link` or `redeem_child_invite` RPC.
- Don't INSERT directly into `child_user_roles` — the `handle_child_user_link` trigger does this automatically on `child_users` INSERT.
- Don't DELETE from `child_users` + `child_user_roles` directly to remove a member — use `remove_child_member` RPC (atomic, admin-gated, trigger-enforced).
- Don't hard-delete `sleep_places` / `settling_methods` rows — set `deleted_at = now()` via UPDATE. Hard DELETE would NULL historical session references silently.
- When querying active places/methods for any dropdown or list, always filter `.is("deleted_at", null)`. Skip this filter only in `SleepDetail`-style JOINs where you want historical names to appear.
- Don't use `console.error` / `console.warn` directly — use `devError` / `devWarn` from `src/lib/logger.ts`.

## Common tasks

**Add a new field to child_settings:**
1. New migration: `ALTER TABLE child_settings ADD COLUMN ...` + CHECK constraint.
2. Extend `ChildSettings` type in `ChildContext.tsx`; add column to both `select(...)` calls.
3. If user-editable, extend `Settings.tsx` form.
4. Add i18n keys to `en.ts` + `ru.ts`.

**Add a new page:**
1. `src/pages/Foo.tsx`. Redirect to `/child/new` if `activeChild === null`.
2. `App.tsx`: `const Foo = lazy(() => import("./pages/Foo"))` + `<Route>`. Wrap in `<RequireAuth>`.
3. Add to `AppShell.tsx` nav only if it belongs in main navigation.

**Add an RPC:**
- `LANGUAGE plpgsql SECURITY DEFINER SET search_path = public`.
- Guard: `IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;`
- Gate by `user_has_child_access`, `has_child_role`, or `user_has_session_access`.
- Call from JS: `supabase.rpc("name", { _arg: value })`.

**Add a TanStack Query in a page:**
- `useQuery({ queryKey: [domain, ...keys], queryFn })`.
- Invalidate via `queryClient.invalidateQueries({ queryKey: [domain] })` from realtime handlers and post-mutation callbacks.
- For one-off non-cached queries, use the cancel-ref pattern.

**Offline write:** Use `enqueue()` from `src/lib/offline-queue.ts` when `!navigator.onLine`. Queue auto-flushes on `online` event and surfaces conflicts to `/conflicts`.

**Remove a member from a child:**
- Call `supabase.rpc("remove_child_member", { _child_id, _member_user_id } as any)`.
- The RPC validates that the caller is admin, blocks self-removal (use `leave_child` for that), and deletes `child_user_roles` + `child_users` atomically. The `prevent_last_admin_removal` trigger enforces the last-admin invariant.

**Add a new time/duration display:**
- Duration → `const { fmtDuration } = useTimeFormat()` → `fmtDuration(minutes)`.
- Clock time → `const { fmtTime } = useTimeFormat()` → `fmtTime(isoString)`.
- Date + time → `const { fmtDateTime } = useTimeFormat()` → `fmtDateTime(isoString)`.
