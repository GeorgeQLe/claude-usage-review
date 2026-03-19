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
- [x] Icon: proper .ico file for Windows (multi-resolution)
- [ ] DPI awareness: popover positioning relative to tray
- [ ] Autostart verification on Windows
- [ ] Error handling edge cases: empty states, Set-Cookie refresh in UI
- [ ] `cargo tauri build` producing working MSI installer (setup-windows.ps1 updated with robocopy approach)
- [ ] Fix PowerShell NativeCommandError during build — `npx tauri build` writes info/warning lines to stderr, which PowerShell treats as errors (red text + RemoteException). Need to suppress with `$ErrorActionPreference = "Continue"` or `2>&1` redirection around the build step.
- [ ] End-to-end test on Windows

---

## Next Step Plan: Phase 6 — Polish (DPI Awareness)

### What needs to be done
Ensure popover window positioning works correctly on high-DPI / scaled Windows displays. The popover should appear anchored to the tray icon regardless of display scaling (100%, 125%, 150%, 200%).

### Files to modify
- **`tauri-app/src-tauri/src/lib.rs`** — tray click handler that positions the popover window; may need DPI-aware coordinate calculation
- **`tauri-app/src-tauri/src/state.rs`** — if tray updates interact with window positioning

### Technical details
- Tauri 2's `PhysicalPosition` vs `LogicalPosition` — use logical coordinates for DPI independence
- Windows scale factor available via `window.scale_factor()`
- Test with different DPI settings in Windows Display Settings

### Acceptance criteria
- Popover appears correctly anchored to tray icon at 100%, 150%, and 200% scaling
- No popover clipping at screen edges
