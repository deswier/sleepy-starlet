# Project Handoff

## App

| Field | Value |
|---|---|
| Name | **Lullaby** — Baby Sleep Tracker |
| Description | PWA + native iOS/Android app for tracking infant sleep (naps, night sleep, wake windows). Russian + English. |
| Tech stack | Vite 5 + React 18 + TypeScript (SWC), Supabase (Postgres + RLS + realtime), TanStack Query, Dexie (offline queue), Tailwind + shadcn/ui, Capacitor 6, vaul (bottom sheets) |
| Package manager | **bun** — `bun.lock` is canonical. Never run `npm install`. |
| PWA | Yes — `manifest.json`, `apple-mobile-web-app-capable`, `viewport-fit=cover` |
| Native iOS | Capacitor 6 — project under `ios/`. Xcode required to build/run. |
| Native Android | Capacitor 6 — project under `android/`. |
| iOS Bundle ID | `app.alinamikh.lullaby` (set in Xcode project / `project.pbxproj`) |
| Deep link scheme | `app.lullaby` — callback URL: `app.lullaby://auth/callback` |
| Dev port | `8080` |

> **Note on Bundle ID vs `capacitor.config.ts`:** `capacitor.config.ts` still has `appId: "app.lullaby"`. The Xcode project overrides this to `app.alinamikh.lullaby`. If `npx cap sync ios` is ever run, verify Xcode has not reverted the Bundle ID. Consider aligning `capacitor.config.ts` to `app.alinamikh.lullaby` to prevent surprises.

---

## Recent changes

### Capacitor iOS setup
- `ios/` directory created and synced via `npx cap sync ios`.
- `ios/App/App.xcodeproj` has `PRODUCT_BUNDLE_IDENTIFIER = app.alinamikh.lullaby`.
- Info.plist registers `CFBundleURLSchemes: [app.lullaby]` for deep links.
- AppDelegate is standard Capacitor boilerplate (no custom additions).
- Status bar: lavender on iOS via `StatusBar.setStyle(Style.Dark)` in `src/lib/native.ts`.
- Android: `StatusBar.setOverlaysWebView({ overlay: false })` + `setBackgroundColor("#A78BDA")`.

### Lavender top status-bar panel (fixed)
- **Bug:** The lavender panel behind the status bar disappeared when scrolling. Root cause: the body's `background-color: #A78BDA` was only visible through `padding-top: env(safe-area-inset-top)`. When child elements scrolled up they painted over that gap.
- **Fix:** Added `body::before { position: fixed; top: 0; height: env(safe-area-inset-top); background-color: #A78BDA; z-index: 9999; pointer-events: none }` in `src/index.css`. Now fixed and always visible regardless of scroll.
- Color: `#A78BDA`. Do not change.
- Android is unaffected: `setOverlaysWebView(false)` makes `safe-area-inset-top = 0` so the pseudo-element has zero height.

### Responsive bottom sheets for modals
- Created `src/components/ui/responsive-dialog.tsx` — wraps Radix `Dialog` (desktop ≥ 768 px) and vaul `Drawer` (mobile < 768 px) behind a unified API (`ResponsiveDialog`, `ResponsiveDialogContent`, etc.).
- Created `src/components/ui/responsive-alert-dialog.tsx` — same pattern for confirmation dialogs.
- All real app modals migrated:
  - Add manual sleep, Stop interruption, Wake-up confirmation (`CurrentSleep.tsx`)
  - Add past sleep (`History.tsx`)
  - Sleep detail / edit sleep (`SleepDetail.tsx`)
  - Delete sleep confirmation (`SleepDetail.tsx`) — replaced `window.confirm()`
  - Image crop (`ImageCropDialog.tsx`) — `dismissible={false}` to avoid drag conflict
  - Delete profile (`Profile.tsx`)
  - Leave / delete child (`Settings.tsx`)
  - Remove family member (`Settings.tsx`) — replaced `window.confirm()`
- Mobile sheet features: `rounded-t-2xl`, `max-h-[90dvh]`, internal `overflow-y-auto`, `pb-[max(1.5rem,env(safe-area-inset-bottom))]`, drag handle, soft overlay `bg-black/40`.
- Desktop: unchanged centered dialog behavior.
- vaul version: `^0.9.9`.

### iOS input zoom fix
- **Bug:** Tapping any `<textarea>` (e.g., comment field in SleepForm) caused iOS to auto-zoom because `font-size < 16 px`.
- **Fix:** `src/components/ui/textarea.tsx` changed from `text-sm` to `text-base md:text-sm`. Same fix applied to `src/components/ui/select.tsx` `SelectTrigger`. `Input` component was already correct (`text-base md:text-sm`).
- iOS only auto-zooms `<input>` and `<textarea>`. `SelectTrigger` is a `<button>` so it wouldn't zoom, but `text-base md:text-sm` was applied for consistency.
- This fix also unblocked vaul's keyboard repositioning (vaul uses `visualViewport` to push the sheet above the keyboard; the zoom was corrupting those calculations).

### Analytics fixes (pre-session)
- Weekly score calculation and summary aligned with daily analytics.
- Night sleep: sum all attributed sessions instead of picking the longest.
- Heatmap: wake-up icons no longer clip at chart edges (vertical padding added).

### Duration formatting (pre-session)
- Russian suffix changed to space-separated `мин` style.

### App icons (pre-session)
- PWA, Android, and iOS icons updated with transparent backgrounds.

---

## Current known issues

### Unsaved changes protection for bottom sheets — NOT implemented
Bottom sheet forms can be swiped down or dismissed by tapping the overlay, silently discarding draft data. Affects:
- Add manual sleep (CurrentSleep)
- Stop interruption draft (CurrentSleep)
- Wake-up confirmation (CurrentSleep)
- Add past sleep (History)
- Sleep detail while in edit mode (SleepDetail)

**Next step:** Wire a `dirty` flag (compare form state to initial values) and call `e.preventDefault()` / show a "Discard changes?" alert before allowing dismissal. This is a follow-up task.

### capacitor.config.ts `appId` mismatch
`capacitor.config.ts` has `appId: "app.lullaby"` but Xcode project uses `app.alinamikh.lullaby`. Running `npx cap sync ios` may reset the Xcode Bundle ID — verify after each sync.

### iOS signing not verified
Xcode code signing (team, provisioning profile) has not been confirmed in this session. Required before running on a physical device or uploading to App Store Connect.

### Google OAuth on iOS — verify
The Google OAuth flow uses `@capacitor/browser` to open a Chrome Custom Tab. The `appUrlOpen` listener in `src/lib/native.ts` finalizes the session. This flow has not been explicitly tested in the native iOS build in this session. Verify in the iOS simulator.

---

## Important implementation notes

- **Capacitor 6** wraps the web build. Always `bun run build` before `npx cap sync ios/android`.
- **iOS project** lives under `ios/`. Do not delete — it contains Xcode-level settings that `cap sync` does not regenerate (Bundle ID, signing, URL scheme).
- **Bundle ID** (for App Store / device identity): `app.alinamikh.lullaby` (Xcode).
- **Deep link scheme** (for auth callbacks): `app.lullaby` — URL: `app.lullaby://auth/callback`. Registered in `ios/App/App/Info.plist`. Used in `src/lib/native.ts` as `NATIVE_AUTH_REDIRECT`. Do **not** confuse with Bundle ID.
- **Top safe-area color**: `#A78BDA`. Hard-coded in `index.css` `body::before` and `body`. Do not change without updating both.
- **Bottom sheets**: vaul `Drawer` on mobile (< 768 px via `useIsMobile()`), Radix `Dialog` on desktop. The `ResponsiveDialog` / `ResponsiveAlertDialog` components handle the switch automatically.
- **Image crop sheet**: `dismissible={false}` — drag gestures inside the crop area must not close the sheet.
- **Keyboard handling**: vaul's `repositionInputs=true` (default) uses `window.visualViewport` to push the drawer above the keyboard. No `@capacitor/keyboard` plugin installed. If keyboard issues persist on device, install `@capacitor/keyboard` with `resize: "body"` as the next fix layer.
- **Android status bar**: uses native color (`StatusBar.setBackgroundColor`), NOT the CSS `body::before` strip. `safe-area-inset-top` is 0 on Android in the current config.
- **CLAUDE.md** in repo root contains the full domain model, RLS rules, conventions, and "things to avoid". Always read it before making changes.
- **Two `window.confirm()` calls removed** — both now use `ResponsiveAlertDialog`. No remaining `window.confirm` in app source.

---

## Commands

```sh
# Dependencies
bun install

# Development
bun run dev          # Vite dev server on :8080

# Build
bun run build        # Production build (esnext target)

# Code quality
bun run lint         # ESLint (flat config)
bun run test         # Vitest — run once
bun run test:watch   # Vitest — watch mode

# Supabase
bun run db:push      # Apply pending migrations
bun run db:types     # Regenerate src/integrations/supabase/types.ts

# Capacitor iOS
bun run build && npx cap sync ios   # Build + sync to Xcode project
npx cap open ios                    # Open ios/ in Xcode
```

---

## Next recommended steps (in order)

1. **Verify iOS build in Xcode** — open `ios/App/App.xcworkspace`, set signing team, run on iPhone simulator. Confirm status bar lavender panel, bottom sheets, keyboard behavior, and Google OAuth flow.

2. **Align `capacitor.config.ts` appId** — change `appId` from `"app.lullaby"` to `"app.alinamikh.lullaby"` to match the Xcode project and prevent `cap sync` from reverting the Bundle ID.

3. **Unsaved-changes protection for bottom sheet forms** — the five form sheets listed above need a `dirty` flag and a "Discard changes?" `ResponsiveAlertDialog` before swipe/overlay dismissal is allowed.

4. **Test Google OAuth on native iOS** — verify the `@capacitor/browser` → `appUrlOpen` → `app.lullaby://auth/callback` flow works end-to-end in the simulator and on a physical device.

5. **Install `@capacitor/keyboard` if keyboard issues persist on device** — configure `resize: "body"` in `capacitor.config.ts` `plugins.Keyboard`. Not needed for simulator (vaul's `visualViewport` handles it there).

6. **Physical device testing** — confirm safe-area insets, home indicator clearance, and bottom-sheet safe-area padding on a real iPhone with Face ID (Dynamic Island or notch).
