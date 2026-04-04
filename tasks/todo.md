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

## Next Step Plan: Phase 7 Step 5 — Add Test Coverage (macOS)

### What needs to be done
Add unit tests for the 4 untested areas flagged by expert review: pace ratio edge cases, history compaction, account migration, and GraphQL query construction. Currently 12 tests exist (10 Swift, 2 Rust) covering only API decoding and request construction.

### Files affected
- `ClaudeUsageTests/ClaudeUsageTests.swift` — add new test classes (or create separate files if cleaner)
- No production code changes expected

### Test Group 1: Pace Ratio & Status (~6 tests)

**Source:** `ClaudeUsage/Models/UsageViewModel.swift` lines 458-537

The pace logic lives on `UsageViewModel` which requires `@Published` state. To test without standing up the full ViewModel, extract the pure computation into a static/free function or test via ViewModel with mock data.

**Key tests:**
- `testPaceRatioReturnsNilBeforeStabilityGuard` — elapsed < 6h AND remaining < 1h → returns nil (weekly), elapsed < 15min AND remaining < 5min → returns nil (session)
- `testPaceRatioAtBoundaryThresholds` — ratio at exactly 0.6, 0.85, 1.15, 1.4 → correct PaceStatus
- `testPaceStatusLimitHit` — utilization >= 100 → `.limitHit` regardless of ratio
- `testSessionPaceStatusFallback` — before stability window, uses raw utilization (>=80 critical, >=60 warning)
- `testPaceRatioDivisionByZero` — expected=0 (t=0 or window fully elapsed) → guard returns nil
- `testPaceStatusBehindPaceOnlyInPaceAwareMode` — `.behindPace`/`.wayBehind` only when pace-aware enabled

**Approach:** Set `usageData` on ViewModel directly, mock the `fiveHour` window timing via a helper that sets `resetsAt` to control elapsed/remaining time. The `paceRatio` method takes `windowSeconds` and reads `resetsAt` from usage data.

### Test Group 2: History Compaction (~4 tests)

**Source:** `ClaudeUsage/Services/HistoryStore.swift` lines 57-94

`compact(_:)` is a static-like method on `HistoryStore`. Create `UsageSnapshot` arrays with controlled timestamps.

**Key tests:**
- `testCompactKeepsRecentSnapshots` — snapshots < 24h old kept as-is
- `testCompactDownsamplesMidRange` — snapshots 24h–7d old → 1 per hour bucket, highest `sessionUtilization` wins
- `testCompactDeletesOldSnapshots` — snapshots > 7d old removed entirely
- `testCompactBoundaryAt24Hours` — snapshot at exactly 24h boundary → in midRange bucket (not recent)

### Test Group 3: Account Migration (~3 tests)

**Source:** `ClaudeUsage/Services/AccountStore.swift` lines 135-164

`migrateIfNeeded()` reads from Keychain and UserDefaults. Tests need to mock or use test-scoped storage.

**Key tests:**
- `testMigrationSkippedWhenAccountsExist` — non-empty accounts array → no migration
- `testMigrationRunsWithOldCredentials` — empty accounts + old sessionKey in Keychain → creates account, migrates credentials
- `testMigrationIdempotent` — after migration, calling again is a no-op (accounts now non-empty)

**Note:** These tests touch Keychain which may require entitlements or mocking. If Keychain access fails in test runner, use a protocol abstraction or skip with `XCTSkipIf`.

### Test Group 4: GraphQL Query Safety (~2 tests)

**Source:** `ClaudeUsage/Services/GitHubService.swift` lines 20-77

**Key tests:**
- `testGraphQLQueryUsesVariables` — verify the request body contains `"variables": {"login": username}` and the query string uses `$login` parameter (not interpolated username)
- `testGraphQLErrorResponse` — mock response with `errors` array → throws `.invalidResponse`

**Approach:** Use same `MockURLProtocol` pattern from existing `UsageServiceTests`. Intercept the request, inspect JSON body for variable parameterization.

### Implementation order
1. Start with History Compaction (pure data, no mocking needed)
2. Then GraphQL Safety (reuses existing MockURLProtocol)
3. Then Pace Ratio (needs ViewModel setup but no I/O)
4. Finally Account Migration (most complex setup, may need Keychain mock)

### Acceptance criteria
- All new tests pass via `xcodebuild test -scheme ClaudeUsage` (if on macOS; WSL = manual review)
- At least 12 new test functions covering the 4 areas
- No production code changes required (unless extracting a pure function for testability)
- Tests use descriptive names following existing `testXxx` convention

