# Phase 6: Polish

- [x] Tauri capabilities/permissions for IPC commands
- [x] Icon: proper .ico file for Windows (multi-resolution)
- [x] DPI awareness: popover positioning relative to tray
- [x] Autostart verification on Windows
- [x] Error handling edge cases: empty states, Set-Cookie refresh in UI
- [ ] `cargo tauri build` producing working MSI installer (setup-windows.ps1 updated with robocopy approach)
- [ ] Fix PowerShell NativeCommandError during build — `npx tauri build` writes info/warning lines to stderr, which PowerShell treats as errors (red text + RemoteException). Need to suppress with `$ErrorActionPreference = "Continue"` or `2>&1` redirection around the build step.
- [ ] End-to-end test on Windows

---

## Next Step Plan: Phase 6 — MSI Installer Build

### What needs to be done
Get `cargo tauri build` producing a working MSI installer. The `setup-windows.ps1` script already copies the project to a Windows-native path and runs the build, but the actual `cargo tauri build` step needs verification and any remaining issues fixed.

### Files to check/modify
- **`tauri-app/setup-windows.ps1`** — verify the robocopy + build flow works end-to-end; may need `$ErrorActionPreference = "Continue"` to suppress PowerShell NativeCommandError from stderr output
- **`tauri-app/src-tauri/tauri.conf.json`** — verify MSI bundle config (product name, version, icon paths, WiX settings)
- **`tauri-app/src-tauri/Cargo.toml`** — ensure release profile and features are correct for production build

### Technical details
- The PowerShell NativeCommandError issue (separate todo item) is closely related — `npx tauri build` writes info/warning lines to stderr which PowerShell treats as terminating errors. Fix with `$ErrorActionPreference = "Continue"` or `2>&1` redirection around the build command.
- The robocopy approach (copy from WSL to `%USERPROFILE%\tauri-build\claude-usage`) is already in place to avoid WSL symlink issues.
- Need to verify: WiX toolset is available, signing config (if any), icon embedding works with the multi-resolution .ico.
- Built MSI should be copied back to the WSL source directory.

### Acceptance criteria
- `setup-windows.ps1` runs to completion without errors
- MSI installer is produced in `tauri-app/src-tauri/target/release/bundle/msi/`
- MSI is copied back to WSL source directory
- Installing the MSI on Windows creates a working app with tray icon
