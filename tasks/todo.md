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

## Next Step Plan: Phase 7 Step 6 — Fix Low-Priority Items (Batch)

All 5 Low items are small, independent changes. Batch them in one step.

### Item 1: Slim tokio features
**File:** `tauri-app/src-tauri/Cargo.toml`
**Change:** Replace `tokio = { version = "1", features = ["full"] }` with only the features actually used. Grep the Rust source for tokio usage (likely `rt-multi-thread`, `macros`, `time`, `sync`). Run `cargo check` after to verify nothing breaks.

### Item 2: Account delete confirmation (macOS)
**File:** `ClaudeUsage/Views/SettingsView.swift` (around line 249)
**Change:** Wrap the existing account delete action in a `.confirmationDialog` or `.alert` modifier. Show "Delete account '{name}'?" with Cancel/Delete buttons. Only call `accountStore.remove(id:)` on confirmation.

### Item 3: Rename email → name in AccountMetadata
**Files:**
- `tauri-app/src-tauri/src/models.rs` — rename `email` field to `name` in `AccountMetadata` struct
- `tauri-app/src-tauri/src/commands.rs` — update all references to `.email` → `.name`
- `tauri-app/src-tauri/src/config.rs` — update if referenced
- `tauri-app/src/types.ts` — update TypeScript interface
- `tauri-app/src/settings.ts` — update UI references
- `tauri-app/src/components/account-picker.ts` — update display
**Note:** Must handle backwards compatibility — existing config files on disk use `"email"`. Add `#[serde(alias = "email")]` to the `name` field so old configs still deserialize.

### Item 4: Fix menu bar text spacing (Tauri)
**File:** `tauri-app/src-tauri/src/state.rs` (around line 193)
**Change:** The format string uses `%W` which reads like a format specifier. Change to `% W` or use a different separator (e.g., `| W:` or ` · W:`). Grep for the exact format string to find the right location.

### Item 5: Align keyring service name (Tauri)
**File:** `tauri-app/src-tauri/src/credentials.rs` (line 3)
**Change:** The keyring service name is `com.claudeusage.credentials` but the app identifier is `com.claudeusage.desktop`. Align to use the app identifier. **Migration:** Read old credentials under old service name and re-save under new name on first access, then delete old entries. Or — simpler — just change the constant if no one has existing credentials stored (this is still pre-release).

### Implementation order
1. Slim tokio features (Cargo.toml only, quick `cargo check`)
2. Fix menu bar text spacing (1-line change)
3. Align keyring service name (1-line change, pre-release so no migration needed)
4. Rename email → name (multi-file, needs serde alias)
5. Account delete confirmation (SwiftUI, standalone)

### Acceptance criteria
- `cargo check` passes after tokio feature slimming
- `cargo clippy` has no new warnings
- Account delete shows confirmation dialog before removing
- Old config files with `"email"` field still deserialize correctly after rename
- Menu bar text no longer shows `%W` pattern
