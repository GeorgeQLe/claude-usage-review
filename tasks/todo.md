# ClaudeUsage Windows App (Tauri 2) — Plan

## Phase 1: Scaffolding ✅
- [x] Create `tauri-app/` directory structure
- [x] `package.json`, `tsconfig.json`, `vite.config.ts` (multi-page: index, settings, overlay)
- [x] `Cargo.toml` with all dependencies (tauri, reqwest, keyring, chrono, uuid, etc.)
- [x] `tauri.conf.json` — tray icon config, no default windows, MSI bundle target
- [x] Generate tray icon PNGs (green/yellow/red, 32x32 circles)
- [x] Rust compiles (`cargo check` passes)
- [x] TypeScript compiles (`tsc --noEmit` passes)
- [x] Vite builds all 3 HTML entry points

## Phase 2: Core Backend (Rust) ✅
- [x] `models.rs` — UsageLimit, UsageData, AccountMetadata, DisplayLimit, UsageState, enums
- [x] `api.rs` — fetch_usage with headers, Set-Cookie parsing, error mapping (401/403 → AuthError)
- [x] `credentials.rs` — keyring crate wrapping Windows Credential Manager
- [x] `config.rs` — JSON config at AppData/ClaudeUsage/config.json
- [x] `state.rs` — polling (300s), pace calculation (▲/▼, 1.15/0.85 thresholds), time formatting, tray updates
- [x] `commands.rs` — 16 IPC handlers (usage, accounts CRUD, credentials, config, overlay)
- [x] `overlay.rs` — overlay window management (3 layouts, frameless/always-on-top)
- [x] `lib.rs` — Tauri setup with tray icon, context menu, popover toggle, autostart plugin

## Phase 3: Popover UI (Frontend) ✅
- [x] `types.ts` — TypeScript interfaces matching Rust structs
- [x] `components/circle-progress.ts` — SVG progress ring, color thresholds
- [x] `components/usage-bar.ts` — bar component with ring, percentage, reset time, pace detail
- [x] `components/account-picker.ts` — account switcher for 2+ accounts
- [x] `main.ts` — popover: usage-updated event listener, error states, add account, toolbar

## Phase 4: Settings Window ✅
- [x] `settings.ts` — editable name, auth status dot, credentials inputs, save/test, time format, overlay config, account list

## Phase 5: Overlay Widget ✅
- [x] `overlay.ts` — 3 layouts (compact bar, minimal text, vertical sidebar), draggable, opacity, double-click/right-click

## Phase 6: Polish
- [x] Tauri capabilities/permissions for IPC commands
- [ ] Icon: proper .ico file for Windows (multi-resolution)
- [ ] DPI awareness: popover positioning relative to tray
- [ ] Autostart verification on Windows
- [ ] Error handling edge cases: empty states, Set-Cookie refresh in UI
- [ ] `cargo tauri build` producing working MSI installer
- [ ] End-to-end test on Windows

---

## Next Step Plan: Phase 6 — Polish (Windows Icon)

### What needs to be done
Create a proper multi-resolution .ico file for the Windows app. The current tray icons are 32x32 PNGs (green/yellow/red circles). Windows needs a proper app icon (.ico) with multiple resolutions (16x16, 32x32, 48x48, 256x256) for the taskbar, installer, and window title bar.

### Files to create/modify
- **`/tmp/claude-usage-review/tauri-app/src-tauri/icons/`** — create multi-resolution .ico files
- **`/tmp/claude-usage-review/tauri-app/src-tauri/tauri.conf.json`** — update `icon` paths in bundle config

### Technical details
- Tauri expects icons listed in `tauri.conf.json` under `bundle.icon`
- For Windows: need `icon.ico` (multi-res) and optionally `icon.png`
- Can generate from SVG or use ImageMagick `convert` to combine PNGs into .ico
- The existing tray PNGs (`tray-green.png`, etc.) are separate from the app icon

### Acceptance criteria
- `tauri.conf.json` `bundle.icon` references valid icon files
- `cargo tauri build` doesn't warn about missing icons
- .ico contains at least 32x32 and 256x256 resolutions
