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
- [ ] Add test coverage
- [x] Document stability thresholds (`state.rs`)
- [x] Log corrupted config (`config.rs`)
- [x] Escape HTML in usage-bar.ts

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

## Next Step Plan: Phase 7 Step 4 — Thread-Safe KeychainService Cache (macOS)

### What needs to be done
Make the static `cache` dictionary in `KeychainService.swift` thread-safe. Currently it's an unprotected `static var` that can be accessed concurrently from the UI thread (credential reads) and background polling thread (session key refresh), causing potential data races.

### Fix: Add serial DispatchQueue guard

**File:** `ClaudeUsage/Services/KeychainService.swift`

1. Add a private static serial queue:
   ```swift
   private static let cacheQueue = DispatchQueue(label: "com.claudeusage.keychain-cache")
   ```

2. Wrap every read from `cache` in `cacheQueue.sync { ... }`:
   - Line ~45-48: `if let cached = cache[key]` guard in `getSessionKey`
   - Line ~132-134: `if let cached = cache[key]` guard in account-scoped read

3. Wrap every write to `cache` in `cacheQueue.sync { ... }`:
   - Line ~19: `cache[key] = value` in save
   - Line ~73: `cache[key] = value` after successful keychain read
   - Line ~106: `cache[key] = value` in account-scoped save
   - Line ~158: `cache[key] = value` in account-scoped read

4. Wrap cache removal in `cacheQueue.sync { ... }`:
   - Any `cache.removeValue(forKey:)` calls in delete methods

### Files affected
- `ClaudeUsage/Services/KeychainService.swift` — add DispatchQueue, wrap cache access

### Acceptance criteria
- All `cache` dictionary reads/writes are protected by serial queue
- No direct `cache` access outside of `cacheQueue.sync { }` blocks
- `xcodebuild -scheme ClaudeUsage build` passes (if on macOS)
- Grep confirms no unguarded `cache[` or `cache.` outside queue blocks

