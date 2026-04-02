# Phase 6: Polish

- [x] Tauri capabilities/permissions for IPC commands
- [x] Icon: proper .ico file for Windows (multi-resolution)
- [x] DPI awareness: popover positioning relative to tray
- [x] Autostart verification on Windows
- [x] Error handling edge cases: empty states, Set-Cookie refresh in UI
- [x] `cargo tauri build` producing working MSI installer (setup-windows.ps1 updated with robocopy approach)
- [x] Fix PowerShell NativeCommandError during build — `npx tauri build` writes info/warning lines to stderr, which PowerShell treats as errors (red text + RemoteException). Need to suppress with `$ErrorActionPreference = "Continue"` or `2>&1` redirection around the build step.
- [ ] End-to-end test on Windows

---

# Expert Review Findings (2026-04-01)

## Critical (must fix)

- [ ] **state.rs:331-402** — `start_polling()` never stores JoinHandle in `polling_handle`, so `stop_polling()` is a no-op. Multiple polling tasks accumulate after account switches.
- [ ] **GitHubService.swift:28-44** — Username interpolated directly into GraphQL query string. Use GraphQL variables.

## High (should fix)

- [ ] **api.rs:45** — New `reqwest::Client` created per API call. Store in `AppState` and reuse.
- [ ] **GitHubViewModel.swift:66-68** — Empty `catch { }` silently swallows all GitHub API errors. Expose error state to UI.
- [ ] **commands.rs:293** — `window.eval()` for opacity. Use Tauri event or DOM API instead.
- [ ] **lib.rs:223** — `state.blocking_lock()` blocks event loop. Move overlay creation to async context.
- [ ] **commands.rs:131-133, 170-172, 196-198** — `drop(s); clone; start_polling()` repeated 3 times. Extract helper, ensure `stop_polling()` called in all paths.

## Medium (improve)

- [ ] **KeychainService.swift:8** — Static `cache` not synchronized. Add lock or serial queue.
- [ ] **ClaudeUsageTests/** — Add tests for `paceRatio()` edge cases, account migration, history compaction.
- [ ] **state.rs:244-246** — Magic stability thresholds need named constants with rationale.
- [ ] **config.rs:50** — `unwrap_or_default()` silently replaces corrupted config. Log warning.
- [ ] **main.ts:16-17, 90** — Import `escapeHtml()` for backend-sourced strings.

## Low (consider)

- [ ] **Cargo.toml:21** — Slim `tokio` features from `["full"]` to only needed features.
- [ ] **SettingsView.swift:249-252** — Account deletion has no confirmation dialog.
- [ ] **models.rs:28-32** — Rename `email` → `name`/`label` in `AccountMetadata`.
- [ ] **state.rs:193** — `%W` reads like format specifier; use `% W`.
- [ ] **credentials.rs:3** — Keyring service name inconsistent with app identifier.

## Spec conformance

- [ ] **SPEC.md Auth Flow §4** — 401/403 should auto-prompt re-auth in settings; both platforms only show banner.
- [ ] **SPEC.md Polling Strategy §3** — Spec says retry with backoff; both platforms use fixed interval.

---

## Next Step Plan: Phase 6 — End-to-End Test on Windows

### What needs to be done
Run the full build and install pipeline on Windows to verify everything works end-to-end. This is the last unchecked item in Phase 6.

### Steps
1. Open an **elevated PowerShell** on the Windows host
2. Navigate to the WSL project path: `cd \\wsl$\Ubuntu\home\georgeqle\projects\tools\dev\claude-review-usage\tauri-app`
3. Run `.\setup-windows.ps1`
4. Verify:
   - Script completes without NativeCommandError or other PowerShell termination
   - `npm install` succeeds (warnings are printed but don't kill the script)
   - `npx tauri build` completes and produces an MSI
   - MSI is copied back to the WSL source directory
5. Install the MSI on Windows (double-click or `msiexec /i <path>`)
6. Verify the app:
   - Tray icon appears in system tray
   - Clicking tray icon opens popover
   - Settings window opens and can save credentials
   - After adding credentials, usage data loads and displays correctly
   - Autostart toggle works (check Task Manager → Startup)

### Files involved (read-only — no code changes expected)
- `tauri-app/setup-windows.ps1` — the build script being tested
- `tauri-app/src-tauri/tauri.conf.json` — MSI bundle config
- `tauri-app/src-tauri/target/release/bundle/msi/*.msi` — build output

### Acceptance criteria
- `setup-windows.ps1` runs to completion without errors
- MSI installer is produced and copied to WSL source
- Installing the MSI creates a working app with tray icon, popover, and settings
- App can fetch and display Claude usage data after credentials are configured
