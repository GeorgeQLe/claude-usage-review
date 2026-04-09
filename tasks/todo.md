# Phase 3: Codex Accuracy Mode Wrapper

> Project: ClaudeUsage (macOS menu bar app) · Phase 3 of 7
> Test strategy: tdd
> Prior phases: Phase 1 (shared provider foundation) ✅, Phase 2 (Codex passive adapter) ✅
> Current test count: 46 passing (15 Codex + 5 ProviderShell + 26 existing)

## Tests First
- [ ] Step 3.1: [automated] Add failing tests for Codex wrapper event models, event-ledger persistence, confidence upgrades from wrapper data, and privacy constraints.

  **What:** Write red-phase tests that define the Accuracy Mode wrapper contract before production code exists. Tests use temp directories and inline fixtures — no live CLI invocations.

  **Files to create:**
  - `ClaudeUsageTests/CodexWrapperTests.swift` — new test file with these test classes:

  **CodexWrapperEventTests** (~3 tests):
  - `testInvocationEventCapturesStartEndTimestamps` — create a `CodexInvocationEvent` with start/end dates → both fields accessible, duration computed
  - `testInvocationEventRecordsCommandModeAndModel` — event with mode "chat", model "codex-mini" → fields match
  - `testInvocationEventRecordsLimitHitDetection` — event with `limitHitDetected: true` → flag accessible

  **CodexEventLedgerTests** (~5 tests):
  - `testAppendEventWritesJSONLLine` — append an event to ledger at temp path → file contains one JSONL line with expected fields
  - `testReadEventsReturnsAllAppendedEvents` — append 3 events, read back → 3 events returned in order
  - `testRollingWindowTrimRemovesOldEvents` — append events spanning 48h, trim with 24h window → only recent events remain
  - `testLedgerHandlesEmptyFile` — read from empty file → returns empty array, no crash
  - `testLedgerHandlesCorruptLines` — file with valid + corrupt JSONL → skips corrupt, returns valid events

  **CodexWrapperConfidenceTests** (~4 tests):
  - `testWrapperEventsUpgradeFromObservedToEstimated` — passive-only yields `.observedOnly`, add wrapper invocation events → upgrades to `.estimated`
  - `testWrapperLimitHitsUpgradeToHighConfidence` — wrapper events with 3+ limitHit detections + plan → `.highConfidence`
  - `testWrapperEventsAloneWithoutPlanYieldEstimated` — wrapper events but no plan profile → `.estimated` (not `.highConfidence`)
  - `testWrapperDoesNotClaimExactConfidence` — even with many wrapper events → never `.exact`

  **CodexPrivacyTests** (~3 tests):
  - `testInvocationEventHasNoPromptBodyField` — `CodexInvocationEvent` struct has no property named `promptBody`, `prompt`, `input`, or `response`
  - `testLedgerJSONLContainsNoDerivedContent` — append an event, read raw file → JSONL line contains only timestamps, mode, model, limitHit — no prompt/response text
  - `testLedgerFileStoredInAppSupport` — ledger default path is under `~/Library/Application Support/ClaudeUsage/`

  **Files to modify:**
  - `ClaudeUsage.xcodeproj/project.pbxproj` — add `CodexWrapperTests.swift` to test target

  **Acceptance criteria:**
  - `xcodebuild build` compiles (test target fails with missing-type errors confirming red phase)
  - Tests reference types: `CodexInvocationEvent`, `CodexEventLedger`, and updated `CodexConfidenceEngine` API
  - Privacy tests verify no prompt content storage by design

## Implementation
- [ ] Step 3.2: [automated] Add wrapper event types and event ledger persistence.

  **What:** Create `CodexInvocationEvent` struct and `CodexEventLedger` class. The event captures derived metrics only (timestamps, mode, model, limitHit flag). The ledger appends JSONL to `~/Library/Application Support/ClaudeUsage/codex-events.jsonl` and supports read-back with rolling window trim.

  **Files to modify:**
  - `ClaudeUsage/Models/CodexTypes.swift` — add:
    ```
    struct CodexInvocationEvent: Codable, Equatable {
        let startTime: Date
        let endTime: Date
        let commandMode: String?    // e.g., "chat", "explain", "edit"
        let model: String?          // e.g., "codex-mini-latest"
        let limitHitDetected: Bool
        var duration: TimeInterval { endTime.timeIntervalSince(startTime) }
    }
    ```

  - `ClaudeUsage/Services/CodexEventLedger.swift` — new file:
    ```
    class CodexEventLedger {
        let fileURL: URL
        init(directory: URL = defaultDirectory)
        func append(_ event: CodexInvocationEvent) throws
        func readEvents() -> [CodexInvocationEvent]
        func trim(retaining window: TimeInterval)  // removes events older than window
    }
    ```
    - JSONL format: one JSON object per line, ISO8601 dates
    - `readEvents()` skips malformed lines gracefully
    - `trim()` rewrites file keeping only events within window (default 48h)
    - Default directory: `~/Library/Application Support/ClaudeUsage/`

  **Files to modify (Xcode project):**
  - `ClaudeUsage.xcodeproj/project.pbxproj` — add `CodexEventLedger.swift` to Services group and app Sources build phase

  **Acceptance criteria:**
  - `xcodebuild build` compiles
  - `CodexWrapperEventTests` and `CodexEventLedgerTests` and `CodexPrivacyTests` should pass after this step

- [ ] Step 3.3: [automated] Implement Codex wrapper launcher.

  **What:** Create `CodexWrapper` that launches the `codex` CLI via `Process`, captures invocation timing, detects limit-hit errors from stderr, and records events to the ledger. This is the actual wrapper that users opt into.

  **Files to create:**
  - `ClaudeUsage/Services/CodexWrapper.swift` — new file:
    ```
    class CodexWrapper {
        let ledger: CodexEventLedger
        let codexPath: String   // path to codex binary, default: find via `which codex`
        
        init(ledger: CodexEventLedger, codexPath: String? = nil)
        
        func launch(arguments: [String]) -> CodexInvocationEvent
        // 1. Record startTime
        // 2. Launch Process with codex binary + arguments
        // 3. Capture stderr via Pipe
        // 4. Wait for completion
        // 5. Parse stderr for "rate limit" / "usage limit" patterns → limitHitDetected
        // 6. Record endTime
        // 7. Append event to ledger
        // 8. Return event
    }
    ```
    - Extracts `commandMode` from first argument (e.g., "chat", "explain")
    - Extracts `model` from `--model` flag if present
    - Does NOT capture or store stdin/stdout content (privacy constraint)

  **Files to modify:**
  - `ClaudeUsage/Models/ProviderSettingsStore.swift` — add:
    ```
    func codexAccuracyMode() -> Bool  // reads from UserDefaults
    func setCodexAccuracyMode(_ enabled: Bool)  // writes to UserDefaults
    ```
  - `ClaudeUsage.xcodeproj/project.pbxproj` — add `CodexWrapper.swift` to Services group and app Sources build phase

  **Key decisions:**
  - Wrapper is a utility class, not an ObservableObject — it's invoked on-demand, not observed
  - In Phase 3 we build the infrastructure; the actual shell alias/launcher integration is a manual task (user configures `alias codex='open -a ClaudeUsage --args wrap-codex --'` or similar)
  - Process stderr parsing reuses the same "rate limit" / "usage limit" pattern from `CodexActivityParser.parseLogLine`

  **Acceptance criteria:**
  - `xcodebuild build` compiles
  - Wrapper can be instantiated with a mock codex path

- [ ] Step 3.4: [automated] Merge wrapper telemetry into confidence engine and add Accuracy Mode UI.

  **What:** Update `CodexAdapter.refresh()` to merge ledger events with passive events. Update `CodexConfidenceEngine` to weight wrapper-derived events (they're higher quality than passive-only). Add Accuracy Mode toggle to SettingsView.

  **Files to modify:**
  - `ClaudeUsage/Models/CodexTypes.swift` — update `CodexConfidenceEngine.evaluate()`:
    - Accept new parameter: `wrapperEvents: [CodexInvocationEvent]`
    - If `wrapperEvents` is non-empty + plan → at least `.estimated`
    - If `wrapperEvents` has 3+ limitHit events in recent 24h + plan → `.highConfidence`
    - Still never returns `.exact` (spec constraint)

  - `ClaudeUsage/Services/CodexAdapter.swift` — update:
    - Add `let ledger: CodexEventLedger` property
    - In `init`, create ledger (same codexHome base or app support directory)
    - In `refresh()`, call `ledger.readEvents()` and pass to confidence engine
    - Trim ledger on each refresh (48h rolling window)

  - `ClaudeUsage/Views/SettingsView.swift` — update Codex provider row:
    - Add "Accuracy Mode" toggle below the Codex enable toggle (only shown when Codex is enabled + detected)
    - Show status text: "Wrapper active · N events recorded" or "Not enabled"
    - Toggle writes to `providerSettingsStore.codexAccuracyMode`

  - `ClaudeUsage/Models/ProviderShellViewModel.swift` — no changes needed (already subscribes to `codexAdapter.$state`)

  **Key decisions:**
  - Wrapper events are combined with passive events for a unified confidence evaluation
  - The confidence engine's existing `recentResets` parameter now counts both passive limitHit events AND wrapper limitHit detections
  - Ledger trim happens on each adapter refresh (every 15s) to keep the file small
  - UI shows event count as feedback that Accuracy Mode is working

  **Acceptance criteria:**
  - `xcodebuild build` compiles
  - `CodexWrapperConfidenceTests` pass (wrapper events upgrade confidence)
  - Accuracy Mode toggle visible in Settings when Codex is detected

## Green
- [ ] Step 3.5: [automated] Make all Codex wrapper tests pass, rerun all Phase 1-2 tests, verify no regressions.

  **What:** Ensure all CodexWrapperTests pass. Run the full test suite (should be 46 existing + ~15 new wrapper tests ≈ 61 total). Verify Accuracy Mode never claims `.exact` confidence. Fix any compilation or logic issues.

  **Acceptance criteria:**
  - All CodexWrapperTests pass
  - All 46 existing tests still pass
  - `xcodebuild build` compiles cleanly
  - No changes to `UsageViewModel`, `UsageService`, or Claude networking code
  - Privacy tests confirm no prompt content in ledger

## Milestone
- [ ] Codex Accuracy Mode can be enabled independently.
- [ ] Wrapper-derived Codex events improve confidence and update latency.
- [ ] Derived telemetry only is stored; raw prompt bodies are not persisted.
- [ ] Claude remains unaffected when Codex wrapper mode is on.
- [ ] All Phase 3 tests pass.
- [ ] No regressions in previous phase tests.
