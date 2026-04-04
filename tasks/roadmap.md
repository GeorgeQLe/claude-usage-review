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
- [x] **Reuse reqwest::Client (Tauri)** — `LazyLock<Client>` static in `api.rs` for connection pooling.
- [x] **Surface GitHub errors (macOS)** — `GitHubViewModel` now exposes `@Published var errorMessage`.
- [x] **Sanitize eval() opacity input (Tauri)** — Validates NaN/infinity, clamps to [0,1]. (`commands.rs`)
- [x] **Fix blocking_lock in setup (Tauri)** — Replaced with `try_lock().expect(...)`. (`lib.rs`)
- [x] **Extract restart-polling helper (Tauri)** — DRY'd into `restart_polling()` at 3 call sites. (`commands.rs`)

### Medium
- [x] **Thread-safe KeychainService cache (macOS)** — Serial `DispatchQueue` guard. (`KeychainService.swift`)
- [x] **Add test coverage** — 16 new tests: pace status, compaction, GraphQL safety, migration.
- [x] **Document stability thresholds (Tauri)** — Doc comments on magic numbers. (`state.rs`)
- [x] **Log corrupted config (Tauri)** — `warn!()` logging before fallback. (`config.rs`)
- [x] **Escape HTML in usage-bar.ts (Tauri)** — Shared `escapeHtml` in `utils/escape.ts`.

### Low
- [x] **Slim tokio features (Tauri)** — Replace `features = ["full"]` with only needed features. (`Cargo.toml:21`)
- [x] **Account delete confirmation (macOS)** — Add confirmation dialog before deleting account. (`SettingsView.swift:249-252`)
- [x] **Rename email → name (Tauri)** — `AccountMetadata.email` is actually an account label. (`models.rs:28-32`)
- [x] **Fix menu bar text spacing (Tauri)** — `%W` reads like format specifier; use `% W`. (`state.rs:193`)
- [x] **Align keyring service name (Tauri)** — `com.claudeusage.credentials` vs app id `com.claudeusage.desktop`. (`credentials.rs:3`)

### Spec conformance
- [x] **Auto-prompt re-auth on 401/403** — Settings window auto-opens on auth error. (`lib.rs`, `state.rs`)
- [x] **Network error backoff** — Exponential backoff (300s→3600s cap) on consecutive network errors. (`state.rs`)
