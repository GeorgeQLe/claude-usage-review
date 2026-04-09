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

- [x] Step 2.3: [automated] Implement incremental JSONL parser for Codex history and session files.

  **What:** Create `CodexActivityParser` and `CodexActivityEvent` to make all 5 `CodexActivityParsingTests` and 1 of 3 `CodexCooldownTests` pass (`testDetectsRateLimitFromLogEntry`). The remaining 2 cooldown tests and all 3 confidence tests need `CodexConfidenceEngine` from step 2.4.

  **Files to create:**
  - `ClaudeUsage/Services/CodexActivityParser.swift`:

  ```swift
  import Foundation

  enum CodexEventType: Equatable {
      case prompt, completion, sessionStart, sessionEnd, limitHit, error
  }

  struct CodexActivityEvent {
      let eventType: CodexEventType
      let timestamp: Date
      let tokens: Int?
      let duration: TimeInterval?
  }

  struct ParseBookmark {
      let byteOffset: UInt64
  }

  struct ActivityWindow {
      let startDate: Date
      let endDate: Date
      let eventCount: Int
  }

  class CodexActivityParser {
      let codexHome: URL

      init(codexHome: URL) { self.codexHome = codexHome }

      // No-bookmark convenience (used by 3 tests)
      func parseHistory() throws -> [CodexActivityEvent]

      // Incremental with bookmark (used by testIncrementalParseResumeFromBookmark)
      func parseHistory(from bookmark: ParseBookmark?) throws -> ([CodexActivityEvent], ParseBookmark?)

      // Session parsing (used by testParsesSessionRolloutFiles)
      func parseSessions() throws -> [CodexActivityEvent]

      // Single log line parsing (used by testDetectsRateLimitFromLogEntry)
      func parseLogLine(_ line: String) -> CodexActivityEvent?

      // Activity windowing (used by testParsesTimestampsIntoActivityWindows)
      func activityWindows(from events: [CodexActivityEvent], windowHours: Int) -> [ActivityWindow]
  }
  ```

  **Test contract (from CodexActivityParsingTests + 1 CodexCooldownTest):**

  1. `testParsesHistoryJsonlEntries`: writes 3 JSONL lines to `history.jsonl` in tempDir, calls `parseHistory()`, asserts `events.count == 3`, `events[0].eventType == .prompt`, `events[1].eventType == .completion`, timestamps non-nil
  2. `testParsesSessionRolloutFiles`: creates `sessions/session-001.jsonl` with session_start/prompt/session_end, calls `parseSessions()`, checks `events.count >= 1`, finds `.sessionEnd` event with non-nil `.duration`
  3. `testIncrementalParseResumeFromBookmark`: writes 2 lines, calls `parseHistory(from: nil)` → 2 events + bookmark, appends 1 line, calls `parseHistory(from: bookmark)` → 1 event
  4. `testHandlesEmptyOrCorruptedLines`: 6 lines (3 valid, 1 not-JSON, 1 empty, 1 malformed JSON), `parseHistory()` → exactly 3 events
  5. `testParsesTimestampsIntoActivityWindows`: 5 events spanning 06:00–10:55Z, calls `activityWindows(from:windowHours: 5)`, checks `windows.first?.eventCount == 5`
  6. `testDetectsRateLimitFromLogEntry`: JSON string with `type: "error"` and `message: "rate limit exceeded..."`, `parseLogLine()` returns event with `.limitHit`

  **Implementation details:**
  - `parseHistory()` no-bookmark: calls `parseHistory(from: nil)` and returns just the events array
  - JSONL parsing: read entire file as String, split by newlines, decode each line as `[String: Any]` via `JSONSerialization`
  - Map `"type"` field: `"prompt"` → `.prompt`, `"completion"` → `.completion`, `"session_start"` → `.sessionStart`, `"session_end"` → `.sessionEnd`, `"error"` → check message for "rate limit"/"usage limit" → `.limitHit`, else `.error`
  - Timestamps: ISO8601 decode the `"timestamp"` field
  - Duration for sessionEnd: compute from session_start timestamp to session_end timestamp within the same file
  - Bookmark: `byteOffset` = byte length of data read; on resume, read from that offset using `FileHandle.seek(toFileOffset:)`
  - Skip blank/malformed lines silently (no crash)
  - `parseSessions()`: enumerate `sessions/` subdir for `.jsonl` files, parse each the same way
  - `activityWindows()`: group events into `windowHours`-length buckets by timestamp, return `[ActivityWindow]`

  **Files to modify:**
  - `ClaudeUsage.xcodeproj/project.pbxproj` — add `CodexActivityParser.swift` to Services group (AA600007) and app Sources build phase (AA800001). Use IDs: AA100031 (file ref), AA000027 (build file).

  **Acceptance criteria:**
  - `xcodebuild build` succeeds
  - 5 CodexActivityParsingTests pass + 1 CodexCooldownTest (`testDetectsRateLimitFromLogEntry`) passes
  - 4 CodexDetectionTests still pass (total: 10 of 15 Codex tests green)
  - Remaining 5 Codex tests still fail (need `CodexConfidenceEngine`, `CodexPlanProfile` from step 2.4)
  - All 21 existing tests pass

- [x] Step 2.4: [automated] Add Codex plan profiles, confidence engine, and cooldown status.

  **What:** Create `CodexTypes.swift` with `CodexPlanProfile`, `CodexConfidence`, `CodexEstimate`, `CooldownStatus`, and `CodexConfidenceEngine`. This makes all 15 Codex tests compile and pass (5 remaining: 3 confidence + 2 cooldown).

  ### CREATE: `ClaudeUsage/Models/CodexTypes.swift`

  **Types needed (derived from test contracts in `CodexAdapterTests.swift:242-320` and `211-239`):**

  ```swift
  struct CodexPlanProfile {
      let name: String
      let dailyTokenLimit: Int
  }
  ```
  Tests construct: `CodexPlanProfile(name: "pro", dailyTokenLimit: 100_000)`

  ```swift
  enum CodexConfidence: Equatable {
      case exact, highConfidence, estimated, observedOnly
  }
  ```

  ```swift
  struct CodexEstimate {
      let confidence: CodexConfidence
  }
  ```
  Tests only check `estimate.confidence` — keep it minimal.

  ```swift
  struct CooldownStatus {
      let cooldownActive: Bool
  }
  ```
  Tests check `cooldown.cooldownActive` (Bool).

  ```swift
  class CodexConfidenceEngine {
      func evaluate(
          detection: CodexDetectionResult,
          events: [CodexActivityEvent],
          plan: CodexPlanProfile?,
          recentResets: Int
      ) -> CodexEstimate

      func cooldownStatus(from events: [CodexActivityEvent]) -> CooldownStatus
  }
  ```

  **`evaluate` logic (from tests):**
  1. `recentResets >= 3` AND plan != nil → `.highConfidence` (test: `testHighConfidenceWhenRepeatedResetPatternsObserved`)
  2. `!events.isEmpty` AND plan != nil → `.estimated` (test: `testEstimatedWhenPlanProfilePlusPassiveActivity`)
  3. else → `.observedOnly` (test: `testObservedOnlyWhenAuthDetectedButNoActivity` — empty events, nil plan)

  **`cooldownStatus` logic (from tests):**
  - Find most recent `.limitHit` event
  - If found and < 5 minutes ago (120s in test is recent) → `cooldownActive: true`
  - If found but ≥ 2 hours old (7200s in test) → `cooldownActive: false`
  - Use ~5 min threshold (300s) — recent test is 120s (active), old test is 7200s (expired)

  ### MODIFY: `ClaudeUsage.xcodeproj/project.pbxproj`
  Add `CodexTypes.swift` to:
  1. PBXFileReference section — `AA100032` file ref
  2. PBXBuildFile section — `AA000028` build file
  3. Models group (AA600006) children list
  4. App Sources build phase (AA800001) files list

  ### Verification
  1. `xcodebuild build` — succeeds
  2. `xcodebuild test` — all 15 Codex tests pass, all 21 existing tests pass (36 total)

  **Acceptance criteria:**
  - All 15 CodexAdapterTests pass (4 detection + 5 parsing + 3 cooldown + 3 confidence)
  - All 21 existing tests still pass
  - `xcodebuild build` compiles cleanly
  - Single new file, minimal types — only what tests require
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

- [x] Step 2.5: [automated] Wire Codex adapter into ProviderShellViewModel and render Codex-specific card.

  **What:** Create a `CodexAdapter` that ties detection, parsing, confidence, and plan profile together. Wire it into `ProviderShellViewModel` so Codex shows real state instead of the hardcoded `.missingConfiguration`. Update `ProviderCardView` and `SettingsView` for Codex-specific display.

  ### CREATE: `ClaudeUsage/Services/CodexAdapter.swift`

  ```swift
  import Foundation
  import Combine

  enum CodexAdapterState {
      case notInstalled
      case installed(estimate: CodexEstimate, cooldown: CooldownStatus)
  }

  class CodexAdapter: ObservableObject {
      @Published var state: CodexAdapterState = .notInstalled

      let detector: CodexDetector
      let parser: CodexActivityParser
      let confidenceEngine: CodexConfidenceEngine
      var planProfile: CodexPlanProfile?

      init(codexHome: URL = URL(fileURLWithPath: NSHomeDirectory()).appendingPathComponent(".codex"),
           planProfile: CodexPlanProfile? = nil) {
          self.detector = CodexDetector(codexHome: codexHome)
          self.parser = CodexActivityParser(codexHome: codexHome)
          self.confidenceEngine = CodexConfidenceEngine()
          self.planProfile = planProfile
      }

      func refresh() {
          let detection = detector.detect()
          guard detection.installStatus == .installed else {
              state = .notInstalled
              return
          }
          let events = (try? parser.parseHistory()) ?? []
          let recentResets = countRecentResets(events)
          let estimate = confidenceEngine.evaluate(
              detection: detection, events: events,
              plan: planProfile, recentResets: recentResets
          )
          let cooldown = confidenceEngine.cooldownStatus(from: events)
          state = .installed(estimate: estimate, cooldown: cooldown)
      }

      func toProviderSnapshot(isEnabled: Bool) -> ProviderSnapshot {
          switch state {
          case .notInstalled:
              return .codex(status: .missingConfiguration, isEnabled: isEnabled)
          case let .installed(estimate, _):
              return .codexRich(estimate: estimate, isEnabled: isEnabled)
          }
      }

      private func countRecentResets(_ events: [CodexActivityEvent]) -> Int {
          // Count limitHit events in the last 24 hours as proxy for resets
          let cutoff = Date().addingTimeInterval(-86400)
          return events.filter { $0.eventType == .limitHit && $0.timestamp > cutoff }.count
      }
  }
  ```

  ### MODIFY: `ClaudeUsage/Models/ProviderTypes.swift`

  **Add `.codexRich` case to `ProviderSnapshot` enum (after line 32):**
  ```swift
  case codexRich(estimate: CodexEstimate, isEnabled: Bool)
  ```

  **Update `id` computed property (around line 47) — add case:**
  ```swift
  case .codexRich: return .codex
  ```

  **Update `isEnabled` computed property (around line 56) — add case:**
  ```swift
  case let .codexRich(_, isEnabled): return isEnabled
  ```

  **Update `ProviderCoordinator.makeShellState` switch (after the existing `.codex` case at line 138):**
  ```swift
  case let .codexRich(estimate, _):
      let headline: String
      switch estimate.confidence {
      case .highConfidence: headline = "Codex — High Confidence"
      case .estimated: headline = "Codex — Estimated"
      case .observedOnly: headline = "Codex — Observed Only"
      case .exact: headline = "Codex — Exact"
      }
      return ProviderCard(
          id: .codex,
          cardState: .configured,
          headline: headline,
          detailText: "Confidence: \(estimate.confidence)",
          sessionUtilization: nil,
          weeklyUtilization: nil
      )
  ```

  ### MODIFY: `ClaudeUsage/Models/ProviderShellViewModel.swift`

  **Add property (after line 9):**
  ```swift
  private let codexAdapter: CodexAdapter
  private var codexTimer: Timer?
  ```

  **In `init` (around line 12) — create adapter internally:**
  ```swift
  let plan = settingsStore.codexPlan()
  self.codexAdapter = CodexAdapter(planProfile: plan)
  ```

  **In `init` — subscribe to codexAdapter.$state (after line 24):**
  ```swift
  codexAdapter.$state
      .sink { [weak self] _ in self?.rebuildShellState() }
      .store(in: &cancellables)
  codexAdapter.refresh()
  codexTimer = Timer.scheduledTimer(withTimeInterval: 15, repeats: true) { [weak self] _ in
      self?.codexAdapter.refresh()
  }
  ```

  **In `rebuildShellState` — replace line 81:**
  Replace:
  ```swift
  snapshots.append(.codex(status: .missingConfiguration, isEnabled: settingsStore.isEnabled(.codex)))
  ```
  With:
  ```swift
  snapshots.append(codexAdapter.toProviderSnapshot(isEnabled: settingsStore.isEnabled(.codex)))
  ```

  ### MODIFY: `ClaudeUsage/Models/ProviderSettingsStore.swift`

  **Add Codex plan storage (after `setEnabled` method, ~line 38):**
  ```swift
  func codexPlan() -> CodexPlanProfile? {
      guard let name = UserDefaults.standard.string(forKey: "provider_codex_plan"),
            let limit = UserDefaults.standard.object(forKey: "provider_codex_plan_limit") as? Int else {
          return nil
      }
      return CodexPlanProfile(name: name, dailyTokenLimit: limit)
  }

  func setCodexPlan(_ plan: CodexPlanProfile?) {
      if let plan = plan {
          UserDefaults.standard.set(plan.name, forKey: "provider_codex_plan")
          UserDefaults.standard.set(plan.dailyTokenLimit, forKey: "provider_codex_plan_limit")
      } else {
          UserDefaults.standard.removeObject(forKey: "provider_codex_plan")
          UserDefaults.standard.removeObject(forKey: "provider_codex_plan_limit")
      }
  }
  ```

  ### MODIFY: `ClaudeUsage/Views/SettingsView.swift`

  **Update Codex row (line 230) — replace "Coming in Phase 2":**
  Change the status text from hardcoded to dynamic based on detection. Note: SettingsView does not currently have access to CodexAdapter state, so keep it simple — show "Detected" or "Not Detected" based on whether Codex config exists at `~/.codex/config.toml` via a lightweight check, or pass detection status through ProviderShellViewModel.

  Simplest approach: add a `codexDetected: Bool` computed property to `ProviderShellViewModel` that checks `codexAdapter.state`:
  ```swift
  var codexDetected: Bool {
      if case .installed = codexAdapter.state { return true }
      return false
  }
  ```

  Then in SettingsView, change line 230:
  ```swift
  Text(providerShellViewModel.codexDetected ? "Detected" : "Not Detected")
  ```

  ### MODIFY: `ClaudeUsage.xcodeproj/project.pbxproj`

  Add `CodexAdapter.swift` to:
  1. PBXFileReference — ID `AA100033`
  2. PBXBuildFile — ID `AA000029`
  3. Services group (AA600007) children list
  4. App Sources build phase (AA800001) files list

  Note: `CodexTypes.swift` is already in the project from step 2.4.

  ### Key decisions
  - `CodexAdapter` created internally by `ProviderShellViewModel` (not injected from App) — keeps dependency chain simple
  - Codex plan persisted in `ProviderSettingsStore` (global, not per-account) since Codex has its own auth
  - 15-second refresh timer for passive filesystem scans (spec recommendation)
  - If Codex not installed, snapshot stays `.codex(status: .missingConfiguration, ...)` — no adapter noise
  - `countRecentResets` counts limitHit events in last 24h as proxy for window resets
  - ProviderCardView needs no changes — it already renders any ProviderCard uniformly; the confidence info flows through headline/detailText

  ### Gotchas from prior steps
  - ProviderSnapshot enum uses associated values — every new case needs `id` and `isEnabled` computed property updates
  - `ProviderCoordinator.makeShellState` iterates snapshots and maps to cards — must handle the new case
  - The `codexAdapter.$state` subscription must use `[weak self]` to avoid retain cycles
  - Timer must be invalidated on deinit to prevent leaks
  - `SettingsView` receives `providerShellViewModel` as `@ObservedObject` — adding a computed property there is sufficient for reactivity

  ### Acceptance criteria
  - `xcodebuild build` succeeds
  - `xcodebuild test` — all 15 Codex tests + 21 existing tests pass
  - When `~/.codex/config.toml` exists: Codex card shows "Codex — Observed Only" (or higher confidence with activity)
  - When `~/.codex/` doesn't exist: Codex card shows "Not configured" (unchanged behavior)
  - Settings shows "Detected" / "Not Detected" for Codex row
  - No changes to Claude networking or UsageViewModel

## Green
- [x] Step 2.6: [automated] Make all Codex passive tests pass, run existing tests, verify no regressions.

  **What:** Ensure all CodexAdapterTests pass. Run the full test suite (should be 21 existing + ~15 new Codex tests ≈ 36 total). Verify Codex never claims exact remaining quota without a defensible source. Fix any compilation or logic issues.

  **Acceptance criteria:**
  - All CodexAdapterTests pass
  - All 21 existing tests still pass
  - `xcodebuild build` compiles cleanly
  - No changes to `UsageViewModel`, `UsageService`, or Claude networking code

## Milestone
- [x] Codex can be detected and configured as a monitored provider.
- [x] Codex passive monitoring shows observed local activity, estimate/headroom guidance, and explicit confidence.
- [x] Unknown or degraded Codex states remain visible and explained.
- [x] Claude behavior remains unchanged while Codex is enabled.
- [x] All Phase 2 tests pass.
- [x] No regressions in previous phase tests.

## On Completion
Phase 2 completed 2026-04-09. All 46 tests pass. Codex detection, parsing, confidence engine, adapter, and tray rotation all wired. Manual validation (real Codex sessions) overridden by user — deferred to future session.
