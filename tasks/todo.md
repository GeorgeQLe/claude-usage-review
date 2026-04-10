# Phase 4: Gemini Passive Adapter

> Project: ClauseUsage (macOS menu bar app) · Phase 4 of 7
> Test strategy: tdd
> Prior phases: Phase 1 (shared provider foundation) ✅, Phase 2 (Codex passive adapter) ✅, Phase 3 (Codex accuracy mode wrapper) ✅
> Current test count: 61 passing, 0 expected failures

## Tests First
- [ ] Step 4.1: [automated] Add failing fixture-based tests for Gemini install detection, auth-mode detection, passive request counting, rate-pressure derivation, and confidence labeling.

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
- [ ] Step 4.2: [automated] Implement Gemini install/auth detection.

  **What:** Create `GeminiDetector` that checks for Gemini CLI installation and authenticaton state. Mirrors `CodexDetector` pattern.

  **Files to create:**
  - `ClaudeUsage/Services/GeminiDetector.swift` — new file:
    ```
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
        let geminiHome: URL   // default: ~/.gemini
        let fileManager: FileManager
        init(geminiHome: URL = ..., fileManager: FileManager = .default)
        func detect() -> GeminiDetectionResult
    }
    ```
    - Check `geminiHome/settings.json` exists → `.installed` vs `.notInstalled`
    - If installed, read `settings.json` → parse `security.auth.selectedType` → map to `GeminiAuthMode`
    - Check `oauth_creds.json` (for oauth) or other creds → `.authenticated(mode:)` vs `.authAbsent`

  **Files to modify:**
  - `ClaudeUsage.xcodeproj/project.pbxproj` — add `GeminiDetector.swift` to Services group and app Sources build phase

  **Acceptance criteria:**
  - `xcodebuild build` compiles
  - `GeminiDetectionTests` pass (4 tests)

- [ ] Step 4.3: [automated] Implement Gemini session parser for passive request counting.

  **What:** Create `GeminiActivityParser` that reads `~/.gemini/tmp/**/chats/session-*.json` files, extracts request timestamps and token usage from gemini-type messages. Computes `GeminiRatePressure` (daily count, RPM, headroom).

  **Files to create:**
  - `ClaudeUsage/Services/GeminiActivityParser.swift` — new file:
    ```
    struct GeminiRequestEvent: Equatable {
        let timestamp: Date
        let inputTokens: Int?
        let outputTokens: Int?
        let totalTokens: Int?
        let model: String?
    }
    struct GeminiRatePressure: Equatable {
        let dailyRequestCount: Int
        let requestsPerMinute: Double?
        let remainingDailyHeadroom: Int?  // nil when no plan profile
    }
    class GeminiActivityParser {
        let geminiHome: URL
        let fileManager: FileManager
        init(geminiHome: URL = ..., fileManager: FileManager = .default)
        func parseSessionFiles() -> [GeminiRequestEvent]
        func ratePressure(from events: [GeminiRequestEvent], plan: GeminiPlanProfile?) -> GeminiRatePressure
    }
    ```
    - Walks `geminiHome/tmp/` looking for `**/chats/session-*.json`
    - For each session file, decodes JSON → extracts messages where `type == "gemini"`
    - Each gemini message becomes a `GeminiRequestEvent` with timestamp, tokens, model
    - `ratePressure()` computes daily count (last 24h), RPM (last 5 min sliding window), headroom (plan daily limit − daily count)
    - Skips unreadable/corrupt files via `try?`

  **Files to modify:**
  - `ClaudeUsage.xcodeproj/project.pbxproj` — add `GeminiActivityParser.swift` to app Sources build phase

  **Acceptance criteria:**
  - `xcodebuild build` compiles
  - `GeminiActivityParsingTests` pass (5 tests)
  - `GeminiRatePressureTests` pass (4 tests)

- [ ] Step 4.4: [automated] Add Gemini plan profiles and confidence engine.

  **What:** Create Gemini-specific types for plan profiles and confidence evaluation. Add `GeminiAdapter` orchestrator. Wire into `ProviderTypes.swift` with a new `.geminiRich` snapshot case.

  **Files to create:**
  - `ClaudeUsage/Models/GeminiTypes.swift` — new file:
    ```
    struct GeminiPlanProfile: Equatable {
        let name: String               // e.g., "Personal Google Auth"
        let dailyRequestLimit: Int?    // e.g., 1000
        let requestsPerMinuteLimit: Int? // e.g., 60
    }
    struct GeminiEstimate: Equatable {
        let confidence: GeminiConfidence
        let ratePressure: GeminiRatePressure?
        let authMode: GeminiAuthMode?
    }
    enum GeminiConfidence: Equatable {
        case exact, highConfidence, estimated, observedOnly
    }
    class GeminiConfidenceEngine {
        func evaluate(
            detection: GeminiDetectionResult,
            events: [GeminiRequestEvent],
            plan: GeminiPlanProfile?
        ) -> GeminiEstimate
    }
    ```
    - Confidence rules (from spec):
      - `.exact` — never in passive mode (reserved for wrapper)
      - `.highConfidence` — known auth mode (e.g., `.oauthPersonal`) + plan profile + events with stable timestamps
      - `.estimated` — auth mode known + some events but no plan, OR plan but sparse events
      - `.observedOnly` — auth detected but insufficient quota evidence

  - `ClaudeUsage/Services/GeminiAdapter.swift` — new file:
    ```
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
        
        init(geminiHome: URL = ..., planProfile: GeminiPlanProfile? = nil)
        func refresh()
        func toProviderSnapshot(isEnabled: Bool) -> ProviderSnapshot
    }
    ```
    - `refresh()`: detect → parse sessions → evaluate confidence → set state
    - `toProviderSnapshot()`: returns `.gemini(status:)` if not installed, `.geminiRich(estimate:)` if installed

  **Files to modify:**
  - `ClaudeUsage/Models/ProviderTypes.swift` — add `.geminiRich(estimate: GeminiEstimate, isEnabled: Bool)` case to `ProviderSnapshot` enum; update `id`, `isEnabled`, `ProviderCoordinator.makeShellState`, `selectedTrayProvider` to handle new case
  - `ClaudeUsage/Models/ProviderSettingsStore.swift` — add `geminiPlan() -> GeminiPlanProfile?`, `setGeminiPlan(_:)`, `geminiAuthMode() -> GeminiAuthMode?`, `setGeminiAuthMode(_:)` methods
  - `ClaudeUsage.xcodeproj/project.pbxproj` — add `GeminiTypes.swift` and `GeminiAdapter.swift` to app Sources build phase

  **Acceptance criteria:**
  - `xcodebuild build` compiles
  - `GeminiConfidenceTests` pass (4 tests)

- [ ] Step 4.5: [automated] Wire GeminiAdapter into ProviderShellViewModel and render Gemini UI.

  **What:** Integrate `GeminiAdapter` into the provider shell with 15s polling, update SettingsView with Gemini provider row (auth mode picker, plan selection, detection status), and update ProviderShellViewModel tray text formatting for Gemini.

  **Files to modify:**
  - `ClaudeUsage/Models/ProviderShellViewModel.swift` — add:
    - `private let geminiAdapter: GeminiAdapter` property
    - `private var geminiTimer: Timer?` (15s polling, same as Codex)
    - Initialize in `init` with plan from `settingsStore.geminiPlan()`
    - Add `geminiDetected: Bool` computed property
    - In `rebuildShellState`, append `geminiAdapter.toProviderSnapshot(isEnabled:)`
    - Add tray text formatting for `.geminiRich` case (e.g., "Gemini 412/1000" or "Gemini Observed")

  - `ClaudeUsage/Views/SettingsView.swift` — replace Gemini placeholder with:
    - "Gemini" row with detection status ("Detected" / "Not Detected") + enable toggle
    - When enabled + detected: auth mode display, plan picker (Personal: 1000/day, 60/min)
    - Rate pressure summary: "412 req today · 16h left" or "No data"

  **Acceptance criteria:**
  - `xcodebuild build` compiles
  - Gemini provider card appears in stacked popover when enabled + detected
  - Tray rotates across Claude, Codex, and Gemini when all three are enabled
  - Settings shows Gemini configuration row

## Green
- [ ] Step 4.6: [automated] Make all Gemini passive tests pass, rerun all Phase 1-3 tests, verify no regressions.

  **What:** Ensure all GeminiAdapterTests pass. Run the full test suite (should be 61 existing + ~17 new Gemini tests ≈ 78 total). Verify provider rotation works with all three providers. Fix any compilation or logic issues.

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
