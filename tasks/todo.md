# Phase 6: Polish

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
