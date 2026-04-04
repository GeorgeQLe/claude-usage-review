# Phase 7: Expert Review Fixes

## Critical
- [x] Fix polling handle leak (`state.rs`)
- [x] Fix GraphQL injection (`GitHubService.swift`)

## High
- [x] Reuse reqwest::Client (`api.rs`)
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

## Next Step Plan: Phase 7 Step 2 — Fix Remaining High-Priority Issues

### What needs to be done
Fix the 4 remaining High severity items from the expert review.

### Fix 1: Surface GitHub errors (`GitHubViewModel.swift`)

**File:** `ClaudeUsage/Models/GitHubViewModel.swift` (lines 66-68)

**Problem:** The `catch` block silently swallows all GitHub API errors (`// Silently fail — keep existing data`). Users get no feedback when the GitHub heatmap fails to load.

**Changes:**
1. Add `@Published var errorMessage: String? = nil` property
2. In the `catch` block, set `self.errorMessage = error.localizedDescription`
3. Clear `self.errorMessage = nil` before each fetch attempt (line 63, before `do`)
4. The UI can then conditionally display the error — but that's a separate Medium item (test coverage / UI polish). For now, surfacing the state is sufficient.

### Fix 2: Remove eval() for opacity (`commands.rs`)

**File:** `tauri-app/src-tauri/src/commands.rs` (line ~288)

**Problem:** `window.eval(&format!("document.body.style.opacity = '{}'", opacity))` uses JavaScript eval to set opacity — a security anti-pattern.

**Changes:**
1. Replace `window.eval(...)` with Tauri's `window.set_alpha(opacity)` API (available in Tauri 2.x via `WebviewWindow::set_alpha`)
2. If `set_alpha` is not available in this Tauri version, use `window.emit("set-opacity", opacity)` and handle it in the frontend JS with an event listener (safer than eval)
3. Validate `opacity` is in `0.0..=1.0` range before applying

### Fix 3: Fix blocking_lock in setup (`lib.rs`)

**File:** `tauri-app/src-tauri/src/lib.rs` (lines 223-226)

**Problem:** `state.blocking_lock()` is called during Tauri `setup()`, which runs in an async context. This blocks the async executor thread.

**Changes:**
1. Replace `blocking_lock()` with `try_lock()`
2. If the lock fails (shouldn't during setup since nothing else is running yet), skip overlay creation and log a warning
3. Alternative: since setup runs before any async tasks, `try_lock()` should always succeed — the real fix is defensive correctness

### Fix 4: Extract restart-polling helper (`commands.rs`)

**File:** `tauri-app/src-tauri/src/commands.rs` (lines ~131, ~168, ~192)

**Problem:** The pattern `drop(s); state::start_polling(app, state.inner().clone());` appears 3 times.

**Changes:**
1. Add helper function:
   ```rust
   fn restart_polling(app: &AppHandle, state: &State<'_, SharedState>) {
       state::start_polling(app.clone(), state.inner().clone());
   }
   ```
2. Replace all 3 occurrences with `restart_polling(&app, &state);`
3. Ensure the lock (`s`) is dropped before calling the helper (either by scoping or explicit `drop(s)`)

### Files affected
- `ClaudeUsage/Models/GitHubViewModel.swift` — add error state, surface errors
- `tauri-app/src-tauri/src/commands.rs` — remove eval(), extract restart helper
- `tauri-app/src-tauri/src/lib.rs` — replace blocking_lock with try_lock

### Acceptance criteria
- GitHubViewModel exposes `errorMessage` when API calls fail
- No `eval()` calls remain in commands.rs
- No `blocking_lock()` calls remain in lib.rs setup
- Restart-polling pattern is DRY (single helper, 3 call sites)
- `cargo check` passes (Tauri, if OpenSSL available)
- Existing tests pass
