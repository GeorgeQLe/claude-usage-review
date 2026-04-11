# Phase 4: Gemini Passive Adapter

> Project: ClauseUsage (macOS menu bar app) · Phase 4 of 7
> Test strategy: tdd
> Prior phases: Phase 1 (shared provider foundation) ✅, Phase 2 (Codex passive adapter) ✅, Phase 3 (Codex accuracy mode wrapper) ✅
> Current test count: 78 passing (61 existing + 4 GeminiDetection + 5 GeminiActivityParsing + 4 GeminiRatePressure + 4 GeminiConfidence)

## Tests First
- [x] Step 4.1: [automated] Add failing fixture-based tests for Gemini install detection, auth-mode detection, passive request counting, rate-pressure derivation, and confidence labeling.

  **What:** Write red-phase tests that define the Gemini passive adapter contract before production code exists. Tests use temp directories and inline fixtures — no live Gemini CLI invocations. Follows the same pattern as `CodexAdapterTests.swift`.

  **Files to create:**
  - `ClaudeUsageTests/GeminiAdapterTests.swift` — new test file with these test classes:

  **GeminiDetectionTests** (~4 tests):
  - `testDetectsInstalledWhenSettingsJsonExists` — create `settings.json` at `geminiHome/settings.json` → `.installed`
  - `testDetectsNotInstalledWhenDirectoryMissing` — missing directory → `.notInstalled`
  - `testDetectsOAuthAuthWhenOAuthCredsExist` — create `oauth_creds.json` + `settings.json` with `selectedType: "oauth-personal"` → `.authenticated(mode: .oauthPersonal)`
  - `testDetectsAuthAbsentWhenNoCredsFile` — `settings.json` exists but no creds → `.authAbsent`

  **GeminiActivityParsingTests** (~5 tests):
  - `testParsesSessionFileExtractsMessageTimestamps` — create a fixture `session-*.json` with 3 messages → parser extracts 3 `GeminiRequestEvent` records with timestamps and token counts
  - `testParsesMultipleSessionFilesAcrossProjectHashes` — create sessions under two different `{projectHash}/chats/` dirs → parser finds all sessions
  - `testExtractsTokenUsageFromGeminiMessages` — session fixture with `tokens: { input: 100, output: 50, total: 150 }` → event has `inputTokens: 100`, `outputTokens: 50`
  - `testExtractsModelFromGeminiMessages` — session fixture with `model: "gemini-2.5-flash"` → event has `model: "gemini-2.5-flash"`
  - `testSkipsCorruptSessionFiles` — create one valid + one corrupt JSON file → parser returns events from valid file only

  **GeminiRatePressureTests** (~4 tests):
  - `testDailyRequestCountSumsEventsInLast24Hours` — create events spanning 36h → daily count only includes last 24h events
  - `testRequestsPerMinuteOverSlidingWindow` — create 10 events in 5 minutes → RPM = 2.0
  - `testDailyHeadroomCalculatedAgainstPlanQuota` — 400 requests today + plan with 1000/day → headroom = 600
  - `testHeadroomNilWhenNoPlanProfile` — events exist but no plan → `remainingDailyHeadroom` is nil

  **GeminiConfidenceTests** (~4 tests):
  - `testObservedOnlyWhenAuthDetectedButNoSessions` — detection has auth, no events, no plan → `.observedOnly`
  - `testEstimatedWhenAuthModeKnownButCountingIncomplete` — auth mode known + some events but no plan → `.estimated`
  - `testHighConfidenceWhenKnownAuthModeWithPlanAndActivity` — `.oauthPersonal` + plan profile + events with stable timestamps → `.highConfidence`
  - `testNeverClaimsExactForPassiveMode` — even with full data → never `.exact` (reserved for wrapper)

  **Files to modify:**
  - `ClaudeUsage.xcodeproj/project.pbxproj` — add `GeminiAdapterTests.swift` to test target

  **Acceptance criteria:**
  - `xcodebuild build` compiles (test target fails with missing-type errors confirming red phase)
  - Tests reference types: `GeminiDetector`, `GeminiDetectionResult`, `GeminiAuthMode`, `GeminiActivityParser`, `GeminiRequestEvent`, `GeminiRatePressure`, `GeminiConfidenceEngine`, `GeminiEstimate`, `GeminiPlanProfile`
  - Privacy tests not needed here (Gemini session files are read-only, no prompt content is stored by *our* app)

## Implementation
- [x] Step 4.2: [automated] Implement Gemini install/auth detection.

  **What:** Create `GeminiDetector` that checks for Gemini CLI installation and auth state. Mirrors `CodexDetector` pattern (see `ClaudeUsage/Services/CodexDetector.swift`). This step also requires stub types referenced by other test classes so the test target compiles — but only `GeminiDetectionTests` (4 tests) need to pass.

  **File to create: `ClaudeUsage/Services/GeminiDetector.swift`**

  Follow `CodexDetector.swift` structure. Contains all detection types + detector class:

  ```swift
  import Foundation

  enum GeminiInstallStatus: Equatable { case installed, notInstalled }

  enum GeminiAuthMode: Equatable, Codable {
      case oauthPersonal    // settings.json selectedType: "oauth-personal"
      case apiKey           // settings.json selectedType: "api-key"
      case vertexAI         // settings.json selectedType: "vertex-ai"
      case codeAssist       // settings.json selectedType: "code-assist"
  }

  enum GeminiAuthStatus: Equatable {
      case authenticated(mode: GeminiAuthMode)
      case authAbsent
  }

  struct GeminiDetectionResult: Equatable {
      let installStatus: GeminiInstallStatus
      let authStatus: GeminiAuthStatus
  }

  class GeminiDetector {
      let geminiHome: URL
      let fileManager: FileManager

      init(geminiHome: URL = FileManager.default.homeDirectoryForCurrentUser
               .appendingPathComponent(".gemini"),
           fileManager: FileManager = .default)

      func detect() -> GeminiDetectionResult
  }
  ```

  **Detection logic:**
  1. Check `geminiHome/settings.json` exists → `.installed` / `.notInstalled`
  2. If not installed → return `(.notInstalled, .authAbsent)`
  3. If installed, read `settings.json`, decode JSON to extract `security.auth.selectedType` string
  4. Map string to `GeminiAuthMode`: `"oauth-personal"` → `.oauthPersonal`, `"api-key"` → `.apiKey`, `"vertex-ai"` → `.vertexAI`, `"code-assist"` → `.codeAssist`
  5. For OAuth mode: check `oauth_creds.json` exists → `.authenticated(mode:)` / `.authAbsent`
  6. For API key mode: could check for key presence, but for now `.authAbsent` if no creds file

  **JSON structure of `settings.json`** (from test fixtures):
  ```json
  {"security":{"auth":{"selectedType":"oauth-personal"}}}
  ```
  Use a nested `Decodable` struct or manual JSONSerialization to extract `selectedType`.

  **File to create: `ClaudeUsage/Services/GeminiActivityParser.swift`** (stub only)

  The test target won't compile without `GeminiActivityParser`, `GeminiRequestEvent`, `GeminiRatePressure`, and `GeminiPlanProfile`. Create stubs with `fatalError("Not yet implemented")` bodies so the test target links. Only the type signatures matter — real implementation is Step 4.3.

  ```swift
  struct GeminiRequestEvent: Equatable {
      let timestamp: Date
      let inputTokens: Int
      let outputTokens: Int
      let totalTokens: Int
      let model: String
  }

  struct GeminiPlanProfile: Equatable {
      let name: String
      let dailyRequestLimit: Int
      let requestsPerMinuteLimit: Int
  }

  struct GeminiRatePressure: Equatable {
      let dailyRequestCount: Int
      let requestsPerMinute: Double
      let remainingDailyHeadroom: Int?
      init(events:now:) // and init(events:plan:now:)
  }

  class GeminiActivityParser {
      init(geminiHome: URL, fileManager: FileManager = .default)
      func parseSessionFiles() -> [GeminiRequestEvent]
  }
  ```

  **File to create: `ClaudeUsage/Models/GeminiTypes.swift`** (stub only)

  Stub `GeminiConfidenceEngine`, `GeminiEstimate`, `GeminiConfidence` so confidence tests compile:

  ```swift
  enum GeminiConfidence: Equatable {
      case exact, highConfidence, estimated, observedOnly
  }

  struct GeminiEstimate: Equatable {
      let confidence: GeminiConfidence
      let ratePressure: GeminiRatePressure?
      let authMode: GeminiAuthMode?
  }

  class GeminiConfidenceEngine {
      func evaluate(detection:events:plan:) -> GeminiEstimate
  }
  ```

  **File to modify: `ClaudeUsage.xcodeproj/project.pbxproj`**
  - Add `GeminiDetector.swift` → Services group + app Sources build phase (next ID: AA100038/AA000035)
  - Add `GeminiActivityParser.swift` → Services group + app Sources build phase (AA100039/AA000036)
  - Add `GeminiTypes.swift` → Models group + app Sources build phase (AA100040/AA000037)

  **Acceptance criteria:**
  - `xcodebuild build -scheme ClaudeUsage` compiles (app target)
  - `xcodebuild build-for-testing -scheme ClaudeUsage` compiles (test target links)
  - `GeminiDetectionTests` pass (4 tests): installed/notInstalled, oauthAuth/authAbsent
  - Remaining 13 Gemini tests may fail at runtime (stubs) — that's expected
  - Existing 61 tests still pass

- [x] Step 4.3: [automated] Implement Gemini session parser for passive request counting.

  **What:** Replace the `fatalError()` stubs in `GeminiActivityParser.swift` with real implementations. The file already exists with correct type signatures from Step 4.2 — just fill in the method bodies. Also implement `GeminiRatePressure` init bodies.

  **File to modify: `ClaudeUsage/Services/GeminiActivityParser.swift`**

  Already contains: `GeminiRequestEvent` struct, `GeminiPlanProfile` struct, `GeminiRatePressure` struct (with two fatalError inits), `GeminiActivityParser` class (with fatalError `parseSessionFiles`).

  **`GeminiActivityParser.parseSessionFiles()` implementation:**
  1. Walk `geminiHome/tmp/` looking for `*/chats/session-*.json` (two-level: project hash dir → chats dir → session files)
  2. For each session file, `try? Data(contentsOf:)` + `try? JSONSerialization` to decode
  3. Extract `messages` array, filter where `type == "gemini"`
  4. For each gemini message, extract:
     - `timestamp` string → parse with ISO8601DateFormatter (`.withInternetDateTime, .withFractionalSeconds`)
     - `tokens.input`, `tokens.output`, `tokens.total` as Int
     - `model` as String
  5. Return flat `[GeminiRequestEvent]` across all session files
  6. Skip corrupt/unreadable files silently (use `try?`)

  **`GeminiRatePressure` init implementations:**
  - `init(events:now:)` — no plan variant:
    - `dailyRequestCount` = count of events where `timestamp > now - 24h`
    - `requestsPerMinute` = events in last 5 minutes / 5.0 (the sliding window size)
    - `remainingDailyHeadroom` = nil
  - `init(events:plan:now:)` — with plan:
    - Same daily/RPM computation
    - `remainingDailyHeadroom` = `plan.dailyRequestLimit - dailyRequestCount`

  **Test expectations (from `GeminiAdapterTests.swift`):**
  - `testParsesSessionFileExtractsMessageTimestamps`: 5 messages, 3 are type "gemini" → 3 events
  - `testParsesMultipleSessionFilesAcrossProjectHashes`: 2 project dirs, 1 event each → 2 events total
  - `testExtractsTokenUsageFromGeminiMessages`: input=200, output=100, total=300
  - `testExtractsModelFromGeminiMessages`: model="gemini-2.5-flash"
  - `testSkipsCorruptSessionFiles`: 1 valid + 1 corrupt → 1 event
  - `testDailyRequestCountSumsEventsInLast24Hours`: 3 events (36h, 12h, 1h ago) → dailyCount=2
  - `testRequestsPerMinuteOverSlidingWindow`: 10 events every 30s over 5min → RPM=2.0
  - `testDailyHeadroomCalculatedAgainstPlanQuota`: 400 events + plan 1000/day → headroom=600
  - `testHeadroomNilWhenNoPlanProfile`: no plan → headroom nil

  **No pbxproj changes needed** — file already registered in Step 4.2.

  **Acceptance criteria:**
  - `xcodebuild build` compiles
  - `GeminiActivityParsingTests` pass (5 tests)
  - `GeminiRatePressureTests` pass (4 tests)
  - All 65 existing tests still pass

- [x] Step 4.4: [automated] Add Gemini confidence engine + adapter orchestrator.

  **What:** Replace the `fatalError()` stub in `GeminiTypes.swift` with real confidence logic. Create `GeminiAdapter` orchestrator. Wire `.geminiRich` into `ProviderTypes.swift`. Add Gemini plan/auth settings to `ProviderSettingsStore`. This makes the 4 GeminiConfidenceTests pass.

  ## File to Modify: `ClaudeUsage/Models/GeminiTypes.swift`

  **Already contains:** `GeminiConfidence` enum, `GeminiEstimate` struct, `GeminiConfidenceEngine` class with `fatalError()` body.

  **Note:** The existing `GeminiEstimate` struct needs `Equatable` conformance (tests use `XCTAssertEqual`). Add `: Equatable` to `GeminiEstimate` if missing. Also `GeminiRatePressure` needs `Equatable` (it's used inside `GeminiEstimate`).

  **Replace `evaluate()` body with confidence rules:**
  ```swift
  func evaluate(detection:events:plan:) -> GeminiEstimate {
      let authMode: GeminiAuthMode?
      if case .authenticated(let mode) = detection.authStatus {
          authMode = mode
      } else {
          authMode = nil
      }

      let ratePressure: GeminiRatePressure?
      if !events.isEmpty {
          if let plan = plan {
              ratePressure = GeminiRatePressure(events: events, plan: plan, now: Date())
          } else {
              ratePressure = GeminiRatePressure(events: events, now: Date())
          }
      } else {
          ratePressure = nil
      }

      // Never claim .exact in passive mode
      let confidence: GeminiConfidence
      if authMode != nil && plan != nil && !events.isEmpty {
          confidence = .highConfidence
      } else if authMode != nil && !events.isEmpty {
          confidence = .estimated
      } else {
          confidence = .observedOnly
      }

      return GeminiEstimate(confidence: confidence, ratePressure: ratePressure, authMode: authMode)
  }
  ```

  **Test expectations (from `GeminiAdapterTests.swift`):**
  - `testObservedOnlyWhenAuthDetectedButNoSessions`: auth present, no events, no plan → `.observedOnly`
  - `testEstimatedWhenAuthModeKnownButCountingIncomplete`: auth + events, no plan → `.estimated`
  - `testHighConfidenceWhenKnownAuthModeWithPlanAndActivity`: auth + events + plan → `.highConfidence`
  - `testNeverClaimsExactForPassiveMode`: even with full data → never `.exact`

  ## File to Create: `ClaudeUsage/Services/GeminiAdapter.swift`

  Follow `CodexAdapter.swift` pattern exactly:
  ```swift
  import Foundation

  enum GeminiAdapterState {
      case notInstalled
      case installed(estimate: GeminiEstimate)
  }

  class GeminiAdapter: ObservableObject {
      @Published var state: GeminiAdapterState = .notInstalled
      let detector: GeminiDetector
      let parser: GeminiActivityParser
      let confidenceEngine: GeminiConfidenceEngine
      var planProfile: GeminiPlanProfile?

      init(geminiHome: URL = FileManager.default.homeDirectoryForCurrentUser
               .appendingPathComponent(".gemini"),
           planProfile: GeminiPlanProfile? = nil) {
          self.detector = GeminiDetector(geminiHome: geminiHome)
          self.parser = GeminiActivityParser(geminiHome: geminiHome)
          self.confidenceEngine = GeminiConfidenceEngine()
          self.planProfile = planProfile
      }

      func refresh() {
          let detection = detector.detect()
          guard detection.installStatus == .installed else {
              state = .notInstalled
              return
          }
          let events = parser.parseSessionFiles()
          let estimate = confidenceEngine.evaluate(
              detection: detection, events: events, plan: planProfile)
          state = .installed(estimate: estimate)
      }

      func toProviderSnapshot(isEnabled: Bool) -> ProviderSnapshot {
          switch state {
          case .notInstalled:
              return .gemini(status: .missingConfiguration, isEnabled: isEnabled)
          case let .installed(estimate):
              return .geminiRich(estimate: estimate, isEnabled: isEnabled)
          }
      }
  }
  ```

  ## File to Modify: `ClaudeUsage/Models/ProviderTypes.swift`

  Add new case to `ProviderSnapshot` enum:
  ```swift
  case geminiRich(estimate: GeminiEstimate, isEnabled: Bool)
  ```

  Update `id` computed property — `.geminiRich` returns `.gemini`.
  Update `isEnabled` computed property — `.geminiRich` returns its `isEnabled`.
  Update any switch statements in `ProviderCoordinator.makeShellState` and `selectedTrayProvider` to handle `.geminiRich`.

  ## File to Modify: `ClaudeUsage/Models/ProviderSettingsStore.swift`

  Add methods following the Codex pattern (uses UserDefaults keys `provider_gemini_plan`, `provider_gemini_plan_limit`, `provider_gemini_plan_rpm_limit`, `provider_gemini_auth_mode`):
  ```swift
  func geminiPlan() -> GeminiPlanProfile? {
      guard let name = UserDefaults.standard.string(forKey: "provider_gemini_plan"),
            let limit = UserDefaults.standard.object(forKey: "provider_gemini_plan_limit") as? Int,
            let rpmLimit = UserDefaults.standard.object(forKey: "provider_gemini_plan_rpm_limit") as? Int
      else { return nil }
      return GeminiPlanProfile(name: name, dailyRequestLimit: limit, requestsPerMinuteLimit: rpmLimit)
  }

  func setGeminiPlan(_ plan: GeminiPlanProfile?) { ... }
  func geminiAuthMode() -> GeminiAuthMode? { ... }
  func setGeminiAuthMode(_ mode: GeminiAuthMode?) { ... }
  ```

  ## File to Modify: `ClaudeUsage.xcodeproj/project.pbxproj`

  Add `GeminiAdapter.swift` to:
  - PBXFileReference section (next ID: AA100041)
  - PBXBuildFile section (next ID: AA000038)
  - Services PBXGroup children
  - App Sources build phase

  **Note:** `GeminiTypes.swift` is already registered from Step 4.2. Only `GeminiAdapter.swift` needs adding.

  **Acceptance criteria:**
  - `xcodebuild build` compiles
  - `GeminiConfidenceTests` pass (4 tests)
  - All 74 existing tests still pass (78 total)

- [x] Step 4.5: [automated] Wire GeminiAdapter into ProviderShellViewModel and render Gemini UI.

  **What:** Integrate `GeminiAdapter` into the provider shell with 15s polling, update SettingsView with Gemini provider row (auth mode picker, plan selection, detection status), and update ProviderShellViewModel tray text formatting for Gemini.

  **File to modify: `ClaudeUsage/Models/ProviderShellViewModel.swift`**

  Changes (follow Codex wiring pattern exactly):
  1. Add `private let geminiAdapter: GeminiAdapter` property (line ~11, after `codexAdapter`)
  2. Add `private var geminiTimer: Timer?` (line ~12, after `codexTimer`)
  3. In `init` (~line 16-42):
     - Read plan: `let geminiPlan = settingsStore.geminiPlan()`
     - Init adapter: `self.geminiAdapter = GeminiAdapter(planProfile: geminiPlan)`
     - Subscribe to `geminiAdapter.$state` → `rebuildFromCurrent()` (like codexAdapter on line 32-34)
     - Call `geminiAdapter.refresh()` (like line 35)
     - Start timer: `geminiTimer = Timer.scheduledTimer(withTimeInterval: 15, repeats: true) { ... geminiAdapter.refresh() }` (like line 36-38)
  4. In `deinit` (~line 44-47): add `geminiTimer?.invalidate()`
  5. Add computed property `geminiDetected: Bool` (like `codexDetected` on line 81-84):
     ```swift
     var geminiDetected: Bool {
         if case .installed = geminiAdapter.state { return true }
         return false
     }
     ```
  6. In `rebuildShellState` (~line 109): replace the hardcoded `.gemini(status: .missingConfiguration, ...)` with:
     ```swift
     snapshots.append(geminiAdapter.toProviderSnapshot(isEnabled: settingsStore.isEnabled(.gemini)))
     ```
  7. Tray text formatting for `.geminiRich` is already handled (added in Step 4.4).

  **File to modify: `ClaudeUsage/Views/SettingsView.swift`**

  Replace the minimal Gemini section (~line 258-270) with a richer configuration row:
  - Detection status badge: "Detected" (green) / "Not Detected" (gray) based on `providerShellViewModel.geminiDetected`
  - Enable toggle (existing binding to `providerSettingsStore.isEnabled(.gemini)`)
  - When enabled + detected, show:
    - Auth mode display (read-only, from adapter detection)
    - Plan picker: "Personal" preset (1000/day, 60/min) or "None"
    - Rate pressure summary if available: "X req today" or "No activity data"
  - Follow the existing Codex settings pattern in the same file

  **Acceptance criteria:**
  - `xcodebuild build` compiles
  - Gemini provider card appears in stacked popover when enabled + detected
  - Tray rotates across Claude, Codex, and Gemini when all three are enabled
  - Settings shows Gemini configuration row with detection status
  - 78 tests still pass (no new tests in this step)

## Green
- [ ] Step 4.6: [automated] Make all Gemini passive tests pass, rerun all Phase 1-3 tests, verify no regressions.

  **What:** Final green-phase verification for Phase 4. All 78 tests already pass as of Step 4.5, so this step is primarily a verification gate — run the full suite, confirm no regressions, and mark Phase 4 milestone complete.

  **Current state (as of Step 4.5 completion):**
  - Build: clean (`xcodebuild build` succeeds)
  - Tests: 78 pass, 0 failures (`xcodebuild test`)
  - All Gemini tests already passing: GeminiDetectionTests (4), GeminiActivityParsingTests (5), GeminiRatePressureTests (4), GeminiConfidenceTests (4) = 17 Gemini tests
  - All pre-Phase-4 tests passing: 61 tests
  - GeminiAdapter wired into ProviderShellViewModel with 15s polling
  - SettingsView shows live Gemini detection status + plan display

  **Steps:**
  1. Run `xcodebuild build -scheme ClaudeUsage -destination 'platform=macOS'` — confirm clean compile
  2. Run `xcodebuild test -scheme ClaudeUsage -destination 'platform=macOS'` — confirm 78 pass, 0 fail
  3. Verify no changes to `ClaudeUsage/Services/UsageService.swift` or `ClaudeUsage/Models/UsageViewModel.swift` (Claude networking untouched)
  4. Verify no changes to `ClaudeUsage/Services/CodexAdapter.swift` or `ClaudeUsage/Services/CodexDetector.swift` (Codex logic untouched)
  5. Check all milestone criteria in the Milestone section below and mark them complete
  6. Mark Phase 4 complete in `tasks/roadmap.md`

  **Acceptance criteria:**
  - All GeminiAdapterTests pass (~17 tests)
  - All 61 existing tests still pass
  - `xcodebuild build` compiles cleanly
  - No changes to `UsageViewModel`, `UsageService`, or Claude networking code
  - No changes to Codex adapter logic (only additive Gemini code)
  - Provider rotation works correctly with Claude + Codex + Gemini

## Milestone
- [ ] Gemini can be detected and configured as a monitored provider.
- [ ] Gemini passive monitoring shows auth-mode-aware quota/rate guidance with explicit confidence.
- [ ] Provider rotation and stacked cards work with Claude, Codex, and Gemini together.
- [ ] All Phase 4 tests pass.
- [ ] No regressions in previous phase tests.
