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

# Expert Review Findings (2026-03-31)

## High (should fix)

- [ ] **UsageViewModel.swift:425-427** — `DateFormatter` allocated every second via `resetTimeString`. Cache as a static/lazy property.
- [ ] **tauri-app/src-tauri/src/api.rs:45** — New `reqwest::Client` created per API call. Store in `AppState` and reuse.
- [ ] **GitHubViewModel.swift:67** — Empty `catch { }` silently swallows all GitHub API errors. At minimum log; ideally expose error state to UI.

## Medium (improve)

- [ ] **GitHubService.swift:30** — Username interpolated into GraphQL string without escaping. A `"` in username breaks the query silently. Use GraphQL variables or escape special chars.
- [ ] **ClaudeUsageTests/** — Test coverage limited to `UsageData` decoding and `UsageService` requests. Add tests for `paceRatio()` edge cases, account migration, and history compaction.
- [ ] **commands.rs:131-133, 170-172, 196-198** — `drop(s); clone state_arc; start_polling()` pattern repeated 3 times. Extract to a helper function.

## Low (consider)

- [ ] **UsageViewModel.swift:392-405** — `displayLimits` computed property rebuilds array on every access. Could cache.
- [ ] **AccountStore.swift:135-163** — Migration can leave orphaned keychain entries on crash. Not harmful but slightly wasteful.
- [ ] **KeychainService.swift:8** — Static `cache` not synchronized. Safe today (all callers on MainActor) but fragile if callers change.
- [ ] **Cargo.toml:21** — `tokio` with `features = ["full"]` includes unused features. Slim to `["rt-multi-thread", "sync", "macros", "time"]`.
- [ ] **SettingsView.swift:250** — Account deletion has no confirmation dialog.

## Spec conformance

- [ ] **SPEC.md "Auth Flow" vs UsageViewModel.swift:319** — Spec says 401/403 triggers re-auth; implementation shows banner but doesn't auto-prompt. Minor divergence.

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
