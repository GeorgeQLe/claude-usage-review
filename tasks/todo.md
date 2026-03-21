# Phase 6: Polish

- [x] Tauri capabilities/permissions for IPC commands
- [x] Icon: proper .ico file for Windows (multi-resolution)
- [x] DPI awareness: popover positioning relative to tray
- [x] Autostart verification on Windows
- [ ] Error handling edge cases: empty states, Set-Cookie refresh in UI
- [ ] `cargo tauri build` producing working MSI installer (setup-windows.ps1 updated with robocopy approach)
- [ ] Fix PowerShell NativeCommandError during build — `npx tauri build` writes info/warning lines to stderr, which PowerShell treats as errors (red text + RemoteException). Need to suppress with `$ErrorActionPreference = "Continue"` or `2>&1` redirection around the build step.
- [ ] End-to-end test on Windows

---

## Next Step Plan: Phase 6 — Error Handling Edge Cases

### What needs to be done
Improve error handling for edge cases: empty states when no usage data is available, and Set-Cookie session key refresh reflected in the UI.

### Files to check/modify
- **`tauri-app/src/main.ts`** — handle empty/null usage data gracefully in the popover (no accounts, no limits, API errors)
- **`tauri-app/src-tauri/src/api.rs`** — ensure Set-Cookie rotation updates stored credentials and emits an event so the frontend can reflect the refreshed state
- **`tauri-app/src-tauri/src/state.rs`** — emit auth status changes when Set-Cookie is processed
- **`tauri-app/src/settings.ts`** — show auth status updates when session key is refreshed via Set-Cookie

### Technical details
- The Rust `api.rs` already parses `Set-Cookie` and stores the new session key via `credentials.rs`. Need to verify the credential update propagates to `state.rs` and triggers a tray/UI update.
- Empty states to handle: no accounts configured (show "Add an account" CTA), account with no org ID, API returning empty limits array, network errors (offline/timeout).
- The popover (`main.ts`) should show meaningful messages instead of blank content or broken bars when data is missing.
- Auth status dot in settings should update if the session key was silently rotated by Set-Cookie.

### Acceptance criteria
- Popover shows helpful empty state when no accounts or no usage data
- Network errors show a retry-able error banner (not a blank screen)
- Set-Cookie rotation updates stored credentials without user action
- Auth status in settings reflects the current credential state
- No JavaScript errors in console for any empty/null data paths
