# Lullaby — Baby Sleep Tracker

A progressive web app (PWA) for tracking infant sleep. Supports multiple caregivers, offline use, and both Russian and English.

---

## What it does

- Record when a baby falls asleep and wakes up (one tap).
- Track wake windows between sleeps and compare them to age-based norms.
- Log sleep interruptions (brief wake-ups within a session) without splitting the record.
- View history by day, weekly analytics, and a 7-day heatmap.
- Share a child profile with family members under different roles.
- Works offline — mutations queue locally and sync on reconnect.

---

## Key features

| Feature | Details |
|---|---|
| Sleep tracking | Start/end sessions; auto-classify as day or night |
| Interruptions | Log mid-sleep wake-ups; sessions remain continuous |
| Wake windows | Age-based min/max norms; color-coded in history |
| Family access | Invite codes; roles: Owner / Editor / Viewer |
| Analytics | Daily and weekly stats; deviation from age norms |
| Heatmap | 7-day drag-scrollable sleep grid |
| Offline | Dexie mutation queue; conflict resolution screen |
| Multi-child | Switch between children; data scoped per child |
| Soft delete | Children and accounts can be deleted safely |

---

## Core concepts

### Sleep session
A record with `start_time` and nullable `end_time` (null = ongoing). Classified as `day` or `night` based on the child's night window setting. Only one active session per child at a time.

### Interruption
A brief wake-up within a session. Does not split the session — sleep is considered continuous. Start and end must fall within the session bounds; interruptions must not overlap each other.

### Wake window
Time elapsed between the end of one sleep and the start of the next. Compared to age-based norms derived from the child's birth date. Shown as a colored bar between sessions in the history view.

### Night window
Configured per child (`night_start_time`, `night_end_time`). Determines day vs. night classification and how cross-midnight sessions are attributed to calendar days in analytics.

### Child / User / Role

- A **user** is linked to one or more **children**.
- Each link carries a **role**: `admin` (Owner), `user` (Editor), `viewer` (Viewer).
- A child must always have at least one `admin`.
- All data (sessions, settings, places, methods) is scoped per child.

### Soft delete
Deleting a child sets `status = 'deleted'` and schedules hard deletion 30 days out. It disappears from all participants immediately. Admins can restore within the window via Profile → Deleted Children.

---

## Tech stack

- **Vite 5 + React 18 + TypeScript** (SWC)
- **Supabase** — Postgres, RLS, Realtime, Storage, Edge Functions
- **TanStack Query** — server state caching (History page)
- **Dexie** — IndexedDB offline mutation queue
- **Tailwind CSS + shadcn/ui** — Radix primitives
- **react-router-dom v6** — client-side routing
- **i18next** — EN/RU localization
- **date-fns** — date arithmetic
- **sonner** — toasts
- **Capacitor 6** — iOS/Android wrapping

---

## Environment variables

```env
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=<anon-key>
```

Copy `.env.example` to `.env` and fill in values from Supabase → Project Settings → API.

---

## How to run

```sh
bun install           # install dependencies (bun.lockb is canonical — do not use npm)
bun run dev           # start dev server on :8080
bun run build         # production build
bun run lint          # eslint
bun run test          # vitest
bun run db:push       # apply Supabase migrations (requires Supabase CLI + linked project)
bun run db:types      # regenerate TypeScript types from DB schema
```

---

## Deployment

### Vercel
`vercel.json` contains a catch-all SPA rewrite. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` in Vercel project settings.

### Supabase
- Migrations: `supabase db push`.
- Edge Functions: `supabase functions deploy delete-account`.
- Authentication → URL Configuration:
  - Site URL: production domain
  - Additional redirect URLs: `https://*.vercel.app/**`, `app.lullaby://auth/callback`
- Enable Google OAuth under Authentication → Providers.

### Native (iOS / Android)
```sh
bun run cap:ios       # build + sync + open Xcode
bun run cap:android   # build + sync + open Android Studio
```
Deep link scheme: `app.lullaby`. Auth callbacks use `app.lullaby://auth/callback`.

---

## Important notes

### Offline behavior
- Mutations while offline are queued in Dexie (`src/lib/offline-queue.ts`).
- Queue flushes automatically on the `online` event.
- Conflicts (queued change vs. server change) appear on the `/conflicts` screen.
- The `SyncStatus` banner shows pending count and connection state.

### Localization
- All user-visible strings live in `src/i18n/en.ts` and `src/i18n/ru.ts`. Nothing is hardcoded.
- Gender-specific text (Russian verb agreement) uses i18next `context` derived from `child.gender`.
- Sleep places and settling methods are stored in English in the DB; translated at render time via `localizePlace()` / `localizeMethod()`.
- Time format preference (`system` / `12-hour` / `24-hour`) is stored per user in `profiles.time_format`.

### Time formatting
- **Durations** (sleep length, wake windows): `5h15m` (EN) / `5ч15м` (RU). Never `HH:mm`.
- **Clock times** (session start/end): respect the user's time format preference via the `useTimeFormat()` hook.
- Components must use `useTimeFormat()` — never call formatting functions directly.

### Data consistency
- Children are created only via the `create_child_with_link` RPC — never with a direct INSERT.
- Interruptions are synced atomically via the `sync_session_interruptions` RPC.
- Overlap detection uses the `sleep_overlaps` RPC before any session insert or edit.
- Wake-up confirmation is a local draft — no DB write until the user confirms.
- Settings use an optimistic lock (`updated_at`) to detect concurrent edits by family members.

### Roles and access
- **Owner (admin)**: full control — edit any sleep, manage members, delete/restore child.
- **Editor (user)**: start/end sleep and edit own sessions.
- **Viewer**: read-only.
- Account deletion is blocked if the user is the sole admin of any child with other participants.
