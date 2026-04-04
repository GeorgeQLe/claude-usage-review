# Phase 7: Expert Review Fixes

## Critical
- [x] Fix polling handle leak (`state.rs`)
- [x] Fix GraphQL injection (`GitHubService.swift`)

## High
- [x] Reuse reqwest::Client (`api.rs`)
- [x] Surface GitHub errors (`GitHubViewModel.swift`)
- [x] Sanitize eval() opacity input (`commands.rs`)
- [x] Fix blocking_lock in setup (`lib.rs`)
- [x] Extract restart-polling helper (`commands.rs`)

## Medium
- [x] Thread-safe KeychainService cache
- [x] Add test coverage
- [x] Document stability thresholds (`state.rs`)
- [x] Log corrupted config (`config.rs`)
- [x] Escape HTML in usage-bar.ts

## Low
- [x] Slim tokio features
- [x] Account delete confirmation
- [x] Rename email → name in AccountMetadata
- [x] Fix menu bar text spacing
- [x] Align keyring service name

## Spec conformance
- [ ] Auto-prompt re-auth on 401/403
- [ ] Network error backoff

---

## Next Step Plan: Phase 7 Step 7 — Spec Conformance (2 items)

Two spec conformance gaps remain. Both affect only the Tauri app (macOS SwiftUI has the same gaps but is not in scope for this step).

### Item 1: Auto-prompt re-auth on 401/403
**Spec:** "If 401/403 received, show error badge on icon + prompt to re-auth in settings" (SPEC.md Auth Flow §4)
**Current behavior:** On `ApiError::AuthError`, sets `ErrorState::AuthExpired` and shows a banner "Session expired. Update credentials in Settings." — but doesn't open or focus the settings window.
**Files to change:**
- `tauri-app/src-tauri/src/state.rs` (line ~447-453) — in `perform_fetch`'s `AuthError` arm, after setting error state, open/focus the settings window
- This requires passing the `AppHandle` (already available) and using the same logic as `openSettings()` in `main.ts` but from the Rust side via `WebviewWindow::builder` or by emitting an event that the frontend handles

**Approach:** Emit a `"prompt-reauth"` event from Rust. In `main.ts`, listen for it and call `openSettings()`. This keeps the settings window creation logic in one place (TypeScript) rather than duplicating in Rust.

**Changes:**
1. `tauri-app/src-tauri/src/state.rs:447-453` — add `let _ = app.emit("prompt-reauth", ());` after setting auth expired state
2. `tauri-app/src/main.ts` — add `listen("prompt-reauth", () => openSettings())` in `init()`

### Item 2: Network error backoff
**Spec:** "Pause on network error, retry with backoff" (SPEC.md Polling Strategy §3)
**Current behavior:** Fixed 300s polling interval regardless of errors.
**Files to change:**
- `tauri-app/src-tauri/src/state.rs` — modify the polling loop (line ~378) to track consecutive errors and increase sleep duration

**Approach:** Add a `consecutive_errors: u32` counter in the polling loop. On network error (not auth error), increment it. On success, reset to 0. Sleep duration = `min(POLLING_INTERVAL_SECS * 2^consecutive_errors, 3600)` (cap at 1 hour). Auth errors don't trigger backoff (they already prompt re-auth).

**Changes:**
1. `tauri-app/src-tauri/src/state.rs` — refactor `perform_fetch` to return a result enum so the caller knows whether to backoff
2. Add backoff calculation before the `tokio::time::sleep` call
3. Same logic for the initial fetch (if it fails with network error, wait with backoff before entering loop)

### Implementation order
1. Auto-prompt re-auth (simpler, emit + listen pattern)
2. Network error backoff (refactor perform_fetch return type, add backoff logic)

### Acceptance criteria
- On 401/403, the settings window opens automatically (or is focused if already open)
- On consecutive network errors, polling interval increases exponentially up to 1 hour
- On successful fetch after errors, interval resets to normal 300s
- Auth errors do NOT trigger backoff (they prompt re-auth instead)
- `npx tsc --noEmit` passes
