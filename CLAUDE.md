# Lullaby — Baby Sleep Tracker

PWA for tracking infant sleep (naps, night sleep, wake windows). Russian + English.

## Stack

- **Vite 5 + React 18 + TypeScript** (SWC plugin). Dev port `8080`.
- **Supabase** (Postgres + RLS + realtime + storage). Client uses `VITE_SUPABASE_URL` / `VITE_SUPABASE_PUBLISHABLE_KEY` (anon key only — never embed service role).
- **TanStack Query** for server state in `History.tsx` (other pages still use manual `useEffect` + `useState` with cancel-ref). `QueryClient` defaults set in `src/App.tsx`: `staleTime: 30s`, `retry: 1`, `refetchOnWindowFocus: false`.
- **Dexie** (IndexedDB) for the offline mutation queue → see `src/lib/offline-queue.ts`.
- **Tailwind + shadcn/ui** (Radix primitives in `src/components/ui/`).
- **react-router-dom v6**, **i18next** (en/ru), **date-fns**, **sonner** (toasts), **lucide-react** (icons).
- **`@lovable.dev/cloud-auth-js`** wraps Google OAuth (do not bypass; redirect flow is project-specific).

## Domain model

The whole app is per-child. A user is linked to N children via `child_users`; each link gets a row in `child_user_roles` with one of: `viewer`, `user`, `admin`.

Core tables (see `supabase/migrations/`):
- `children`, `child_users`, `child_user_roles`, `child_settings`
- `sleep_sessions` (`start_time`, nullable `end_time` = ongoing, `sleep_type` enum `day|night`)
- `sleep_interruptions` (per session, nullable `end_time` = ongoing)
- `sleep_places`, `settling_methods` (per child, defaulted via `handle_new_child` trigger)
- `child_invites` (6-char codes), `wake_window_rules`, `profiles`

Key invariants:
- A child is created **only via the `create_child_with_link` RPC** (direct INSERT was removed in `20260503100000_security_hardening.sql`). The RPC creates the link in the same tx; trigger seeds settings + default places/methods.
- Interruption sync goes through `sync_session_interruptions(_session_id, _interruptions jsonb)` RPC — atomic delete-missing + upsert. Don't loop client-side.
- `sleep_overlaps` RPC checks for overlapping sessions before insert.
- `redeem_child_invite` enforces a per-user/device cooldown via `invite_attempts` table.
- All RPCs are `SECURITY DEFINER SET search_path = public` and gate access via `user_has_child_access` / `has_child_role` / `user_has_session_access`.

## Directory layout

```
src/
  App.tsx                 routes + lazy pages + QueryClientProvider
  main.tsx                bootstrap
  contexts/
    AuthContext.tsx       supabase auth wrapper; signOut clears
                          children_cache_v1 + active_child_id
    ChildContext.tsx      central state: list, activeChild, settings,
                          role, refresh, refreshSettings.
                          Caches list in localStorage keyed by userId.
  hooks/
    useChildRole.ts       thin wrapper over ChildContext.role
                          (kept for import-path compat)
    use-mobile.tsx, use-toast.ts
  lib/
    sleep-utils.ts        pure domain (formatDuration, sessionDuration,
                          inferSleepType, wakeWindowForAge, ageInMonthsAt)
    offline-queue.ts      Dexie-backed mutation queue + conflict store
                          + flush() on online event
    last-route.ts         per-user route persistence
    device-id.ts          stable client id for invite cooldown
    localize-default.ts   localizes seeded place/method names
    method-icons.tsx      lucide icon mapping
    utils.ts              shadcn cn() helper
  i18n/
    index.ts              i18next setup (LanguageDetector + localStorage)
    en.ts, ru.ts          flat namespaces: app, common, auth, child,
                          sleep, history, analytics, settings, defaults,
                          conflicts, profile
  integrations/
    supabase/client.ts    auto-generated; keep as-is
    supabase/types.ts     auto-generated DB types
    lovable/index.ts      Google OAuth wrapper
  components/
    AppShell.tsx          header + bottom nav (3 tabs)
    RequireAuth.tsx       gate; redirects to /auth
    RouteTracker.tsx      writes last-route on every nav
    SyncStatus.tsx        offline / pending / conflicts banner
    DateTimeField.tsx     reusable date+time input
    ImageCropDialog.tsx   avatar crop
    NavLink.tsx
    sleep/
      SleepForm.tsx       create/edit sleep session + interruptions.
                          Lazy-loaded everywhere (dialog-only).
                          Reads settings from ChildContext;
                          uses sync_session_interruptions RPC.
      SleepDetail.tsx     read-only view; one Supabase join (place +
                          method + creator + interruptions)
      InterruptionsEditor.tsx  list editor + validateInterruptions()
    ui/                   shadcn/ui primitives — don't edit
  pages/
    Index.tsx             "/" — wraps CurrentSleep in AppShell
    CurrentSleep.tsx      home; start/wake; pause/resume interruption.
                          Two realtime channels: sessions filtered by
                          child_id, interruptions filtered by active
                          sleep_session_id. Wake-up draft is local-only
                          until user confirms (no DB write on open).
    History.tsx           per-day list. Uses useQuery + invalidate on
                          realtime. Day navigation cached.
    Analytics.tsx         Day/Week tabs. Exports `sessionDay` and
                          `NightWindow` (consumed by History.tsx).
                          Week tab `forceMount`-ed so its data is
                          ready when user switches.
    Heatmap.tsx           7-day grid view + interruption icons
    Settings.tsx          child config + members + invites.
                          saveSettings uses optimistic lock on
                          updated_at — surfaces conflict via toast.
    Auth.tsx              sign-in/up + Google. Single routing point
                          via useEffect on user state.
    NewChild.tsx          create child or redeem invite
    Profile.tsx, Conflicts.tsx, NotFound.tsx
  test/                   vitest setup; almost empty (improvement target)
supabase/
  config.toml             local CLI config
  migrations/             dated SQL migrations — apply via Supabase CLI
public/                   PWA manifest + icons
vite.config.ts            manual chunks: vendor-react, vendor-supabase,
                          vendor-radix, vendor-query, vendor-date-fns,
                          vendor-lucide, vendor-dexie, vendor-i18n
```

## Conventions

**Data fetching.** Read `settings`, `role`, `activeChild`, `children` **only from `ChildContext`** — they are already shared. Never re-query `child_settings`, `child_user_roles`, or `child_users` on a page.

**Race safety.** Every effect that writes state from a network response uses a `cancelled` ref so a slow previous response doesn't overwrite newer data:
```ts
useEffect(() => {
  let cancelled = false;
  someAsync().then((r) => { if (!cancelled) setState(r); });
  return () => { cancelled = true; };
}, [dep]);
```
For new code prefer `useQuery` (see `History.tsx`).

**Error handling.** Loading state must always exit. Use `.catch(...).finally(() => setLoading(false))` on chained `Promise.all`. `try/finally` for awaited multi-step flows. Show `toast.error(t("common.loadFailed"))` for read failures.

**Realtime.** One channel per `(activeChild.id)` named `sleep-${id}`. Always pass `filter: child_id=eq.${id}` (or `sleep_session_id=eq.${id}` for interruptions of an active session). Unfiltered subs reload on every other family's edits.

**i18n.** Add new strings to **both** `src/i18n/en.ts` and `src/i18n/ru.ts`. Plurals via i18next `_other`/`_few`/`_many` suffixes. Gendered strings (e.g. `sleep.startedAt`) use `context: "male" | "female" | "other"` derived from `child.gender`.

**Comments.** Lead with WHY, not WHAT. The codebase prefers no comment over an obvious one. Keep them short.

**Types.** `as any` is tolerated for Supabase joins (typed weakly by the SDK) but should otherwise be avoided.

**Lazy loading.** `SleepForm` and `SleepDetail` are dialog-only — always import via `lazy()` and wrap in `<Suspense fallback={null}>`.

## RLS / security rules

- `profiles` SELECT is restricted to self + members of shared children (since `20260503100000`). Don't relax.
- `children` INSERT requires the RPC; `child_users.UPDATE` cannot change `child_id` / `user_id` (trigger).
- TEXT columns have CHECK constraints (length, `^https?://` for URLs). When adding a new user-input column, add a constraint.

## How to run / build / test

```sh
bun install                  # bun.lockb is the canonical lockfile here
bun run dev                  # Vite dev on :8080
bun run build                # production build (esnext target)
bun run build:dev            # dev-mode build (keeps componentTagger)
bun run lint                 # eslint flat config
bun run test                 # vitest run
bun run test:watch           # vitest watch
```

Env: `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` in `.env` (no `.env.example` yet).

Migrations: `supabase db push` from the project root (requires Supabase CLI + linked project). Migrations are timestamped — keep ordering monotonic.

Tests: only `src/test/example.test.ts` is meaningful right now. Pure functions to cover first: `sleep-utils.*`, `Analytics.sessionDay`, `InterruptionsEditor.validateInterruptions`, `offline-queue.applyMutation`, `last-route.*`.

## Things to avoid

- **Two lockfiles.** `bun.lockb` and `package-lock.json` both exist; prefer `bun.lockb`. Don't run `npm install` (will desync).
- Don't fetch `child_settings`, `settling_methods` (when only IDs are needed), `child_user_roles`, or `child_users` on individual pages — they live in `ChildContext` or are loaded once in dialog forms.
- Don't write to DB before a confirmation modal commits (see `wakeUp` pattern in `CurrentSleep.tsx`).
- Don't run `Promise.all` on read queries without `.catch` — loading state will hang on transient failures.
- Don't add unfiltered realtime channels.
- Don't loop client-side INSERT/UPDATE/DELETE on related rows — write an RPC (see `sync_session_interruptions`).
- Don't bypass `localizePlace` / `localizeMethod` when rendering seeded names — defaults are stored in English in DB and translated at render time.
- `react-i18next` is set up; never hardcode strings shown to users.

## Common tasks

**Add a new field to child_settings:**
1. New migration: `ALTER TABLE child_settings ADD COLUMN ...` + length/range CHECK.
2. Extend `ChildSettings` type in `src/contexts/ChildContext.tsx` and add the column to both `select(...)` calls (initial effect + `refreshSettings`).
3. If user-editable, extend the `Settings.tsx` form (it does its own `select("*")` so no schema change needed there).
4. Add i18n keys to `en.ts` + `ru.ts`.

**Add a new page:**
1. `src/pages/Foo.tsx`. Most pages import `useChildren()`; redirect to `/child/new` if `activeChild === null`.
2. In `App.tsx`: `const Foo = lazy(() => import("./pages/Foo"))` + a `<Route>`. Wrap in `<RequireAuth>` and (if it should show the bottom nav) `<AppShell>`.
3. Add a tab in `AppShell.tsx` only if it belongs to the main navigation.

**Add an RPC:**
- `LANGUAGE plpgsql SECURITY DEFINER SET search_path = public`.
- `IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;`
- Gate by `user_has_child_access`, `has_child_role`, or `user_has_session_access`.
- Call from JS via `supabase.rpc("name", { _arg: value })`. JSONB params accept JS objects directly.

**Add a query in a page:**
- Prefer `useQuery({ queryKey: [domain, ...keys], queryFn })`. Invalidate via `queryClient.invalidateQueries({ queryKey: [domain] })` from realtime handlers and post-mutation callbacks.
- For one-off non-cached queries, use the cancel-ref pattern.

**Offline write:** Use `enqueue()` from `src/lib/offline-queue.ts` when `!navigator.onLine` (see SleepForm submit). The queue auto-flushes on `online` event and surfaces conflicts to `/conflicts`.
