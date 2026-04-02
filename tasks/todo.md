# Phase 7: Expert Review Fixes

## Critical
- [ ] Fix polling handle leak (`state.rs`)
- [ ] Fix GraphQL injection (`GitHubService.swift`)

## High
- [ ] Reuse reqwest::Client (`api.rs`)
- [ ] Surface GitHub errors (`GitHubViewModel.swift`)
- [ ] Remove eval() for opacity (`commands.rs`)
- [ ] Fix blocking_lock in setup (`lib.rs`)
- [ ] Extract restart-polling helper (`commands.rs`)

## Medium
- [ ] Thread-safe KeychainService cache
- [ ] Add test coverage
- [ ] Document stability thresholds (`state.rs`)
- [ ] Log corrupted config (`config.rs`)
- [ ] Escape HTML in main.ts

## Low
- [ ] Slim tokio features
- [ ] Account delete confirmation
- [ ] Rename email → name in AccountMetadata
- [ ] Fix menu bar text spacing
- [ ] Align keyring service name

## Spec conformance
- [ ] Auto-prompt re-auth on 401/403
- [ ] Network error backoff

---

## Next Step Plan: Phase 7 Step 1 — Fix Critical Issues

### What needs to be done
Fix the 2 Critical severity bugs: polling handle leak and GraphQL injection.

### Fix 1: Polling handle leak (`tauri-app/src-tauri/src/state.rs`)

**Problem:** `start_polling()` (line 331) spawns a task via `tauri::async_runtime::spawn` but never stores the returned `JoinHandle` in `AppState.polling_handle`. So `stop_polling()` (line 55-59) always finds `None` and does nothing. After account switches, multiple polling tasks run concurrently.

**Changes:**
1. **`state.rs`** — Modify `start_polling()` to accept `&Arc<Mutex<AppState>>` and store the `JoinHandle`:
   - After `tauri::async_runtime::spawn(...)`, lock state and set `self.polling_handle = Some(handle)`
   - Alternative: have `start_polling` return the handle, and have callers store it
   - Best approach: lock state briefly at start to call `stop_polling()` on any existing handle, then spawn and store the new handle

2. **`commands.rs`** — In `remove_account` (line 130-133), add `s.stop_polling()` before `drop(s)` (already done in `set_active_account` and `save_credentials`). Extract a helper:
   ```rust
   fn restart_polling(app: AppHandle, state: &State<'_, SharedState>) {
       let state_arc = state.inner().clone();
       state::start_polling(app, state_arc);
   }
   ```

### Fix 2: GraphQL injection (`ClaudeUsage/Services/GitHubService.swift`)

**Problem:** `username` is interpolated into GraphQL query string (line 28-44). A username with `"` breaks the query or injects arbitrary GraphQL.

**Changes:**
1. **`GitHubService.swift`** — Rewrite `fetchContributions()` to use GraphQL variables:
   ```swift
   let query = """
   query($login: String!) {
     user(login: $login) {
       contributionsCollection {
         contributionCalendar {
           totalContributions
           weeks { contributionDays { date contributionCount } }
         }
       }
     }
   }
   """
   let body: [String: Any] = [
       "query": query,
       "variables": ["login": username]
   ]
   ```

### Files affected
- `tauri-app/src-tauri/src/state.rs` — store JoinHandle, stop before start
- `tauri-app/src-tauri/src/commands.rs` — extract helper, add stop_polling to remove_account
- `ClaudeUsage/Services/GitHubService.swift` — use GraphQL variables

### Acceptance criteria
- `stop_polling()` actually aborts the running polling task
- Only one polling task runs at a time after account switches
- GraphQL query uses variables, not string interpolation
- `cargo check` passes (Tauri)
- Existing tests pass
