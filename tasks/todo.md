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

## Next Step Plan: Phase 7 Step 3 — Fix Medium-Priority Issues (Batch 1)

### What needs to be done
Fix 3 of the 5 Medium items: document stability thresholds, log corrupted config, and escape HTML. These are small, isolated changes. Thread-safe KeychainService cache and test coverage are larger efforts saved for a separate step.

### Fix 1: Document stability thresholds (`state.rs`)

**File:** `tauri-app/src-tauri/src/state.rs`

Add doc comments explaining the rationale for each magic number:

1. **Line 244-246** (`pace_ratio`): Add comment before the guard:
   ```rust
   // Skip pace calculation during the first 6 hours (too little data for a stable ratio)
   // and the last hour (remaining time too small, ratio becomes hypersensitive).
   ```

2. **Lines 258-259** (`weekly_pace_indicator`): Add comment:
   ```rust
   // ±15% threshold: tighter than this triggers too many false pace changes,
   // wider misses meaningful trends within a 7-day window.
   ```

3. **Lines 284-288** (`weekly_budget_per_day`): Same stability guard as pace_ratio — add:
   ```rust
   // Same stability guard as pace_ratio: need ≥6h of data and ≥1h remaining.
   ```

4. **Lines 320-327** (`tray_color_for_utilization`): Add doc comment:
   ```rust
   /// Tray icon color based on session utilization percentage.
   /// - ≥80%: red (near limit)
   /// - ≥50%: yellow (moderate usage)
   /// - <50%: green (plenty of headroom)
   ```

### Fix 2: Log corrupted config (`config.rs`)

**File:** `tauri-app/src-tauri/src/config.rs`

1. Add `use log::warn;` at top
2. In `load_config()` (lines 46-56), replace silent fallbacks with logged warnings:
   - Line 50: `serde_json::from_str(&content).unwrap_or_default()` → match on the result, `warn!("Config file corrupted, using defaults: {}", e)` on Err
   - Line 51: `Err(_) => AppConfig::default()` → `Err(e) => { warn!("Failed to read config file: {}", e); AppConfig::default() }`

### Fix 3: Escape HTML in usage-bar.ts and main.ts

**File:** `tauri-app/src/components/usage-bar.ts` (lines 12, 15, 18, 20, 21)

All `limit.*` fields come from the Rust API (not user input), but defense-in-depth requires escaping since values could be manipulated by a compromised API response.

1. Create `tauri-app/src/utils/escape.ts` with the `escapeHtml` function (currently duplicated in `settings.ts` at line 298)
2. Import `escapeHtml` in `usage-bar.ts`
3. Escape these interpolations:
   - `${limit.name}` → `${escapeHtml(limit.name)}`
   - `${limit.reset_time_display}` → `${escapeHtml(limit.reset_time_display)}`
   - `${limit.pace_detail}` → `${escapeHtml(limit.pace_detail)}`
   - `${color}` is computed from `getColor()` which returns hardcoded strings — safe, no escaping needed
4. Update `settings.ts` to import from the shared utility instead of its local copy

### Files affected
- `tauri-app/src-tauri/src/state.rs` — add doc comments for magic numbers
- `tauri-app/src-tauri/src/config.rs` — add log::warn for corrupted config
- `tauri-app/src/components/usage-bar.ts` — escape HTML in template literals
- `tauri-app/src/utils/escape.ts` — new shared escapeHtml utility
- `tauri-app/src/settings.ts` — import escapeHtml from shared utility

### Acceptance criteria
- All magic numbers in state.rs have explaining comments
- Corrupted config logs a warning (not silent)
- All dynamic string interpolations in usage-bar.ts are escaped
- escapeHtml is a shared utility, not duplicated
- `npm run build` passes (TypeScript)
- `cargo check` passes (if OpenSSL available)

