# Phase 5: Gemini Accuracy Mode Wrapper

> Project: ClauseUsage (macOS menu bar app) · Phase 5 of 7
> Test strategy: tdd
> Prior phases: Phase 1 (shared provider foundation) ✅, Phase 2 (Codex passive adapter) ✅, Phase 3 (Codex accuracy mode wrapper) ✅, Phase 4 (Gemini passive adapter) ✅
> Current test count: 93 passing

## Tests First
- [x] Step 5.1: [automated] Add failing tests for Gemini wrapper event capture, event-ledger persistence, confidence upgrades from wrapper data, and privacy constraints.

  **What:** Write red-phase tests that define the Gemini Accuracy Mode wrapper contract before production code exists. Tests use temp directories and inline fixtures — no live CLI invocations. Mirrors `CodexWrapperTests.swift` pattern exactly.

  **Files to create:**
  - `ClaudeUsageTests/GeminiWrapperTests.swift` — new test file with these test classes:

  **GeminiWrapperEventTests** (~3 tests):
  - `testInvocationEventCapturesStartEndTimestamps` — create a `GeminiInvocationEvent` with start/end dates → both fields accessible, duration computed
  - `testInvocationEventRecordsCommandModeAndModel` — event with mode "chat", model "gemini-2.5-flash" → fields match
  - `testInvocationEventRecordsLimitHitDetection` — event with `limitHitDetected: true` → flag accessible

  **GeminiEventLedgerTests** (~5 tests):
  - `testAppendEventWritesJSONLLine` — append an event to ledger at temp path → file contains one JSONL line with expected fields
  - `testReadEventsReturnsAllAppendedEvents` — append 3 events, read back → 3 events returned in order
  - `testRollingWindowTrimRemovesOldEvents` — append events spanning 48h, trim with 24h window → only recent events remain
  - `testLedgerHandlesEmptyFile` — read from empty file → returns empty array, no crash
  - `testLedgerHandlesCorruptLines` — file with valid + corrupt JSONL → skips corrupt, returns valid events

  **GeminiWrapperConfidenceTests** (~4 tests):
  - `testWrapperEventsUpgradeFromObservedToEstimated` — passive-only yields `.observedOnly`, add wrapper invocation events → upgrades to `.estimated`
  - `testWrapperLimitHitsUpgradeToHighConfidence` — wrapper events with 3+ limitHit detections + plan → `.highConfidence`
  - `testWrapperEventsAloneWithoutPlanYieldEstimated` — wrapper events but no plan profile → `.estimated` (not `.highConfidence`)
  - `testWrapperDoesNotClaimExactConfidence` — even with many wrapper events → never `.exact`

  **GeminiPrivacyTests** (~3 tests):
  - `testInvocationEventHasNoPromptBodyField` — `GeminiInvocationEvent` struct has no property named `promptBody`, `prompt`, `input`, or `response`
  - `testLedgerJSONLContainsNoDerivedContent` — append an event, read raw file → JSONL line contains only timestamps, mode, model, limitHit — no prompt/response text
  - `testLedgerFileStoredInAppSupport` — ledger default path is under `~/Library/Application Support/ClaudeUsage/`

  **Files to modify:**
  - `ClaudeUsage.xcodeproj/project.pbxproj` — add `GeminiWrapperTests.swift` to test target

  **Acceptance criteria:**
  - `xcodebuild build` compiles (app target succeeds)
  - Test target compiles but tests fail with missing-type errors confirming red phase
  - Tests reference types: `GeminiInvocationEvent`, `GeminiEventLedger`, and updated `GeminiConfidenceEngine` API with `wrapperEvents:` parameter
  - Privacy tests verify no prompt content storage by design

## Implementation
- [x] Step 5.2: [automated] Add wrapper event types and event ledger persistence.

  **What:** Create `GeminiInvocationEvent` struct and `GeminiEventLedger` class in `GeminiTypes.swift`. The event captures derived metrics only (timestamps, mode, model, limitHit flag). The ledger appends JSONL to `~/Library/Application Support/ClaudeUsage/gemini-events.jsonl` and supports read-back with rolling window trim.

  **File to modify: `ClaudeUsage/Models/GeminiTypes.swift`**

  Add after existing types (mirrors `CodexInvocationEvent` and `CodexEventLedger` in `CodexTypes.swift`):

  ```swift
  struct GeminiInvocationEvent: Codable, Equatable {
      let startTime: Date
      let endTime: Date
      let commandMode: String
      let model: String
      let limitHitDetected: Bool

      var duration: TimeInterval {
          endTime.timeIntervalSince(startTime)
      }
  }

  class GeminiEventLedger {
      let fileURL: URL

      init(fileURL: URL? = nil) {
          // Default: ~/Library/Application Support/ClaudeUsage/gemini-events.jsonl
      }

      func append(_ event: GeminiInvocationEvent) {
          // Encode event to JSON, append as single line to JSONL file
      }

      func readEvents() -> [GeminiInvocationEvent] {
          // Read file line by line, decode each, skip corrupt lines
      }

      func trim(windowSeconds: TimeInterval = 86400) {
          // Remove events older than windowSeconds, rewrite file
      }
  }
  ```

  **Also update `GeminiConfidenceEngine.evaluate()` signature** to accept an optional `wrapperEvents` parameter:
  ```swift
  func evaluate(detection: GeminiDetectionResult, events: [GeminiRequestEvent],
                plan: GeminiPlanProfile?, wrapperEvents: [GeminiInvocationEvent] = []) -> GeminiEstimate
  ```

  The body should incorporate wrapper events into confidence logic (mirror `CodexConfidenceEngine`):
  - 3+ wrapper events with `limitHitDetected` + plan → `.highConfidence`
  - Any wrapper events → upgrade from `.observedOnly` to `.estimated`
  - Never `.exact`

  **Acceptance criteria:**
  - `xcodebuild build` compiles
  - `GeminiWrapperEventTests` pass (3 tests)
  - `GeminiEventLedgerTests` pass (5 tests)
  - `GeminiPrivacyTests` pass (3 tests)
  - `GeminiWrapperConfidenceTests` may still fail (wrapper integration in adapter not yet wired)
  - All 78 existing tests still pass

- [x] Step 5.3: [automated] Implement Gemini wrapper launcher.

  **What:** Create `GeminiWrapper` class that launches the `gemini` CLI via `Foundation.Process`, captures start/end timestamps, parses stderr for rate-limit errors, and appends a `GeminiInvocationEvent` to the ledger. Also add `geminiAccuracyMode` toggle to `ProviderSettingsStore`.

  **Files to create:**
  - `ClaudeUsage/Services/GeminiWrapper.swift` — new file, ~82 lines mirroring `CodexWrapper.swift`

  **Files to modify:**
  - `ClaudeUsage/Models/ProviderSettingsStore.swift` — add accuracy mode methods
  - `ClaudeUsage.xcodeproj/project.pbxproj` — register `GeminiWrapper.swift` in app target

  ### Implementation Details

  **1. Create `ClaudeUsage/Services/GeminiWrapper.swift`**

  Mirror `CodexWrapper.swift` (82 lines) exactly, substituting Gemini types:

  ```swift
  import Foundation

  class GeminiWrapper {
      let ledger: GeminiEventLedger
      let geminiPath: String

      init(ledger: GeminiEventLedger, geminiPath: String? = nil) {
          if let path = geminiPath {
              self.geminiPath = path
          } else {
              self.geminiPath = GeminiWrapper.findGeminiPath() ?? "/usr/local/bin/gemini"
          }
          self.ledger = ledger
      }

      func launch(arguments: [String]) throws -> GeminiInvocationEvent {
          let startTime = Date()
          let process = Process()
          process.executableURL = URL(fileURLWithPath: geminiPath)
          process.arguments = arguments
          let stderrPipe = Pipe()
          process.standardError = stderrPipe
          try process.run()
          process.waitUntilExit()
          let stderrData = stderrPipe.fileHandleForReading.readDataToEndOfFile()
          let stderrOutput = String(data: stderrData, encoding: .utf8) ?? ""
          let endTime = Date()
          let limitHit = stderrOutput.contains("rate limit") || stderrOutput.contains("usage limit")
          let commandMode = arguments.first ?? "unknown"
          let model = extractModel(from: arguments)
          let event = GeminiInvocationEvent(
              startTime: startTime, endTime: endTime,
              commandMode: commandMode, model: model, limitHitDetected: limitHit)
          try ledger.append(event)
          return event
      }

      private func extractModel(from arguments: [String]) -> String {
          guard let idx = arguments.firstIndex(of: "--model"),
                idx + 1 < arguments.count else { return "default" }
          return arguments[idx + 1]
      }

      private static func findGeminiPath() -> String? {
          let process = Process()
          process.executableURL = URL(fileURLWithPath: "/usr/bin/which")
          process.arguments = ["gemini"]
          let pipe = Pipe()
          process.standardOutput = pipe
          process.standardError = FileHandle.nullDevice
          do {
              try process.run()
              process.waitUntilExit()
              guard process.terminationStatus == 0 else { return nil }
              let data = pipe.fileHandleForReading.readDataToEndOfFile()
              return String(data: data, encoding: .utf8)?
                  .trimmingCharacters(in: .whitespacesAndNewlines)
          } catch { return nil }
      }
  }
  ```

  **2. Add to `ProviderSettingsStore.swift`** (after `setCodexAccuracyMode` at ~line 64):

  ```swift
  func geminiAccuracyMode() -> Bool {
      UserDefaults.standard.bool(forKey: "provider_gemini_accuracy_mode")
  }
  func setGeminiAccuracyMode(_ enabled: Bool) {
      UserDefaults.standard.set(enabled, forKey: "provider_gemini_accuracy_mode")
  }
  ```

  **3. Update `project.pbxproj`** — add `GeminiWrapper.swift` to app target:
  - PBXBuildFile: `AA000041` → fileRef `AA100044`
  - PBXFileReference: `AA100044` — `GeminiWrapper.swift`
  - PBXGroup Services children: add after `AA100043 /* GeminiEventLedger.swift */`
  - App Sources build phase (AA800001): add `AA000041`

  **Acceptance criteria:**
  - `xcodebuild build -scheme ClaudeUsage -destination 'platform=macOS'` compiles
  - `xcodebuild test -scheme ClaudeUsage -destination 'platform=macOS'` — all 93 tests pass, 0 failures
  - No new tests in this step (wrapper launcher tested indirectly via Step 5.2 types)

- [ ] Step 5.4: [automated] Wire wrapper events into GeminiAdapter and add Accuracy Mode UI.

  **What:** Merge wrapper-derived events into `GeminiAdapter.refresh()` — feed ledger events alongside passive parser events into `GeminiConfidenceEngine`. Surface Accuracy Mode toggle in SettingsView.

  **File to modify: `ClaudeUsage/Services/GeminiAdapter.swift`**

  Changes (mirror Codex adapter pattern):
  1. Add `let ledger: GeminiEventLedger` property
  2. In `init`: create ledger instance
  3. In `refresh()`: read wrapper events from ledger, pass to `confidenceEngine.evaluate(..., wrapperEvents:)`

  ```swift
  func refresh() {
      let detection = detector.detect()
      guard detection.installStatus == .installed else {
          state = .notInstalled
          return
      }
      let events = parser.parseSessionFiles()
      let wrapperEvents = ledger.readEvents()
      let estimate = confidenceEngine.evaluate(
          detection: detection, events: events,
          plan: planProfile, wrapperEvents: wrapperEvents)
      state = .installed(estimate: estimate)
  }
  ```

  **File to modify: `ClaudeUsage/Views/SettingsView.swift`**

  Add Accuracy Mode toggle under Gemini section (mirror Codex UI at ~lines 242-257):
  ```swift
  if providerSettingsStore.isEnabled(.gemini) && providerShellViewModel.geminiDetected {
      HStack {
          Text("  Accuracy Mode")
          Spacer()
          Text(providerSettingsStore.geminiAccuracyMode() ? "Active" : "Off")
          Toggle("", isOn: Binding(
              get: { providerSettingsStore.geminiAccuracyMode() },
              set: { providerSettingsStore.setGeminiAccuracyMode($0) }
          ))
      }
  }
  ```

  **Acceptance criteria:**
  - `xcodebuild build` compiles
  - `GeminiWrapperConfidenceTests` pass (4 tests) — wrapper events now flow through adapter
  - All 78 existing tests still pass
  - Settings shows Gemini Accuracy Mode toggle when Gemini is enabled + detected

## Green
- [ ] Step 5.5: [automated] Make all Gemini wrapper tests pass, rerun all Phase 1-4 tests, verify no regressions.

  **What:** Final green-phase verification for Phase 5. All tests should already pass as of Step 5.4. This step is a verification gate — run the full suite, confirm no regressions, and mark Phase 5 milestone complete.

  **Steps:**
  1. Run `xcodebuild build -scheme ClaudeUsage -destination 'platform=macOS'` — confirm clean compile
  2. Run `xcodebuild test -scheme ClaudeUsage -destination 'platform=macOS'` — confirm ~93 pass (78 existing + ~15 new), 0 fail
  3. Verify no changes to `UsageService.swift`, `UsageViewModel.swift` (Claude untouched)
  4. Verify no changes to `CodexWrapper.swift`, `CodexAdapter.swift` (Codex untouched)
  5. Verify passive-only Gemini path still works (GeminiConfidenceEngine with empty wrapperEvents)
  6. Check all milestone criteria and mark complete
  7. Mark Phase 5 complete in `tasks/roadmap.md`

  **Acceptance criteria:**
  - All GeminiWrapperTests pass (~15 tests)
  - All 78 existing tests still pass
  - `xcodebuild build` compiles cleanly
  - No changes to Claude or Codex adapter code
  - Passive-only Gemini still works (wrapperEvents defaults to empty array)

## Milestone
- [ ] Gemini Accuracy Mode can be enabled independently.
- [ ] Structured wrapper telemetry improves Gemini request counting and freshness.
- [ ] Passive-only Gemini usage remains fully supported.
- [ ] All Phase 5 tests pass.
- [ ] No regressions in previous phase tests.
