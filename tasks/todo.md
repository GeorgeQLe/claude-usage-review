# Phase 6: Polish

- [x] Tauri capabilities/permissions for IPC commands
- [x] Icon: proper .ico file for Windows (multi-resolution)
- [x] DPI awareness: popover positioning relative to tray
- [ ] Autostart verification on Windows
- [ ] Error handling edge cases: empty states, Set-Cookie refresh in UI
- [ ] `cargo tauri build` producing working MSI installer (setup-windows.ps1 updated with robocopy approach)
- [ ] Fix PowerShell NativeCommandError during build — `npx tauri build` writes info/warning lines to stderr, which PowerShell treats as errors (red text + RemoteException). Need to suppress with `$ErrorActionPreference = "Continue"` or `2>&1` redirection around the build step.
- [ ] End-to-end test on Windows

---

## Next Step Plan: Phase 6 — Autostart Verification on Windows

### What needs to be done
Verify that the `tauri-plugin-autostart` integration actually works on Windows — the app should launch at login when autostart is enabled. Currently the plugin is initialized in `lib.rs` with `MacosLauncher::LaunchAgent` which is macOS-specific; need to confirm Windows behavior and add a UI toggle.

### Files to check/modify
- **`tauri-app/src-tauri/src/lib.rs`** — autostart plugin init (line ~53). `MacosLauncher::LaunchAgent` may be ignored on Windows, but verify. The plugin uses Windows Registry `HKCU\Software\Microsoft\Windows\CurrentVersion\Run` on Windows.
- **`tauri-app/src-tauri/capabilities/default.json`** — ensure `autostart:default` permission is granted (already present)
- **`tauri-app/src/settings.ts`** — add autostart toggle if not already present. Use `@tauri-apps/plugin-autostart` JS API (`enable()`, `disable()`, `isEnabled()`)
- **`tauri-app/src/settings.html`** — add autostart checkbox in Preferences section

### Technical details
- `tauri-plugin-autostart` v2 JS API: `import { enable, disable, isEnabled } from '@tauri-apps/plugin-autostart'`
- The `--autostarted` arg is already passed (line ~55) — can be used to detect autostart launches
- On Windows, the plugin writes to `HKCU\Software\Microsoft\Windows\CurrentVersion\Run`
- Verify with `reg query "HKCU\Software\Microsoft\Windows\CurrentVersion\Run" /v ClaudeUsage`

### Acceptance criteria
- Settings UI has an "Launch at login" toggle
- Toggle calls `enable()`/`disable()` from the plugin JS API
- Toggle state reflects `isEnabled()` on settings load
- After enabling, app appears in Windows startup apps (Task Manager → Startup tab)
- After disabling, app is removed from startup
