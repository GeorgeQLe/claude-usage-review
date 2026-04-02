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
- [x] DPI awareness: popover positioning relative to tray
- [x] Autostart verification on Windows
- [x] Error handling edge cases: empty states, Set-Cookie refresh in UI
- [x] `cargo tauri build` producing working MSI installer (setup-windows.ps1 updated with robocopy approach)
- [x] Fix PowerShell NativeCommandError during build — `npx tauri build` writes info/warning lines to stderr, which PowerShell treats as errors (red text + RemoteException). Need to suppress with `$ErrorActionPreference = "Continue"` or `2>&1` redirection around the build step.
- [ ] End-to-end test on Windows

## Phase 7: Expert Review Fixes (2026-04-01)

### Critical
- [x] **Polling handle leak (Tauri)** — `start_polling()` now stores JoinHandle and aborts old task before spawning new one. Callers simplified to single pattern. (`state.rs`, `commands.rs`)
- [x] **GraphQL injection (macOS)** — Username now passed via GraphQL variables instead of string interpolation. (`GitHubService.swift`)

### High
- [ ] **Reuse reqwest::Client (Tauri)** — New client created per API call. Store in `AppState` or `Lazy<Client>`. (`api.rs:45`)
- [ ] **Surface GitHub errors (macOS)** — Empty `catch {}` silently swallows all errors. Add `@Published var error` and display in UI. (`GitHubViewModel.swift:66-68`)
- [ ] **Remove eval() for opacity (Tauri)** — Use Tauri event or DOM API instead of `window.eval()`. (`commands.rs:293`)
- [ ] **Fix blocking_lock in setup (Tauri)** — `state.blocking_lock()` blocks event loop. Move overlay creation to async context. (`lib.rs:223`)
- [ ] **Extract restart-polling helper (Tauri)** — `drop(s); clone; start_polling()` pattern repeated 3 times. Extract helper, ensure `stop_polling()` called in all paths. (`commands.rs:131-133, 170-172, 196-198`)

### Medium
- [ ] **Thread-safe KeychainService cache (macOS)** — Static `cache` dict not synchronized. Add lock or serial queue. (`KeychainService.swift:8`)
- [ ] **Add test coverage** — Tests for `paceRatio()` edge cases, account migration, history compaction, GraphQL query construction.
- [ ] **Document stability thresholds (Tauri)** — Magic numbers (6h elapsed, 1h remaining) need named constants with rationale. (`state.rs:244-246`)
- [ ] **Log corrupted config (Tauri)** — `unwrap_or_default()` silently replaces corrupted config. Log warning, consider backup. (`config.rs:50`)
- [ ] **Escape HTML in main.ts (Tauri)** — Import `escapeHtml()` for backend-sourced strings in popover. (`main.ts:16-17, 90`)

### Low
- [ ] **Slim tokio features (Tauri)** — Replace `features = ["full"]` with only needed features. (`Cargo.toml:21`)
- [ ] **Account delete confirmation (macOS)** — Add confirmation dialog before deleting account. (`SettingsView.swift:249-252`)
- [ ] **Rename email → name (Tauri)** — `AccountMetadata.email` is actually an account label. (`models.rs:28-32`)
- [ ] **Fix menu bar text spacing (Tauri)** — `%W` reads like format specifier; use `% W`. (`state.rs:193`)
- [ ] **Align keyring service name (Tauri)** — `com.claudeusage.credentials` vs app id `com.claudeusage.desktop`. (`credentials.rs:3`)

### Spec conformance
- [ ] **Auto-prompt re-auth on 401/403** — Spec says prompt to re-auth in settings; both platforms only show banner. (`SPEC.md Auth Flow §4`)
- [ ] **Network error backoff** — Spec says retry with backoff; both platforms continue polling at fixed 300s/5min interval. (`SPEC.md Polling Strategy §3`)
