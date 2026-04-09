# Phase 2: Codex Passive Adapter

## Tests First
- [x] Step 2.1: [automated] Add failing fixture-based tests for Codex install detection, auth presence detection, passive activity parsing, cooldown detection, and confidence labeling.

  **What:** Write red-phase tests that define the Codex passive adapter's contract before any production code exists. Tests use inline fixture data (JSONL strings, TOML strings, directory stubs) — no live filesystem access.

  **Files to create:**
  - `ClaudeUsageTests/CodexAdapterTests.swift` — new test file with these test classes:

  **CodexDetectionTests** (~4 tests):
  - `testDetectsInstalledWhenConfigExists` — stub `~/.codex/config.toml` exists → `.installed`
  - `testDetectsNotInstalledWhenDirectoryMissing` — no `~/.codex/` → `.notInstalled`
  - `testDetectsAuthPresentWhenAuthJsonExists` — `auth.json` present → `.authPresent`
  - `testDetectsAuthAbsentWhenNoAuthFile` — no `auth.json` and no keychain indicator → `.authAbsent`

  **CodexActivityParsingTests** (~5 tests):
  - `testParsesHistoryJsonlEntries` — fixture JSONL with 3 entries → 3 parsed activity events with timestamps
  - `testParsesSessionRolloutFiles` — fixture JSONL session data → activity events with duration
  - `testIncrementalParseResumeFromBookmark` — parse with byte offset bookmark → only new entries returned
  - `testHandlesEmptyOrCorruptedLines` — JSONL with blank/malformed lines → skips gracefully, parses valid ones
  - `testParsesTimestampsIntoActivityWindows` — events mapped into 5-hour rolling windows

  **CodexCooldownTests** (~3 tests):
  - `testDetectsRateLimitFromLogEntry` — log line with "rate limit" or "usage limit" → cooldown detected
  - `testDetectsCooldownFromRecentLimitHit` — recent limit-hit event → `cooldownActive: true`
  - `testNoCooldownWhenNoRecentLimitEvents` — no recent limit events → `cooldownActive: false`

  **CodexConfidenceTests** (~3 tests):
  - `testObservedOnlyWhenAuthDetectedButNoActivity` — auth present, no history → `.observedOnly`
  - `testEstimatedWhenPlanProfilePlusPassiveActivity` — plan set + activity parsed → `.estimated`
  - `testHighConfidenceWhenRepeatedResetPatternsObserved` — multiple window resets detected → `.highConfidence`

  **Files to modify:**
  - `ClauseUsage.xcodeproj/project.pbxproj` — add `CodexAdapterTests.swift` to test target

  **Acceptance criteria:**
  - `xcodebuild build` compiles (tests reference types that don't exist yet → build fails with missing-type errors)
  - Tests define the contract for: `CodexDetector`, `CodexActivityParser`, `CodexCooldownDetector`, `CodexConfidence`, `CodexPlanProfile`

## Implementation
- [x] Step 2.2: [automated] Implement Codex install/auth detection service.

  **What:** Create `CodexDetector` to make the 4 `CodexDetectionTests` pass. The tests use `CodexDetector(codexHome:fileManager:)` with temp directories and check `.installStatus` (`.installed`/`.notInstalled`) and `.authStatus` (`.authPresent`/`.authAbsent`).

  **Files to create:**
  - `ClaudeUsage/Services/CodexDetector.swift`:
    ```
    enum CodexInstallStatus: Equatable { case installed, notInstalled }
    enum CodexAuthStatus: Equatable { case authPresent, authAbsent }
    struct CodexDetectionResult {
        let installStatus: CodexInstallStatus
        let authStatus: CodexAuthStatus
    }
    class CodexDetector {
        let codexHome: URL
        let fileManager: FileManager
        init(codexHome: URL, fileManager: FileManager = .default)
        func detect() -> CodexDetectionResult
    }
    ```
    - `detect()` logic: check `codexHome` dir exists → if not, `.notInstalled` + `.authAbsent`; check `config.toml` exists → `.installed`/`.notInstalled`; check `auth.json` exists → `.authPresent`/`.authAbsent`
    - Default `codexHome` in production: `~/.codex` (or `CODEX_HOME` env var)

  **Files to modify:**
  - `ClaudeUsage.xcodeproj/project.pbxproj` — add `CodexDetector.swift` to Services group (AA600007) and app Sources build phase (AA800001). Use IDs: AA100029 (file ref), AA000026 (build file).

  **Test contract (from CodexDetectionTests):**
  - `testDetectsInstalledWhenConfigExists`: temp dir with `config.toml` → `.installed`
  - `testDetectsNotInstalledWhenDirectoryMissing`: nonexistent dir → `.notInstalled`
  - `testDetectsAuthPresentWhenAuthJsonExists`: temp dir with `auth.json` → `.authPresent`
  - `testDetectsAuthAbsentWhenNoAuthFile`: temp dir without `auth.json` → `.authAbsent`

  **Acceptance criteria:**
  - All 4 `CodexDetectionTests` pass
  - All 21 existing tests still pass
  - `xcodebuild build` compiles cleanly
  - Remaining 11 Codex tests still fail (expected — types not yet created)

- [ ] Step 2.3: [automated] Implement incremental JSONL parser for Codex history and session files.

  **What:** Build a parser that reads `history.jsonl` and `sessions/YYYY/MM/DD/rollout-*.jsonl` incrementally using byte-offset bookmarks. Returns structured activity events with timestamps. Handles corrupt/incomplete lines gracefully.

  **Files to create:**
  - `ClaudeUsage/Services/CodexActivityParser.swift` — new service:
    - `struct CodexActivityEvent { let timestamp: Date; let type: ActivityEventType; let durationSeconds: Double? }`
    - `enum ActivityEventType { case command, session, limitHit, reset }`
    - `struct ParseBookmark { let filePath: String; let byteOffset: UInt64 }` — for incremental reads
    - `class CodexActivityParser`:
      - `init(codexHome: URL, fileManager: FileManager = .default)`
      - `func parseHistory(from bookmark: ParseBookmark?) -> (events: [CodexActivityEvent], bookmark: ParseBookmark)` — reads `history.jsonl` from bookmark offset, returns new events + updated bookmark
      - `func parseSessionFiles(since: Date) -> [CodexActivityEvent]` — scans `sessions/YYYY/MM/DD/rollout-*.jsonl` for files modified after `since`
      - `func detectCooldownEvents(from events: [CodexActivityEvent], within window: TimeInterval) -> Bool` — checks for rate-limit/lockout events within the window

  **Key decisions:**
  - JSONL parsing: read line-by-line from byte offset using `FileHandle.seek(toFileOffset:)`
  - Skip malformed lines (log warning, continue) — Codex may write partial lines
  - Session files: glob `sessions/` directory for `rollout-*.jsonl`, filter by modification date
  - Bookmark stored in memory (not persisted yet — persistence comes when wired into polling)

  **Files to modify:**
  - `ClaudeUsage.xcodeproj/project.pbxproj` — add to Services group

- [ ] Step 2.4: [automated] Add Codex plan profiles, confidence rules, and headroom estimation.

  **What:** Define Codex plan profiles with known window sizes and rough limits. Implement confidence scoring based on available signals. Calculate estimated headroom from plan profile + observed activity count.

  **Files to create:**
  - `ClaudeUsage/Models/CodexTypes.swift` — new model file:
    - `enum CodexPlan: String, CaseIterable { case plus, pro, business, edu, enterprise }`
    - `struct CodexPlanProfile`:
      - `let plan: CodexPlan`
      - `let fiveHourRange: ClosedRange<Int>` — e.g., 45...225 for Plus
      - `let weeklyCloudTasks: ClosedRange<Int>?`
      - Static factory: `CodexPlanProfile.plus`, `.pro`, `.business`
    - `enum CodexConfidence: String { case exact, highConfidence, estimated, observedOnly }`
    - `struct CodexEstimate`:
      - `let confidence: CodexConfidence`
      - `let confidenceExplanation: String`
      - `let observedActivityCount: Int`
      - `let estimatedHeadroomBand: String` — e.g., "~120–180 remaining"
      - `let cooldownActive: Bool`
      - `let windowResetEstimate: Date?`
    - `class CodexConfidenceEngine`:
      - `func evaluate(detection: CodexDetectionResult, events: [CodexActivityEvent], plan: CodexPlanProfile?, recentResets: Int) -> CodexEstimate`
      - Logic: no activity → `.observedOnly`; plan + activity → `.estimated`; repeated resets → `.highConfidence`

  **Files to modify:**
  - `ClaudeUsage.xcodeproj/project.pbxproj` — add to Models group

  **Key decisions:**
  - Plan ranges sourced from OpenAI's published rate card (researched in planning)
  - Headroom is always a band ("~X–Y remaining"), never a single number, because plan ranges are wide
  - Confidence engine is pure logic (no I/O) — easy to unit test

- [ ] Step 2.5: [automated] Wire Codex adapter into ProviderShellViewModel and render Codex-specific card.

  **What:** Create a `CodexAdapter` that ties detection, parsing, confidence, and plan profile together. Wire it into `ProviderShellViewModel` so Codex shows real state instead of the hardcoded `.missingConfiguration`. Update `ProviderCardView` and `SettingsView` for Codex-specific display.

  **Files to create:**
  - `ClaudeUsage/Services/CodexAdapter.swift` — orchestrates the Codex pipeline:
    - `class CodexAdapter: ObservableObject`:
      - `@Published var state: CodexAdapterState` — wraps detection + estimate
      - `let detector: CodexDetector`
      - `let parser: CodexActivityParser`
      - `let confidenceEngine: CodexConfidenceEngine`
      - `var planProfile: CodexPlanProfile?` — user-confirmed plan
      - `func refresh()` — runs detect → parse → evaluate → publish state
      - `func toProviderSnapshot() -> ProviderSnapshot` — maps adapter state to the provider shell's snapshot type

  **Files to modify:**
  - `ClaudeUsage/Models/ProviderTypes.swift` — extend `ProviderSnapshot` with a new case for Codex rich state:
    - Add `.codexRich(estimate: CodexEstimate, isEnabled: Bool)` case alongside existing `.codex(status:isEnabled:)`
    - Add static factory: `.codex(estimate:isEnabled:)` → `.codexRich(...)`
    - Update `id` and `isEnabled` computed properties for the new case
  - `ClaudeUsage/Models/ProviderTypes.swift` — update `ProviderCoordinator.makeShellState` to handle `.codexRich`:
    - Map to `ProviderCard` with confidence-aware headline (e.g., "Codex Est. ~120–180 left")
    - Show `confidenceExplanation` as `detailText`
  - `ClaudeUsage/Models/ProviderShellViewModel.swift`:
    - Add `private let codexAdapter: CodexAdapter` property
    - Init creates `CodexAdapter` with default `CodexDetector` and `CodexActivityParser`
    - Subscribe to `codexAdapter.$state` alongside existing publishers
    - In `rebuildShellState`, use `codexAdapter.toProviderSnapshot()` instead of hardcoded `.codex(status: .missingConfiguration, ...)`
  - `ClaudeUsage/Views/ProviderCardView.swift` — handle Codex-specific display:
    - Show confidence badge (color-coded: green=exact/high, yellow=estimated, gray=observedOnly)
    - Show headroom band text
    - Show cooldown indicator if active
  - `ClaudeUsage/Views/SettingsView.swift` — update Codex row in Providers section:
    - Replace "Coming in Phase 2" with actual detection status
    - Add plan picker (Plus/Pro/Business) when Codex is detected
    - Persist selected plan to UserDefaults via `ProviderSettingsStore`
  - `ClaudeUsage/Models/ProviderSettingsStore.swift` — add Codex plan storage:
    - `func codexPlan() -> CodexPlan?`
    - `func setCodexPlan(_ plan: CodexPlan?)`
    - UserDefaults key: `provider_codex_plan`
  - `ClaudeUsage/ClaudeUsageApp.swift` — pass `CodexAdapter` or let `ProviderShellViewModel` create it internally
  - `ClaudeUsage.xcodeproj/project.pbxproj` — add `CodexAdapter.swift` and `CodexTypes.swift`

  **Key decisions:**
  - `CodexAdapter` is created internally by `ProviderShellViewModel` (not injected from App) to keep the dependency chain simple
  - Codex plan is persisted in `ProviderSettingsStore` (global, not per-account) since Codex has its own auth
  - Refresh cadence: called from `ProviderShellViewModel` on a 15-second timer (spec recommends 15s for passive scans)
  - If Codex is not installed, snapshot stays as `.codex(status: .missingConfiguration, ...)` — no adapter noise

## Green
- [ ] Step 2.6: [automated] Make all Codex passive tests pass, run existing tests, verify no regressions.

  **What:** Ensure all CodexAdapterTests pass. Run the full test suite (should be 21 existing + ~15 new Codex tests ≈ 36 total). Verify Codex never claims exact remaining quota without a defensible source. Fix any compilation or logic issues.

  **Acceptance criteria:**
  - All CodexAdapterTests pass
  - All 21 existing tests still pass
  - `xcodebuild build` compiles cleanly
  - No changes to `UsageViewModel`, `UsageService`, or Claude networking code

## Milestone
- [ ] Codex can be detected and configured as a monitored provider.
- [ ] Codex passive monitoring shows observed local activity, estimate/headroom guidance, and explicit confidence.
- [ ] Unknown or degraded Codex states remain visible and explained.
- [ ] Claude behavior remains unchanged while Codex is enabled.
- [ ] All Phase 2 tests pass.
- [ ] No regressions in previous phase tests.
