# ClaudeUsage — Session History

## 2026-04-15 — Step 2.1: Electron Claude Phase 2 Red Tests

Added Phase 2 red-phase Vitest coverage for the Electron app: Claude usage API request/parsing/session rotation, account metadata CRUD and active-account normalization, account-scoped credential secret persistence, polling cadence/backoff/reset/auth-expired behavior, typed IPC service wiring and sanitization, and Claude usage schema contracts. No production Phase 2 behavior was implemented in this step.

Validation: `npm run typecheck` passed from `electron-app/`. Existing foundation tests passed with `npm test -- --run src/foundation-main.test.ts src/foundation-storage.test.ts src/foundation-schemas.test.ts src/foundation-renderer.test.tsx src/scaffold.test.ts` (5 files, 22 tests). Full `npm test -- --run` fails as expected with 17 red-phase failures for missing `claudeUsage.js`, `accounts.js`, `polling.js`, missing `createClaudeCredentialStore`, placeholder IPC not calling durable services, and the connection-result schema not yet accepting `connected`. Accepted warning: Node's experimental SQLite warning during account tests.

## 2026-04-15 — Step 1.9: Electron Runtime Foundation Verification

Completed the Phase 1 verification gate for the Electron app. `npm run typecheck`, `npm test`, and `npm run build` all passed from `electron-app/`; the test suite reported 5 passing files and 22 passing tests. Confirmed `dist-electron/main/app.js`, `dist-electron/preload/index.js`, and `dist/index.html` exist after build. Re-ran the renderer/shared forbidden-import scan with no matches. Ran a bounded `npm run dev` smoke: Vite started on `127.0.0.1:5173`, the Electron main build completed, Electron stayed running without startup error output, and all smoke processes were stopped afterward.

Phase 1 is archived in `tasks/phases/phase-1.md`. Phase 2 is now active in `tasks/todo.md`, starting with red-phase tests for Claude exact usage and account workflows. Future manual validation tasks were preserved in `tasks/roadmap.md` under the later phases where they apply; there is no active `tasks/manual-todo.md` for Phase 2.

## 2026-04-15 — Step 1.7: Electron React Renderer Entries

Added minimal React renderer routes for the Electron foundation. The single Vite entry now routes by Electron window hash to popover, settings, onboarding, and overlay views. Shared renderer components load usage state, settings, and accounts only through the typed `window.claudeUsage` preload API. Settings includes write-only credential inputs that clear the session key after save and never render stored secrets. The renderer styling now covers stable minimal layouts for all four shell windows.

Validation: `npm run typecheck`, `npm test -- --run`, and `npm run build` passed from `electron-app/`. A source scan confirmed renderer/shared code has no direct Electron, Node, filesystem, crypto, child-process, or main-storage imports. No warnings emitted.

## 2026-04-15 — Step 1.5: Electron IPC Registration and Validation Skeleton

Added the main-process IPC skeleton for the Electron app. `electron-app/src/main/ipc.ts` now registers allowlisted handlers for usage, settings, accounts, Claude credential/test placeholders, provider diagnostics/detection, wrapper setup/verification, and diagnostics export. Incoming payloads are validated with shared Zod schemas, response shapes are validated before returning, placeholder state remains secret-free, and credential payloads are never echoed to renderer responses. `electron-app/src/main/app.ts` registers handlers on startup and disposes them on quit. The preload API now exposes the expanded command surface through allowlisted `ipcRenderer.invoke` calls plus validated usage-update subscription handling.

Validation: `npm run typecheck`, `npm test -- --run`, and `npm run build` passed from `electron-app/`. A source scan confirmed renderer/shared code has no direct Electron, Node, or filesystem imports. `dist-electron/preload/index.js` exists after build. No warnings emitted.

## 2026-04-15 — Step 1.3: Electron Main-Process Runtime Foundation

Replaced the Electron placeholder main window with a secure runtime shell. Added single-instance lock handling, app lifecycle wiring, second-instance focus behavior, activation handling, and startup orchestration in `electron-app/src/main/app.ts`. Added `AppWindowManager` in `electron-app/src/main/windows.ts` for popover, settings, overlay, and onboarding windows with secure defaults (`contextIsolation`, sandboxing, no Node integration), preload path resolution, guarded navigation, hidden-until-ready loading, and Vite/dev versus packaged renderer loading. Added `TrayController` in `electron-app/src/main/tray.ts` with a generated tray icon, context menu skeleton actions, tray click behavior, and Linux tray fallback status reporting.

Validation: `npm run typecheck`, `npm test -- --run`, and `npm run build` passed from `electron-app/`. A smoke check confirmed `dist-electron/main/app.js`, `dist-electron/preload/index.js`, and `dist/index.html` exist after build. No warnings emitted.

## 2026-04-15 — Step 1.2: Electron Module Layout and Shared Placeholders

Moved the Electron scaffold from flat `src/main.ts`, `src/preload.ts`, `src/renderer.tsx`, and `src/styles.css` entries into the spec-aligned `src/main/`, `src/preload/`, `src/renderer/`, and `src/shared/` layout. Added placeholder main-process modules for windows, tray, and IPC channels; a typed preload API placeholder; renderer submodule placeholders; and shared type/schema placeholders for accounts, usage state, provider cards, settings, and IPC payloads. Updated package/config entry paths and fixed the Vite/Vitest config typing by importing `defineConfig` from `vitest/config`.

Validation: `npm run typecheck`, `npm test -- --run`, and `npm run build` passed from `electron-app/`. No warnings emitted.

## 2026-04-15 — Step R.7: Gemini Auth and Plan Controls

Replaced the read-only Gemini plan row in macOS Settings with live Auth Mode and Plan pickers. Added Gemini plan presets, raw-value auth-mode persistence, selected-auth override support in `GeminiConfidenceEngine`, and `ProviderShellViewModel.updateGeminiSettings(...)` so Gemini plan/auth changes refresh the running adapter without restart. Added regression coverage for preset lookup, settings persistence, confirmed auth overriding passive detection, and adapter refresh using selected settings.

Validation: `xcodebuild test -scheme ClaudeUsage -destination 'platform=macOS' -only-testing:ClaudeUsageTests/GeminiSettingsTests` passed 4 tests; `xcodebuild test -scheme ClaudeUsage -destination 'platform=macOS'` passed 119 tests. Accepted Xcode environment warnings: duplicate macOS destination selection, AppIntents metadata extraction skipped because the app has no AppIntents dependency, and XCTest deployment-target linker warnings.

## 2026-04-15 — Step R.1: Red Phase — Tauri Tray Menu Command Regression Tests

Added a testable tray-menu action boundary in `tauri-app/src-tauri/src/lib.rs` while preserving the current runtime behavior. Added three red-phase Rust tests proving the current `Refresh Now` and `Toggle Overlay` menu paths still emit unused `trigger-refresh` / `trigger-toggle-overlay` frontend events instead of invoking backend refresh and overlay behavior.

Validation: `cargo test tray` in `tauri-app/src-tauri/` fails as expected with 3 red-phase failures: `tray_refresh_menu_uses_backend_refresh_action`, `tray_toggle_overlay_menu_uses_backend_overlay_action`, and `tray_menu_does_not_emit_unused_frontend_events`. The run also emits four unrelated existing dead-code warnings from `provider_types.rs`; accepted for this red-phase scope.

## 2026-04-11 — Bugfix: todayUsagePercent pre-midnight baseline

Fixed `todayUsagePercent` in `UsageViewModel.swift` to prefer the last pre-midnight snapshot as baseline instead of only looking at today's snapshots. Previously, fresh app launches showed 0% because the first snapshot IS the current reading (delta=0). Now uses pre-midnight history (up to 24h stored in `historySnapshots`) to compute a meaningful delta since midnight. Falls back to earliest-today snapshot for fresh installs.

## 2026-04-11 — Step 7.5: Audit Parity Gaps and Document Them

Created `docs/cross-platform-parity.md` with full feature matrix (44 features across 9 categories). Summary: 25 ported, 11 gaps (macOS-only), 6 deferred (types only, no adapter logic), 1 Tauri-only, 1 N/A. Key gaps: live countdown timer, session reset notification, auto-fetch at reset, usage history/sparklines, pace emoji themes. Updated `tauri-app/README.md` with multi-provider status section noting Claude provider is live, Codex/Gemini adapters deferred, and linking to parity doc. No code changes.

## 2026-04-11 — Step 7.4: Wire Provider Coordinator into AppState

Added `to_card()` method on `ProviderSnapshot` converting each variant to a `ProviderCard` with appropriate `CardState`, headline, utilization, and confidence. Added `provider_cards: Option<Vec<ProviderCard>>` to `UsageState`. Updated `compute_usage_state()` to build Claude provider cards: `ClaudeRich` when usage data exists, `ClaudeSimple` when auth configured but no data, `None` when not configured. Cards flow to frontend via existing `get_usage` command and `usage-updated` event. 17 Rust tests pass, frontend compiles clean.

## 2026-04-11 — Step 7.3: Frontend Provider Cards — TypeScript Types + Card Rendering

Added TypeScript types (`ProviderId`, `CardState`, `ConfidenceLevel`, `ProviderCard`) to `types.ts` matching Rust serde serialization. Extended `UsageState` with optional `provider_cards`. Added `renderProviderCard()` in `main.ts` with provider name mapping, mini usage bars, confidence badges, and stale/degraded/missing_configuration visual states. Added CSS for `.provider-card`, `.confidence-badge`, `.stale-badge`, `.degraded-badge`. Progressive enhancement — cards only render when `provider_cards` is non-null. `npm run build` compiles clean.

## 2026-04-11 — Step 7.2: Green Phase — Implement Provider Type Methods

Filled in three `todo!()` stubs in `provider_types.rs`: `ProviderSnapshot::id()` (match on variant → ProviderId), `ConfidenceLevel::explanation()` (keyword-matched strings matching Swift counterpart), `ShellState::tray_provider()` (first Configured card). All 17 Rust tests pass (15 provider_types + 2 api), 0 failures.

## 2026-04-11 — Step 6.5: Phase 6 Verification Gate (Complete)

Final green-phase gate for Phase 6: Onboarding, Diagnostics, and Product Hardening. Build succeeded, 108 tests pass with 0 failures across 27 test suites. All 5 milestones confirmed: confidence explanations surface for all providers, stale/degraded states handled gracefully, documentation matches the multi-provider product, all Phase 6 tests pass, no regressions in Phases 1–5 tests. Phase 6 complete.

## 2026-04-11 — Step 6.4: Multi-Provider Documentation Update

Updated README.md to document the multi-provider product. Changed app description to mention Claude, Codex CLI, and Gemini CLI. Added "Multi-provider monitoring" row to features table. Added new "Multi-Provider Monitoring" section with provider detection table, confidence levels (Exact/High Confidence/Estimated/Observed Only), and Accuracy Mode explanation. Updated Settings section with provider toggles, plan profiles, and Accuracy Mode entries. Added passive monitoring note and Codex/Gemini trademark acknowledgments to disclaimer. No code changes — build compiles clean.

## 2026-04-11 — Step 6.3: Confidence Explanations & Onboarding Copy

Replaced stub `explanation(for:)` in `CodexConfidenceEngine` with real switch returning keyword-matched strings (plan, wrapper, limit). Added matching `explanation(for:)` to `GeminiConfidenceEngine`. Added `confidenceExplanation: String?` to `ProviderCard`, populated from confidence engines for codexRich/geminiRich cases, preserved in stale-tracking overload. Updated `ProviderCardView` to show explanation as `.caption` text. Added detection helper text in `SettingsView` for Codex/Gemini "Not Detected" state. 108 tests pass, 0 failures.

## 2026-04-11 — Step 6.2: Adapter Diagnostics — Stale Tracking, Degraded States, Failure Counting

Implemented production code for 12 Phase 6 tests. CodexAdapter/GeminiAdapter: added `lastRefreshTime`, `consecutiveFailures`, `.degraded(reason:)` state with do/catch error tracking in `refresh()` (degraded after 3 consecutive parse failures, recovery on success). ProviderTypes: added `.stale` CardState, `staleThreshold=300`, `makeShellState(providers:now:refreshTimes:)` overload, `isDegraded` on ProviderSnapshot, tray rotation filters degraded providers. ProviderShellViewModel: added `formatDegradedTrayText`/`formatStaleText` static methods, degraded handling in `formatTrayText`. Added stub `explanation(for:)` on CodexConfidenceEngine so ConfidenceExplanationTests compile (fail at assertion, Step 6.3 scope). 105/108 tests pass, 3 expected failures.

## 2026-04-10 — Step 6.1: Red Phase — Failing Tests for Diagnostics & Hardening

Created `ClaudeUsageTests/DiagnosticsTests.swift` with 15 red-phase tests across 4 classes: AdapterDiagnosticsTests (5 — lastRefreshTime, consecutiveFailures, degraded state, recovery), StaleDetectionTests (4 — stale card state, threshold, tray indicator), ConfidenceExplanationTests (3 — explanation API for observedOnly/estimated/highConfidence), TrayEdgeCaseTests (3 — degraded tray text, all-disabled fallback, rotation skips degraded). Registered in pbxproj. App target builds clean. Test target fails to compile with 22 expected errors referencing not-yet-existing properties (red phase confirmed). 93 existing tests unaffected.

## 2026-04-10 — Step 5.5: Phase 5 Verification Gate (Complete)

Final green-phase verification gate for Phase 5 (Gemini Accuracy Mode Wrapper). Build succeeds, 93 tests pass (78 existing + 15 Gemini wrapper), 0 failures. Claude files (`UsageService.swift`, `UsageViewModel.swift`) untouched. Codex files (`CodexWrapper.swift`, `CodexAdapter.swift`) untouched. Passive-only path confirmed via `wrapperEvents: [GeminiInvocationEvent] = []` default. All 5 milestone criteria met. Phase 5 complete.

## 2026-04-10 — Step 5.4: Wire GeminiAdapter Ledger + Accuracy Mode UI

Wired `GeminiEventLedger` into `GeminiAdapter`: added `ledger` property, `ledgerDirectory` init param, reads wrapper events in `refresh()` and passes to `confidenceEngine.evaluate(wrapperEvents:)`, trims ledger to 48h window. Added Accuracy Mode toggle to `SettingsView` after Gemini Plan row, mirroring Codex pattern. Build succeeds, 93 tests pass, 0 failures.

## 2026-04-10 — Step 5.3: Gemini Wrapper Launcher

Created `GeminiWrapper.swift` mirroring `CodexWrapper.swift` — launches `gemini` CLI via `Foundation.Process`, captures start/end timestamps, parses stderr for "rate limit"/"usage limit", extracts model from `--model` flag, appends `GeminiInvocationEvent` to `GeminiEventLedger`. Added `geminiAccuracyMode()`/`setGeminiAccuracyMode(_:)` to `ProviderSettingsStore`. Registered in pbxproj. Build succeeds, 93 tests pass, 0 failures.

## 2026-04-10 — Step 5.2: Gemini Wrapper Event Types and Event Ledger

Created `GeminiInvocationEvent` struct (Codable, Equatable) and `GeminiEventLedger` class in separate files. Updated `GeminiConfidenceEngine.evaluate()` to accept `wrapperEvents:` parameter with confidence upgrade logic. Registered `GeminiEventLedger.swift` in pbxproj. 93 tests pass, 0 failures.

## 2026-04-10 — Step 5.1: Red Phase — Failing Tests for Gemini Wrapper

Created `GeminiWrapperTests.swift` with 15 tests across 4 classes (GeminiWrapperEventTests: 3, GeminiEventLedgerTests: 5, GeminiWrapperConfidenceTests: 4, GeminiPrivacyTests: 3). Tests define the full Gemini Accuracy Mode wrapper contract: invocation event model, JSONL event ledger persistence, confidence upgrades from wrapper data, and privacy constraints. All tests reference not-yet-existing types (`GeminiInvocationEvent`, `GeminiEventLedger`, `wrapperEvents:` parameter on `GeminiConfidenceEngine`). Test target fails to compile (expected red phase). App target builds clean. 78 existing tests unaffected.

## 2026-04-10 — Step 4.5: Wire GeminiAdapter into Shell + Settings UI

Wired live `GeminiAdapter` into `ProviderShellViewModel`: added `geminiAdapter` property with 15s polling timer, subscribed to state changes for `rebuildFromCurrent()`, added `geminiDetected` computed property, replaced hardcoded `.gemini(status: .missingConfiguration)` placeholder with `geminiAdapter.toProviderSnapshot(...)`. Updated `SettingsView` to show "Detected"/"Not Detected" status for Gemini (replacing "Coming in Phase 2") and conditional Plan display row when enabled + detected. Build succeeds, 78 tests pass, 0 failures.

## 2026-04-10 — Step 4.4: Gemini Confidence Engine + Adapter Orchestrator

Replaced `fatalError()` stub in `GeminiConfidenceEngine.evaluate()` with confidence logic: extracts authMode from detection, computes ratePressure from events (with/without plan), applies rules (highConfidence when auth+plan+events, estimated when auth+events, observedOnly otherwise, never exact in passive mode). Added `Equatable` to `GeminiEstimate` and `GeminiRatePressure`. Created `GeminiAdapter.swift` orchestrator (detect→parse→evaluate→state). Added `.geminiRich` case to `ProviderSnapshot` with full switch coverage in `ProviderCoordinator` and `ProviderShellViewModel`. Added Gemini plan/auth settings to `ProviderSettingsStore`. Registered `GeminiAdapter.swift` in pbxproj. 78 tests pass (4 new GeminiConfidence), 0 failures.

## 2026-04-10 — Step 4.3: Gemini Session Parser + Rate Pressure

Replaced 3 `fatalError()` stubs in `GeminiActivityParser.swift` with real implementations. `parseSessionFiles()` enumerates `geminiHome/tmp/*/chats/*.json`, parses session JSON, filters gemini-type messages, extracts timestamp/tokens/model into `GeminiRequestEvent` records. `GeminiRatePressure` inits compute daily request count (24h window), RPM (5min window / 5.0), and optional daily headroom against plan limits. 74 tests pass (9 new Gemini tests: 5 parsing + 4 rate pressure), 4 confidence stubs remain.

## 2026-04-10 — Step 4.2: Gemini Install/Auth Detection + Type Stubs

Created `GeminiDetector.swift` with real install/auth detection logic (settings.json presence → install status, security.auth.selectedType → auth mode, oauth_creds.json → authenticated). Created `GeminiActivityParser.swift` and `GeminiTypes.swift` as stubs (fatalError bodies) so the test target compiles. Added all 3 files to pbxproj. 4 GeminiDetectionTests pass, 65 total tests pass, 13 Gemini stub tests expected to fail at runtime.

## 2026-04-10 — Step 4.1: Red Phase — Failing Tests for Gemini Passive Adapter

Created `GeminiAdapterTests.swift` with 17 tests across 4 classes (GeminiDetectionTests: 4, GeminiActivityParsingTests: 5, GeminiRatePressureTests: 4, GeminiConfidenceTests: 4). Tests define the full Gemini passive adapter contract: install/auth detection, session file parsing with token/model extraction, rate pressure computation, and confidence evaluation. All tests reference not-yet-existing types — test target fails to compile (expected red phase). App target builds clean. Added file to pbxproj test target.

## 2026-04-10 — Step 3.5: Green Phase — Phase 3 Complete

Verified all 61 tests pass (0 failures): 15 wrapper tests (CodexWrapperEventTests: 3, CodexEventLedgerTests: 5, CodexWrapperConfidenceTests: 4, CodexPrivacyTests: 3) + 46 pre-Phase-3 tests. No regressions. All Phase 3 milestone criteria met. Marked Phase 3 complete in todo.md and roadmap.md.

## 2026-04-10 — Step 3.4: Merge Wrapper Telemetry into Confidence Engine + Accuracy Mode UI

Wired wrapper events into `CodexConfidenceEngine.evaluate()`: 3+ limit hits with a plan yields `.highConfidence`, any non-empty wrapper events yield `.estimated` — checked before existing passive-only logic. Added `CodexEventLedger` to `CodexAdapter` with `wrapperEventCount` tracking; `refresh()` reads wrapper events from ledger, passes to engine, and trims events older than 48h. Added Accuracy Mode toggle to `SettingsView` (conditional on Codex enabled + detected).

Build succeeds. All 61 tests pass, 0 failures. The 3 previously-expected failures (confidence tests) now pass.

## 2026-04-10 — Step 3.3: Implement Codex Wrapper Launcher

Created `ClaudeUsage/Services/CodexWrapper.swift` — utility class that launches `codex` CLI via `Process`, captures stderr for rate/usage limit detection, records `CodexInvocationEvent` to ledger. Extracts commandMode from first argument, model from `--model` flag. Default codex path resolved via `/usr/bin/which codex`. Privacy-safe: no stdin/stdout capture. Added `codexAccuracyMode()` / `setCodexAccuracyMode(_:)` to `ProviderSettingsStore` backed by UserDefaults. Registered `CodexWrapper.swift` in Xcode project (AA100036 file ref, AA000033 build file).

Build succeeds. 61 tests total, 3 expected failures (confidence engine wrapperEvents logic deferred to Step 3.4). 0 unexpected failures.

## 2026-04-09 — Step 3.2: Implement Wrapper Event Types and Event Ledger

Added `CodexInvocationEvent` struct (Codable, Equatable) to `CodexTypes.swift` with start/end timestamps, commandMode, model, limitHitDetected, and computed duration. Created `CodexEventLedger` class in `ClaudeUsage/Services/CodexEventLedger.swift` with JSONL append/read/trim and `defaultDirectory` pointing to `~/Library/Application Support/ClaudeUsage/`. Added `wrapperEvents:` defaulted parameter to `CodexConfidenceEngine.evaluate()` so confidence tests compile (logic deferred to Step 3.4). Registered new file in Xcode project.

Build succeeds. 58 tests pass, 3 expected failures (confidence tests awaiting Step 3.4 engine logic). 0 unexpected failures.

## 2026-04-09 — Fix Phase 1 Gap: Wire Tray Rotation into Menu Bar

Wired the existing rotation infrastructure (`ProviderCoordinator.selectedTrayProvider`, `ProviderTrayPolicy`, `traySnapshot`) into the actual menu bar label. Previously `menuBarText` was hardcoded to Claude-only data even though rotation types existed.

Changes:
- Changed default rotation interval from 300s to 7s (spec line 350) in `ProviderTypes.swift` and `ProviderShellViewModel.loadPolicy()` fallback.
- Added `@Published trayText`, `rotationTimer` (7s), and `formatTrayText(from:)` to `ProviderShellViewModel`. Formats compact tray strings per provider type (e.g., "Codex High", "Claude 82%", "Gemini · Not configured").
- Replaced `menuBarText` in `ClaudeUsageApp` with dual-mode logic: Claude-only mode preserves the existing rich format (no regression); multi-provider mode shows compact Claude with live countdown on Claude's turn, or `trayText` on other providers' turns.

Build succeeds. All 46 tests pass, 0 failures.

## 2026-04-09 — Step 2.6: Green Phase — Fix Crashing Test

Fixed `testGraphQLUsesVariablesNotInterpolation` crash caused by `URLProtocol` converting `httpBody` to a stream. Added `capturedBody` static property to `MockURLProtocol` that reads from `httpBodyStream` when `httpBody` is nil. Updated the test to use `MockURLProtocol.capturedBody!` instead of `captured.httpBody!`. All 46 tests pass (15 Codex + 5 ProviderShell + 26 existing), 0 failures. Test-only change — no production code modified.

## 2026-04-09 — Step 2.5: Wire Codex Adapter into Provider Shell

Created `ClaudeUsage/Services/CodexAdapter.swift` — orchestrator class tying `CodexDetector` + `CodexActivityParser` + `CodexConfidenceEngine` together. Publishes `CodexAdapterState` (.notInstalled / .installed with estimate + cooldown). Added `.codexRich(estimate:isEnabled:)` case to `ProviderSnapshot` with full `id`, `isEnabled`, and `makeShellState` handling in `ProviderTypes.swift`. Wired `CodexAdapter` into `ProviderShellViewModel` with 15s refresh timer, Combine subscription to `$state`, `codexDetected` computed property, and `deinit` cleanup. Added `codexPlan()` / `setCodexPlan(_:)` to `ProviderSettingsStore` for UserDefaults persistence. Updated `SettingsView` to accept `providerShellViewModel` and show dynamic "Detected"/"Not Detected" for Codex row (was "Coming in Phase 2"). Updated `ContentView` to pass `providerShellViewModel` to `SettingsView`. Registered `CodexAdapter.swift` in Xcode project (AA100033 file ref, AA000029 build file, Services group, app Sources build phase). Build succeeds. All 15 Codex + 5 ProviderShell + 11 other tests pass (21 total, 0 failures). Pre-existing `testGraphQLErrorResponseThrowsInvalidResponse` crash (httpBody force-unwrap) unrelated to this change.

## 2026-04-09 — Step 2.4: Codex Confidence Engine & Plan Profiles

Created `ClaudeUsage/Models/CodexTypes.swift` with `CodexPlanProfile` (name + dailyTokenLimit), `CodexConfidence` enum (exact/highConfidence/estimated/observedOnly), `CodexEstimate` (wraps confidence), `CooldownStatus` (cooldownActive bool), and `CodexConfidenceEngine` class. Engine's `evaluate()` returns highConfidence when recentResets >= 3 with a plan, estimated when events exist with a plan, observedOnly otherwise. `cooldownStatus()` checks for limitHit events within a 300s threshold. Added to Xcode project (AA100032 file ref, AA000028 build file, Models group, app Sources build phase). Build succeeds. All 15 Codex tests now pass (4 detection + 5 parsing + 3 cooldown + 3 confidence). Pre-existing `testCompactDownsamplesMidRange` failure unrelated to this change.

## 2026-04-09 — Step 2.3: Codex JSONL Activity Parser

Created `ClaudeUsage/Services/CodexActivityParser.swift` with `CodexEventType` enum, `CodexActivityEvent`/`ParseBookmark`/`ActivityWindow` structs, and `CodexActivityParser` class. Parser handles: full and incremental JSONL history parsing via `FileHandle` with byte-offset bookmarks, session file parsing with duration computation from session_start→session_end timestamps, single log line parsing with rate-limit→`.limitHit` detection, and time-bucketed activity windowing. Gracefully skips blank/malformed lines. Added to Xcode project (AA100031 file ref, AA000027 build file). App builds cleanly. Test target still blocked by step 2.4 types (`CodexConfidenceEngine`, `CodexPlanProfile`). Once those exist, 10 Codex tests should pass (4 detection + 5 parsing + 1 cooldown).

## 2026-04-09 — Step 2.2: Codex Install/Auth Detection Service

Created `ClaudeUsage/Services/CodexDetector.swift` with `CodexInstallStatus` (.installed/.notInstalled), `CodexAuthStatus` (.authPresent/.authAbsent), `CodexDetectionResult`, and `CodexDetector` class. Detector checks `config.toml` for install status and `auth.json` for auth status within a configurable `codexHome` URL. Uses injectable `FileManager` for testability. Added to Xcode project (AA100029 file ref, AA000026 build file, Services group, app Sources build phase). App builds cleanly. Test target doesn't compile yet — remaining 11 Codex tests reference types from steps 2.3–2.4 (CodexActivityParser, CodexActivityEvent, CodexConfidenceEngine, CodexPlanProfile). The 4 CodexDetectionTests will pass once the test target compiles.

## 2026-04-09 — Step 2.1: Red-Phase Codex Adapter Tests

Created `ClaudeUsageTests/CodexAdapterTests.swift` with 15 fixture-based tests across 4 test classes defining the Codex passive adapter contract. CodexDetectionTests (4): install/auth detection via temp directories. CodexActivityParsingTests (5): JSONL parsing, incremental bookmarks, corrupt line handling, activity windows. CodexCooldownTests (3): rate-limit detection, cooldown active/expired. CodexConfidenceTests (3): observedOnly/estimated/highConfidence confidence levels. Added file to Xcode test target (pbxproj). App target builds cleanly; test target fails with expected missing-type errors (CodexDetector, CodexActivityParser, CodexActivityEvent, CodexConfidenceEngine, CodexDetectionResult, CodexPlanProfile) confirming red phase.

## 2026-04-09 — Step 1.5: Provider Settings UI & Enablement Store

Created `ProviderSettingsStore.swift` — lightweight ObservableObject persisting per-provider enabled state to UserDefaults. Claude always returns true; Codex/Gemini default to disabled. Added "Providers" section to SettingsView with 3 rows: Claude (always-on disabled toggle, "Configured"), Codex/Gemini (toggleable, "Coming in Phase 2"). Wired `ProviderSettingsStore` through `ClaudeUsageApp` → `ProviderShellViewModel` (subscribes to `$enabledProviders` for reactive rebuilds) and → `ContentView` → `SettingsView`. Toggling Codex/Gemini persists to UserDefaults and affects popover card dimming and tray rotation. Build succeeds, all 21 tests pass.

## 2026-04-09 — Step 1.4: Wire ProviderShellViewModel into UI

Wired `ProviderShellViewModel` into the app's UI layer. Created `ProviderCardView.swift` — compact card view with status dot (green/gray/orange), headline, optional detail text, and session utilization badge. Dimmed opacity for unconfigured providers. Added `@StateObject providerShellViewModel` to `ClaudeUsageApp`, initialized from the existing `UsageViewModel`. Added collapsible "Providers" `DisclosureGroup` section to `ContentView` (collapsed by default, between usage bars and History). Shows 3 provider cards: Claude configured, Codex/Gemini not configured. Existing Claude UI unchanged. Build succeeds, all 21 tests pass.

## 2026-04-09 — Step 1.3: Provider Shell View Model

Verified pre-existing `ProviderShellViewModel.swift` implementation. The file was already created and added to the Xcode project (pbxproj). It bridges `UsageViewModel` to the provider shell by subscribing to `$usageData` and `$authStatus` via Combine, building `[ProviderSnapshot]` arrays (Claude from current usage, Codex/Gemini as disabled placeholders), and producing `ShellState` and `traySnapshot` via `ProviderCoordinator`. Exposes `setManualOverride`, `setPinnedProvider`, `clearOverrides` with UserDefaults persistence. Fixed pre-existing flaky test `testWeeklyPaceStatusBehindPaceInPaceAwareMode` — ratio was exactly on 0.6 boundary causing timing-dependent flip between `behindPace`/`wayBehind`; changed test from 30% to 35% utilization (ratio 0.7, clearly in behindPace range). Build succeeds, all 21 tests pass.

## 2026-04-08 — Step 1.2: Provider Domain Types

Created `ClaudeUsage/Models/ProviderTypes.swift` with all provider-aware domain types: `ProviderId`, `ProviderStatus`, `AuthStatus`, `CardState` enums; `ProviderSnapshot` enum with static factory methods for two `claude(...)` overloads (rich with UsageData, simple with ProviderStatus); `ProviderCard` struct, `ShellState` struct, `ProviderTrayPolicy` struct; `ProviderCoordinator` class with `makeShellState` and `selectedTrayProvider` logic (pinned > override > rotation priority). Added to Xcode project. Fixed test file missing `throws` on `testClaudeSnapshotPreservesExistingUsageViewModelOutput`. All 5 provider shell tests pass.

## 2026-04-08 — Verify Red-Phase Provider Shell Tests

Confirmed Step 1.1 red-phase tests compile-fail as expected. `xcodebuild test` produces the right missing-type errors (`ProviderSnapshot`, `ProviderCoordinator`, `ProviderTrayPolicy`). Marked Step 1.1 complete in `tasks/todo.md`.

## 2026-04-08 — Reuse reqwest::Client (Tauri)

Moved `reqwest::Client` creation from per-request (`api.rs:45`) to a shared instance stored in `AppState`. The client's connection pool, DNS cache, and TLS session cache are now reused across all API calls.

- Added `http_client: reqwest::Client` to `AppState`, initialized once in `new()`
- Changed `fetch_usage()` signature to accept `&reqwest::Client` as first param
- `perform_fetch` (polling) and `refresh_now` (manual refresh) clone client from state
- `test_connection` uses a one-off client (no `AppState` access, called only during credential testing)
- Fixed pre-existing type mismatch: `tokio::task::JoinHandle` → `tauri::async_runtime::JoinHandle`

## 2026-04-07 — Phase 1 Step 1.1 Red Tests Added, Verification Blocked

Added the first provider-shell red-phase tests for the macOS shared provider foundation, but could not run the required macOS test command in this environment.

Key changes:

1. **Provider-shell test coverage** — added failing tests for provider aggregation, tray rotation, manual override precedence, provider pinning, and Claude non-regression mapping in `ClaudeUsageTests.swift`.
2. **Blocker recorded** — updated `tasks/todo.md` to keep Step 1.1 unchecked and note that `xcodebuild` is unavailable in this shell, so the red-phase test run could not be verified.
3. **No deploy performed** — no `deploy.md` exists and no explicit deploy was requested, so shipping remained source-control only.

## 2026-04-07 — Phase Plan for Multi-Provider CLI Monitor

Converted the approved multi-provider spec and high-level roadmap into an executable phased plan.

Key changes:

1. **Stepwise roadmap** — rewrote `tasks/roadmap.md` into a proper phase plan with summary, phase overview table, and `Tests First / Implementation / Green / Milestone` sections for all 7 phases.
2. **Active phase reset** — replaced the completed expert-review checklist in `tasks/todo.md` with Phase 1 only: shared provider foundation work for the macOS multi-provider product.
3. **Manual tasks isolated** — created `tasks/manual-todo.md` for human-only Codex/Gemini validation and wrapper-adoption tasks instead of mixing them into automated phase execution.
4. **Critical path clarified** — the plan now sequences shared provider shell first, then Codex passive, Codex wrapper, Gemini passive, Gemini wrapper, hardening, and finally Tauri/cross-platform follow-through.

## 2026-04-06 — Roadmap Reset for Multi-Provider CLI Monitor

Replaced the old Tauri/Windows-focused roadmap with a new macOS-first product roadmap based on the approved multi-provider spec.

Key changes:

1. **Project direction reset** — roadmap now treats the app as a multi-provider CLI usage monitor for Claude Code, Codex, and Gemini instead of continuing the older Claude-only/Tauri delivery plan.
2. **Claude preserved** — explicit roadmap constraint that the current Claude ingestion path must remain unchanged.
3. **Provider sequencing changed** — shared provider foundation first, then Codex passive adapter, Codex wrapper, Gemini passive adapter, and Gemini wrapper.
4. **Windows work deferred** — the unfinished Windows end-to-end test and broader Tauri follow-through were moved into a later cross-platform phase instead of remaining the active line of work.
5. **Kanban sync blocked** — Poketo kanban tooling is installed, but board operations could not run because `POKETOWORK_DATABASE_URL` is not configured in this shell.

## 2026-04-04 — Fix Windows Startup Crash (Lock Race Condition)

Fixed race condition causing the Tauri app to crash immediately on Windows (tray icon appears briefly then disappears).

1. **Reorder setup in `lib.rs`** — Moved overlay setup (`try_lock().expect()`) before `start_polling()`. Previously, the spawned polling task could acquire the lock before `try_lock()`, causing a panic.
2. **Fix lock ordering in `state.rs`** — `start_polling()` now calls `stop_polling()` via `blocking_lock()` before spawning the new async task, then stores the handle after. Eliminates the race where the spawned task and the post-spawn `blocking_lock()` could deadlock.

Note: `cargo check` cannot run in WSL (missing GTK system deps) — verified by code review.

## 2026-04-04 — Spec Drift Fixes (Swift Backoff + SPEC.md Rewrite)

Fixed spec drift identified by `/spec-drift` audit (1 Error, 3 Warnings, 25 Info items):

1. **Swift network error backoff** — Added `FetchOutcome` enum, `consecutiveNetworkErrors` counter, and exponential backoff to `UsageViewModel.swift`. Sleep = `min(300 * 2^n, 3600)` on consecutive network errors. Success/auth error resets counter. Manual refresh also resets backoff. Mirrors Tauri implementation.

2. **SPEC.md comprehensive rewrite** — Updated from original MVP spec (2026-03-18) to reflect current state of both codebases. Added Tauri platform, pace emoji themes, account picker, sparklines, GitHub heatmap, daily budget, live countdown, overlay widget, backoff strategy, and full file structure for both Swift and Tauri. Checked off all 10 MVP features, added 16 post-MVP features.

## 2026-04-04 — Phase 7 Step 7: Spec Conformance (Re-auth Prompt + Backoff)

Fixed 2 spec conformance gaps in the Tauri app's polling behavior:

1. **Auto-prompt re-auth on 401/403** — made `open_settings` public in `lib.rs`, called `crate::open_settings(app)` from `perform_fetch`'s `AuthError` arm in `state.rs`. Settings window now opens/focuses automatically when auth expires.
2. **Network error backoff** — added `FetchOutcome` enum, changed `perform_fetch` to return it, added `consecutive_errors` counter to polling loop. Sleep = `min(300 * 2^errors, 3600)` on network errors (300s → 600s → 1200s → 2400s → 3600s cap). Success resets to 300s. Auth errors don't trigger backoff.

## 2026-04-04 — Phase 7 Step 6: Fix Low-Priority Items (Batch)

Fixed all 5 Low severity items from expert review:

1. **Slim tokio features** — replaced `features = ["full"]` with `["sync", "time", "rt", "macros"]` (only what's actually used).
2. **Fix menu bar text spacing** — added space in format string (`{}% W{}`) so `%W` no longer reads like a format specifier.
3. **Align keyring service name** — changed from `com.claudeusage.credentials` to `com.claudeusage.desktop` to match app identifier.
4. **Rename email → name** — renamed `email` field to `name` across 7 files (models, commands, state, types, components, main, settings). Added `#[serde(alias = "email")]` for backwards compat with existing config files.
5. **Account delete confirmation (macOS)** — added `.confirmationDialog` to SettingsView so the trash button shows a destructive confirmation before removing an account.

## 2026-04-04 — Phase 7 Step 5: Add Test Coverage

Added 16 new tests across 4 test groups (26 total, up from 10):
- **HistoryCompactionTests** (4) — recent kept, mid-range downsampled, old deleted, mixed-age filtering
- **PaceStatusTests** (6) — limitHit, fallback before stability, on-track/critical ratios, behind-pace in pace-aware vs raw-percentage modes
- **GitHubServiceTests** (3) — GraphQL variables-not-interpolation, error response handling, 401 auth error
- **AccountMigrationTests** (2) — migration from old credentials, migration skipped when accounts exist

Refactored `MockURLProtocol` to file scope for reuse. One production change: `HistoryStore.compact` visibility from `private` → `internal` for `@testable import`.

## 2026-04-04 — Phase 7 Step 4: Thread-Safe KeychainService Cache

Added serial `DispatchQueue` guard to `KeychainService.swift` static `cache` dictionary. All 10 access points (4 reads, 4 writes, 2 deletes) now wrapped in `cacheQueue.sync { ... }`. Queue scope is minimal — only protects the dictionary, not the underlying keychain/UserDefaults calls.

## 2026-04-04 — Phase 7 Step 3: Fix Medium-Priority Issues (Batch 1)

Fixed 3 Medium severity items from expert review:

1. **Document stability thresholds (Tauri)** — added doc comments explaining magic numbers in `state.rs`: 6h/1h guards in `pace_ratio`/`weekly_budget_per_day`, ±15% threshold in `weekly_pace_indicator`, utilization color tiers in `tray_color_for_utilization`.
2. **Log corrupted config (Tauri)** — replaced silent `unwrap_or_default()` and `Err(_)` in `config.rs` with `warn!()` logging before falling back to defaults.
3. **Escape HTML in usage-bar.ts (Tauri)** — extracted `escapeHtml` from `settings.ts` into shared `utils/escape.ts`, applied to all API-sourced string interpolations in `usage-bar.ts` (defense-in-depth against compromised API responses).

## 2026-04-04 — Phase 7 Step 2: Fix Remaining High-Priority Issues

Fixed all 4 remaining High severity items from expert review:

1. **Surface GitHub errors (macOS)** — `GitHubViewModel` now exposes `@Published var errorMessage` instead of silently swallowing fetch failures.
2. **Sanitize eval() opacity input (Tauri)** — `set_overlay_opacity` rejects NaN/infinity and clamps to [0.0, 1.0] before passing to `window.eval()`. Tauri 2.x has no `set_alpha()` API, so eval with validated float is the only option.
3. **Replace blocking_lock in setup (Tauri)** — `state.blocking_lock()` replaced with `try_lock().expect(...)` to avoid blocking the async executor during setup.
4. **Extract restart-polling helper (Tauri)** — DRY'd the `drop(s); state::start_polling(...)` pattern into a `restart_polling()` helper used at all 3 call sites.

All High items now complete. Phase 7 continues with Medium priority items.

## 2026-04-04 — Phase 7 High: Reuse reqwest::Client in api.rs

Replaced per-call `reqwest::Client::new()` with a module-level `LazyLock<reqwest::Client>` static. The client is initialized once on first use and reused for all subsequent `fetch_usage` calls, enabling connection pooling and TLS session reuse. One file changed (`tauri-app/src-tauri/src/api.rs`), 3 lines modified.

## 2026-04-01 — Phase 7 Step 1: Fix Critical Polling Leak + GraphQL Injection

Fixed the 2 Critical severity bugs from expert review #2:

1. **Polling handle leak (Tauri)** — `start_polling()` in `state.rs` now captures the `JoinHandle` from `spawn()`, calls `stop_polling()` to abort any existing task, and stores the new handle. All 3 callers in `commands.rs` (`remove_account`, `set_active_account`, `save_credentials`) simplified to `drop(s); start_polling(app, state.inner().clone())` — redundant `stop_polling()` calls removed since `start_polling` handles it internally.

2. **GraphQL injection (macOS)** — `GitHubService.swift` now uses GraphQL variables (`$login: String!`) instead of interpolating `username` directly into the query string. Prevents injection from usernames containing special characters.

Note: `cargo check` cannot run in this WSL environment (missing OpenSSL/pkg-config system deps) — code changes verified by manual review.

## 2026-04-01 — Expert Code Review #2 (Full Project)

Second comprehensive review across both Swift (macOS) and Tauri (Rust + TypeScript) codebases. Found 2 Critical (polling handle leak causing duplicate API calls after account switches, GraphQL injection via username), 5 High (reqwest::Client reuse, silent GitHub errors, eval() for opacity, blocking_lock in setup, repeated restart-polling pattern), 5 Medium (KeychainService thread safety, test coverage, magic thresholds, silent config corruption, unescaped HTML), 5 Low (tokio features, delete confirmation, field naming, text spacing, service name mismatch), 2 Spec conformance (auto-prompt re-auth, network error backoff). Cross-referenced against prior review and project docs. Added Phase 7 to roadmap with all findings prioritized.

## 2026-03-18 — README Update (macOS)

Updated README.md to reflect all current features. Replaced outdated arrow-based pace indicator docs with emoji-based system (3 themes, 6 pace states). Added sections for hover tooltip, usage history sparklines, GitHub heatmap, and comprehensive settings list. Updated feature comparison table with 6 new entries. Fixed menu bar format example and expanded Notes section.

## 2026-03-18 — Pace-Aware Weekly Bar Colors (macOS)

Aligned weekly bar color logic with menu bar pace emoji so both show the same status.

- Added `WeeklyColorMode` enum (`.paceAware` default, `.rawPercentage`) with UserDefaults persistence
- In pace-aware mode: weekly bar/ring color derives from `PaceStatus` (green=onTrack, yellow=warning, red=critical/limitHit)
- Raw percentage mode preserves original behavior (high=green, low=red)
- Added "Weekly Bar Color" picker in Settings
- Threaded `paceStatus` + `weeklyColorMode` through `UsageBar` and `CircleProgress`
- `UsageViewModel` loads/watches `weeklyColorMode` from UserDefaults like other preferences
- Build verified via xcodebuild

## 2026-03-18 — Auto-Refresh on Session Reset + Live Countdown (macOS)

Added auto-fetch at session reset time with macOS notification, plus a live h:mm:ss countdown timer in the menu bar.

- `resetTask` sleeps until `fiveHour.resetsAt`, then fetches immediately and posts a `UNUserNotification` ("Session Reset")
- 1-second `tickTimer` drives `@Published tick` — `remainingTimeString` now shows `h:mm:ss` format updating every second
- `_ = tick` pattern in computed properties triggers SwiftUI re-evaluation for menu bar label
- Notification permission requested on init via `UNUserNotificationCenter`
- Reset task cancelled on deinit and account switch
- Default time display changed from "Reset Time" to "Time Until Reset" (countdown)
- Deployed via `./claudeusage.sh deploy`

## 2026-03-18 — Tauri 2 Windows Port (Phases 1–5)

Built the complete Tauri 2 Windows port of the macOS ClaudeUsage menu bar app.

**Rust backend (8 files):** Ported all business logic from Swift — API client with Set-Cookie rotation, Windows Credential Manager via keyring crate, JSON config persistence, 300s polling loop, pace calculation (▲/▼ with stability windows), 16 IPC command handlers, overlay window management with 3 layouts.

**Frontend (10 files):** Popover UI with usage bars + progress rings + account picker, settings window with credentials/overlay/preferences, desktop overlay with compact/minimal/sidebar layouts + drag support. Dark theme CSS matching macOS.

**Build status:** Rust `cargo check` passes, TypeScript `tsc --noEmit` passes, Vite builds all 3 entry points. Still needs Tauri capability declarations for runtime IPC permissions.

## 2026-03-18 — Phase 6: Tauri Capabilities & Permissions

Added Tauri 2 ACL declarations so frontend `invoke()` calls aren't blocked at runtime.

- Created `src-tauri/permissions/default.toml` — defines 15 individual command permissions (`allow-get-usage`, `allow-refresh-now`, etc.) and bundles them into a `default` permission set
- Created `src-tauri/capabilities/default.json` — grants app `default` + `core:default` + `core:event:default` + `core:window:*` + `autostart:default` to all windows
- Added `tauri-app/.gitignore` for `node_modules/`, `dist/`, `target/`
- `cargo check` passes with capabilities resolved

## 2026-03-18 — Phase 6: Windows Icon (.ico)

Replaced the fake `icon.ico` (was a renamed 32x32 PNG) with a proper multi-resolution MS Windows icon resource.

- Generated 16x16, 32x32, 48x48, 256x256 PNGs from 128x128.png source using `sips`
- Built proper .ico with `npx png-to-ico` containing 4 embedded resolutions
- Upgraded `icon.png` from 32x32 to 256x256 as high-res source
- Added `256x256.png` for high-DPI scaling
- Updated `tauri.conf.json` bundle icon list to include new assets
- `file icon.ico` now reports "MS Windows icon resource" (not PNG)
- Moved project from `/tmp/claude-usage-review/` to `~/projects/apps/claude-usage-review/`

## 2026-03-18 — Pace Emoji Themes + Popover Pace Detail (macOS)

Added selectable pace emoji themes and improved weekly pace detail in the macOS menu bar app.

- Added `PaceTheme` enum with 3 themes: Running (🚶🏃🔥💀), Racecar (🏎️🟡🚨🔴), F1 Quali (🟣🟢🟡🔴)
- Added `limitHit` case to `PaceStatus` — triggers at >=100% weekly utilization
- Theme persisted via UserDefaults `"claude_pace_theme"`, watched via NotificationCenter
- Menu bar now shows pace emoji from selected theme instead of hardcoded colored circles
- Replaced `weeklyBudgetPerDay` with `weeklyPaceDetail` — actionable guidance (e.g. "12%/day · 4d left · On track — room to push")
- Added "Pace Theme" picker in Settings
- Build verified via xcodebuild

## 2026-03-18 — Usage History + GitHub Contribution Heatmap (macOS)

Added usage history persistence with sparkline charts and GitHub contribution heatmap to the macOS menu bar app.

**Phase 1 — Usage History:**
- `UsageSnapshot` model (timestamp, session/weekly utilization)
- `HistoryStore` — JSON persistence at `~/Library/Application Support/ClaudeUsage/history-{accountId}.json` with compaction (>24h → 1/hour max, >7d → delete, ~2000 entries max)
- `SparklineView` — 30pt Path-based line graph with gradient fill, color follows bar thresholds (green/yellow/red)
- Hooked into `UsageViewModel.performFetch` — appends snapshot after each successful poll, reloads on account switch
- Collapsible "History" DisclosureGroup in popover with session + weekly sparklines

**Phase 2 — GitHub Contribution Heatmap:**
- `ContributionDay` model + GraphQL response wrapper structs
- `GitHubService` — GraphQL query to `api.github.com/graphql` for `contributionCalendar`
- `GitHubViewModel` — separate ObservableObject, 1-hour polling interval
- `ContributionHeatmapView` — last 12 weeks grid, 5pt cells, GitHub green color scale with tooltips
- Added `githubToken` to KeychainService (global, not per-account)
- GitHub username/token fields in SettingsView with helper text
- GitHubViewModel wired through ClaudeUsageApp → ContentView
- All 7 new files added to Xcode project (pbxproj)
- Build verified via xcodebuild

## 2026-03-18 — Dual-Mode Color Logic (macOS)

Implemented inverted color semantics for session vs weekly usage bars.

- Added `UsageColorMode` enum (`.session` = high is bad/red, `.weekly` = high is good/green)
- Threaded `colorMode` through `UsageBar`, `CircleProgress`, `SparklineView`
- ContentView passes `.session` for Session bar, `.weekly` for all weekly bars
- Updated pace guidance wording: "On pace — use more", "Ahead of pace — ease up", "Way ahead — slow down", "Maxed out"
- Daily budget (%/day) was already implemented via `weeklyPaceDetail`
- Build verified via xcodebuild

## 2026-03-18 — Windows Build Script Improvements (Tauri)

Replaced Start-Job heartbeat (output invisible) with Start-Process + log file tailing approach. Build output now streams to console in real-time with 30s heartbeat during quiet periods. Added todo item for PowerShell NativeCommandError (stderr treated as error).

## 2026-03-18 — Windows Build Script Fix (Tauri)

Fixed `setup-windows.ps1` to work when run from WSL filesystem paths (`\\wsl$\...`). Windows npm/cargo can't handle WSL symlinks, causing EISDIR errors.

- Added robocopy step to sync project to `%USERPROFILE%\tauri-build\claude-usage` (excluding node_modules, target, .git)
- npm install and tauri build now run on Windows-native path
- Built MSI is copied back to WSL source directory
- Added build progress output: estimated time warning, 30-second heartbeat timer, total build time report
- Prevents "frozen" appearance during long Rust compilation

## 2026-03-20 — DPI-Aware Popover Positioning (Tauri)

Implemented DPI-aware popover positioning in `lib.rs` so the popover anchors to the tray icon on Windows at any display scaling.

- `toggle_popover` now accepts `tray_rect: tauri::Rect` from the tray click event
- Converts physical→logical pixels via `to_logical(scale_factor)` using `primary_monitor().scale_factor()`
- Centers popover horizontally on tray icon, positions above (flips below if near screen top)
- Clamps to screen bounds with 8px margin to prevent clipping
- Added `.position(x, y)` to `WebviewWindowBuilder` chain

## 2026-03-20 — Autostart Toggle in Settings UI (Tauri)

Added "Launch at login" checkbox to the Settings Preferences section, wired to `@tauri-apps/plugin-autostart` JS API.

- Imported `enable`, `disable`, `isEnabled` from `@tauri-apps/plugin-autostart` in `settings.ts`
- Added checkbox in Preferences section (reuses existing `.checkbox-group` CSS)
- Checkbox state initialized from `isEnabled()` after render
- Change listener calls `enable()` or `disable()` — manages Windows Registry entry directly
- No Rust changes needed — plugin was already initialized with capabilities granted
- TypeScript build verified (`npm run build` passes)

## 2026-03-20 — Error Handling Edge Cases (Tauri)

Added try/catch error resilience to all three frontend files (main.ts, settings.ts, overlay.ts).

- Popover `init()` catches backend failures and shows "Failed to load — click to retry" banner
- Event listener callbacks wrapped in try/catch to prevent render crashes from killing the event loop
- Fixed perpetual "Loading..." state: distinguishes "no data yet" vs "fetch returned empty" using `last_updated`
- Network error banner now clickable with retry action
- Settings: save/test/rename/delete operations all have error feedback (testResult banner or alert)
- Settings: overlay/config/autostart toggle handlers wrapped to prevent UI crashes
- Overlay: init failure and render errors show "--" fallback instead of blank widget
- No Rust changes — backend already handles all error states correctly

## 2026-03-20 — PowerShell NativeCommandError Fix (Tauri)

Fixed `setup-windows.ps1` to prevent PowerShell NativeCommandError from killing the build script.

- Wrapped `npm install` with `$ErrorActionPreference = "Continue"` + explicit `$LASTEXITCODE` check — npm stderr warnings no longer terminate the script
- Added `$ErrorActionPreference = "Continue"` around the build log tailing loop — prevents `Get-Content` errors on locked log files from crashing the script
- Restored `$ErrorActionPreference = "Stop"` after the tailing loop
- Build failure now calls `exit 1` immediately instead of falling through to the MSI copy step

## 2026-03-20 — Brainstorm: New Ideas

Generated 11 new feature ideas across quick wins, medium efforts, and larger initiatives. Key themes: feature parity (sparklines, pace indicators for Tauri), UX polish (clipboard copy, keyboard shortcuts, light theme, offline mode), and new product directions (browser extension, CLI tool, unified Rust core library). Appended to `tasks/ideas.md`.

## 2026-03-25 — Pace-Aware Session Emoji (macOS)

Made session emoji pace-aware using time-based ratio (actual vs expected usage within 5-hour window) instead of raw utilization thresholds. Reuses same pace thresholds as weekly (1.15/1.4 ahead, 0.85/0.6 behind). Added `sessionPaceRatio()` with shorter stability guards (15 min elapsed, 5 min remaining vs 6 hours for weekly). Falls back to raw thresholds before stability window.

## 2026-03-25 — Separate Session & Weekly Pace Emojis + Menu Bar Improvements (macOS)

Split the menu bar emoji into two independent indicators: session emoji (based on 5-hour utilization thresholds) and weekly emoji (based on pace ratio). Previously both used the weekly pace status, so session always showed the same emoji regardless of session utilization.

- Added `sessionPaceStatus` computed property: >=100% limitHit, >=80% critical, >=60% warning, else onTrack
- Added `targetEmoji` and `weeklyEmoji` properties to `PaceTheme`
- Added `todayUsagePercent` — delta in weekly utilization since midnight via history snapshots
- Simplified `dailyBudgetPercent` — removed 6-hour warm-up guard, shows budget from the start
- Updated menu bar format: `{sessionEmoji} {session}% · {target} {today}%/{budget}%/day · {weeklyEmoji} {weekly}%/w · {time}`
- Updated `weeklyPaceDetail` popover text to include today% and weekly% with themed emojis

## 2026-03-31 — Expert Code Review

Conducted full expert code review across both Swift (macOS) and Tauri (Rust + TypeScript) codebases. Reviewed all 20 Swift files, 9 Rust files, 8 TypeScript files, and configuration. Verified findings against actual source to filter false positives (dropped 5). Final findings added to `tasks/todo.md`: 3 High (DateFormatter perf, reqwest::Client reuse, silent GitHub errors), 3 Medium (GraphQL escaping, test coverage, code duplication), 5 Low (caching, migration, thread safety, tokio features, delete confirmation), 1 spec conformance note.

## 2026-03-18 — Behind-Pace Status + Hover Tooltip (macOS)

Added underutilization detection and a hover tooltip on the menu bar item.

**Behind-pace status:**
- Added `behindPace` and `wayBehind` cases to `PaceStatus` enum
- All 3 pace themes now have emoji for behind-pace states (Running: 🦥/🛌, Racecar: 🚗/🅿️, F1: 🔵/⚪)
- `paceStatus` checks ratio < 0.85 (behindPace) and < 0.6 (wayBehind) in pace-aware mode
- `UsageBar.paceColor` maps new statuses to yellow/red
- Menu bar daily budget now shows pace emoji prefix

**Hover tooltip:**
- `AppDelegate` finds `NSStatusBarButton` via `NSStatusBarWindow` view hierarchy walk
- Custom borderless floating `NSWindow` tooltip — native `toolTip` is suppressed on status bar buttons by macOS
- Global `NSEvent.addGlobalMonitorForEvents` tracks mouse position over the status item
- `paceGuidance` computed property provides just the status message (e.g. "Behind pace — pick it up")
- Tooltip updates live via Combine subscription on `$usageData`

## 2026-04-02 — Fix API Response Parse Error + Error Diagnostics (macOS)

Fixed broken usage display caused by Claude API changing the `extra_usage` response format from `UsageLimit` shape to a new object with `is_enabled`, `monthly_limit`, `used_credits`, `utilization`. The JSON decoder failed but the error was silently classified as "Network error" with no diagnostic detail, and with no cached data the app showed an infinite spinner.

- Added `ExtraUsage` struct for new API shape, with `asUsageLimit` bridge for display compatibility
- `ErrorState.networkError` now carries `detail: String` (HTTP status, "Parse error", "Connection failed")
- Added `os.log` logging (`com.claudeusage` subsystem) in ViewModel error handlers
- New error UI in ContentView: "Request Failed" + detail + Retry button when no cached data (was infinite spinner)
- Added `NSSupportsAutomaticTermination=false` / `NSSupportsSuddenTermination=false` to Info.plist
- Added `ProcessInfo.disableAutomaticTermination` in AppDelegate

## 2026-04-09 — Phase 3 Step 3.1: Red-Phase Wrapper Tests

Created `ClaudeUsageTests/CodexWrapperTests.swift` with 15 tests across 4 test classes defining the Codex Accuracy Mode wrapper contract:
- **CodexWrapperEventTests** (3): `CodexInvocationEvent` struct — timestamps, duration, commandMode, model, limitHitDetected
- **CodexEventLedgerTests** (5): JSONL persistence — append, read, rolling trim, empty file, corrupt line handling
- **CodexWrapperConfidenceTests** (4): confidence engine `wrapperEvents:` parameter — upgrade paths, never `.exact`
- **CodexPrivacyTests** (3): structural checks — no prompt fields, JSONL key whitelist, App Support directory

Updated `project.pbxproj` to include the new test file in the test target. App target compiles; test target fails with expected missing-type errors (`CodexInvocationEvent`, `CodexEventLedger`, `wrapperEvents:` parameter) — confirming red phase.

## 2026-04-10 — Phase 4 Complete: Gemini Passive Adapter (Steps 4.1–4.6)

Implemented the full Gemini passive adapter across 6 TDD steps, adding 17 new tests (78 total).

**Step 4.1 — Red phase:** Created `GeminiAdapterTests.swift` with 17 failing tests across 4 classes: GeminiDetectionTests (4), GeminiActivityParsingTests (5), GeminiRatePressureTests (4), GeminiConfidenceTests (4).

**Step 4.2 — Gemini detection:** `GeminiDetector` checks `~/.gemini/settings.json` for install status, reads `security.auth.selectedType` for auth mode (oauthPersonal, apiKey, vertexAI, codeAssist), checks `oauth_creds.json` for auth presence. Stub types created for activity parser, rate pressure, and confidence engine.

**Step 4.3 — Session parser:** `GeminiActivityParser` walks `~/.gemini/tmp/**/chats/session-*.json`, extracts gemini-type messages with timestamps/tokens/model. `GeminiRatePressure` computes daily request count, 5-min RPM window, and daily headroom against plan quotas.

**Step 4.4 — Confidence engine + adapter:** `GeminiConfidenceEngine` evaluates detection/events/plan → confidence level (highConfidence, estimated, observedOnly — never exact in passive mode). `GeminiAdapter` orchestrates detect→parse→evaluate. Added `.geminiRich` snapshot case to `ProviderTypes.swift`. Added Gemini plan/auth persistence to `ProviderSettingsStore`.

**Step 4.5 — Shell wiring + settings UI:** Wired `GeminiAdapter` into `ProviderShellViewModel` with 15s polling. Added Gemini settings row with detection status badge, enable toggle, auth mode display, plan picker (Personal preset), and rate pressure summary.

**Step 4.6 — Green gate:** Build clean, 78 tests pass (0 failures). Verified isolation: `UsageService.swift`, `UsageViewModel.swift`, `CodexAdapter.swift`, `CodexDetector.swift` all untouched during Phase 4. All milestone criteria met.

## 2026-04-10 — Step 5.2: Green Phase — Gemini Wrapper Event Types and Event Ledger

Implemented `GeminiInvocationEvent` struct in `GeminiTypes.swift` (mirrors `CodexInvocationEvent`). Created `GeminiEventLedger.swift` in Services (mirrors `CodexEventLedger` — JSONL append/read/trim for `gemini-events.jsonl`). Updated `GeminiConfidenceEngine.evaluate()` with `wrapperEvents:` parameter and wrapper confidence upgrade logic (3+ limit hits + plan → highConfidence, any wrapper events → estimated). Fixed test file label mismatch (`.authenticated(.oauthPersonal)` → `.authenticated(mode: .oauthPersonal)`). All 93 tests pass (78 existing + 15 new), 0 failures.

## 2026-04-11 — Step 7.1: Red-Phase Rust Tests for Multi-Provider Model

Created `tauri-app/src-tauri/src/provider_types.rs` with stub types and 15 red-phase tests across 4 groups: ProviderModelTests (5), CardStateTests (4), ConfidenceTests (3), ShellStateTests (3). Types: `ProviderId`, `CardState`, `ConfidenceLevel`, `CodexEstimate`, `GeminiEstimate`, `ProviderSnapshot` (6 variants), `ProviderCard`, `ShellState`. Three `todo!()` stubs define the contract: `ProviderSnapshot::id()`, `ConfidenceLevel::explanation()`, `ShellState::tray_provider()`. Reuses existing `UsageData`, `UsageLimit`, `AuthStatus` from `crate::models`. Result: 8 tests pass (type construction + serialization), 9 tests fail (hitting `todo!()` — expected red phase). Existing 2 api.rs tests unaffected.

## 2026-04-11 — Phase 7 Complete: Cross-Platform Follow-Through (Steps 7.1–7.6)

Completed the full cross-platform follow-through phase across 6 TDD steps, porting the multi-provider model to the Tauri app.

**Step 7.1 — Red phase:** 15 Rust tests defining provider type contracts (ProviderModel, CardState, Confidence, ShellState).

**Step 7.2 — Green phase:** Implemented `ProviderSnapshot::id()`, `ConfidenceLevel::explanation()`, `ShellState::tray_provider()` — all 17 Rust tests pass (15 provider_types + 2 api).

**Step 7.3 — Frontend types:** Added TypeScript interfaces (`ProviderId`, `CardState`, `ConfidenceLevel`, `ProviderCard`) to `types.ts`. Added card rendering to `main.ts` with progressive enhancement. Added card/badge styles to `styles.css`.

**Step 7.4 — Wiring:** Added `provider_cards: Option<Vec<ProviderCard>>` to `UsageState` in `models.rs`. Built `ProviderSnapshot::to_card()` method. Wired into `compute_usage_state()` in `state.rs`.

**Step 7.5 — Parity audit:** Created `docs/cross-platform-parity.md` with full feature matrix (Ported/Partial/Deferred/Gap status for every macOS feature). Updated `tauri-app/README.md` with multi-provider status section.

**Step 7.6 — Final verification gate:**
- `cargo test`: 17 tests pass (15 provider_types + 2 api)
- `npm run build`: frontend compiles, 0 errors
- `xcodebuild test`: 108 tests pass, 0 failures
- `docs/cross-platform-parity.md`: exists and comprehensive

All 7 phases of the multi-provider CLI monitor roadmap are now complete.

## 2026-04-15 — Transition to Post-Review Remediation

Archived the completed cross-platform follow-through phase to `tasks/phases/phase-7-cross-platform-follow-through.md` because `tasks/phases/phase-7.md` already contains the earlier expert-review fix archive. Promoted the roadmap's post-review remediation queue into `tasks/todo.md`, with Step R.1 as the next executable TDD step.

## 2026-04-15 — Step R.2: Red-Phase Provider Shell Stale Tests

Added live `ProviderShellViewModel` boundary coverage for stale Codex/Gemini adapter refresh timestamps. The tests inject controlled provider snapshots, fixed timestamps, and tray selection policy while exercising `ProviderShellViewModel.shellState` and `trayText`.

Validation: `xcodebuild test -scheme ClaudeUsage -destination 'platform=macOS'` builds successfully, then fails with the expected red-phase assertions:
- Codex stale refresh timestamp still yields a `.configured` card instead of `.stale`.
- Gemini stale refresh timestamp still yields a `.configured` card instead of `.stale`.
- Selected stale Codex tray text is `Codex Observed` instead of including `Stale`.

## 2026-04-15 — Step R.3: Red-Phase Codex Passive Parser Tests

Added Codex passive-source regression coverage for `CODEX_HOME`, recursive `sessions/YYYY/MM/DD/rollout-*.jsonl` parsing, production refresh bookmark reuse, and merging history/session rollout events before cooldown evaluation. Added a narrow `CodexAdapter` dependency-injection initializer so adapter-bound tests can observe parser bookmark behavior without implementing the remediation.

Validation: focused `xcodebuild test -scheme ClaudeUsage -destination 'platform=macOS' -only-testing:ClaudeUsageTests/CodexDetectionTests -only-testing:ClaudeUsageTests/CodexActivityParsingTests -only-testing:ClaudeUsageTests/CodexAdapterRefreshTests` builds successfully, then fails with the expected red-phase assertions:
- Recursive dated session rollout parsing returns 0 events instead of prompt/completion/limit-hit events.
- `CodexAdapter.refresh()` calls full history parsing twice instead of reusing a bookmark on the second refresh.
- Session rollout limit hits are not merged into adapter cooldown evaluation.
- The default adapter ignores `CODEX_HOME` for passive activity parsing.

## 2026-04-15 — Step R.4: Red-Phase Tauri Settings Org ID Tests

Added Tauri regression coverage for preserving configured account org IDs in Settings without exposing session keys. Rust coverage serializes `UsageState` and expects `accounts[0].org_id` while recursively asserting no `session_key`/`sessionKey` field leaks to the frontend. Frontend coverage adds a small `settingsAccountFormValues(...)` seam and a TypeScript compile-time regression check requiring `AccountInfo` to expose safe `org_id` metadata.

Validation:
- `cargo test usage_state_exposes_active_account_org_id_without_session_key` fails as expected because serialized `accounts[0].org_id` is currently `Null`.
- `npm run build` in `tauri-app/` fails as expected because `AccountInfo` has no `org_id` property.
- `cargo test` emitted existing dead-code warnings in `provider_types.rs`; accepted for this red phase because they are unrelated to the new org-ID regression coverage.

## 2026-04-15 — Step R.5: Live macOS Stale Provider Diagnostics

Wired live Codex/Gemini adapter refresh timestamps into `ProviderShellViewModel` so the production shell uses `ProviderCoordinator.makeShellState(providers:now:refreshTimes:)`. Selected tray text now derives from the selected provider's computed card state, so stale Codex/Gemini providers display `Stale` instead of presenting stale estimates as fresh. Also fixed a flaky history compaction fixture that could cross an hour boundary depending on the current minute, and removed two unused-local Swift test warnings.

Validation:
- `xcodebuild test -scheme ClaudeUsage -destination 'platform=macOS' -only-testing:ClaudeUsageTests/ProviderShellViewModelStaleTests`: 3 tests pass, 0 failures.
- `xcodebuild test -scheme ClaudeUsage -destination 'platform=macOS' -only-testing:ClaudeUsageTests/ProviderShellViewModelStaleTests -only-testing:ClaudeUsageTests/HistoryCompactionTests`: 7 tests pass, 0 failures.
- Full `xcodebuild test -scheme ClaudeUsage -destination 'platform=macOS'` builds and executes 115 tests; 108 pass and 7 fail with the expected Step R.3 red-phase Codex passive-source assertions queued for Step R.6.

## 2026-04-15 — Step R.6: Codex Passive Source and Configuration Remediation

Completed the Codex passive-monitoring remediation. The default Codex adapter now resolves `CODEX_HOME` before falling back to `~/.codex`, the parser includes recursive dated `sessions/**/rollout-*.jsonl` files while preserving top-level session JSONL parsing, and the adapter reuses a history bookmark while retaining previously parsed history events for later refresh evaluations. Codex cooldown/confidence now evaluates merged history, session rollout, and wrapper ledger data. Settings now includes a Codex plan picker that persists the selected profile and refreshes the live adapter without app restart.

Validation:
- `xcodebuild test -scheme ClaudeUsage -destination 'platform=macOS' -only-testing:ClaudeUsageTests/CodexDetectionTests -only-testing:ClaudeUsageTests/CodexActivityParsingTests -only-testing:ClaudeUsageTests/CodexAdapterRefreshTests`: 13 tests pass, 0 failures.
- `xcodebuild test -scheme ClaudeUsage -destination 'platform=macOS'`: 115 tests pass, 0 failures.
- Accepted environment warnings: duplicate macOS destination selection, Xcode AppIntents metadata skipped because the app has no AppIntents dependency, and XCTest dylib deployment-target warnings from the local Xcode toolchain.

## 2026-04-15 — Steps R.8 and R.9: Tauri Tray Actions and Settings Org ID

Completed the Tauri tray command wiring remediation and the org-ID preservation fix that blocked full Rust validation. The tray context menu now maps Refresh Now and Toggle Overlay to backend actions instead of unused frontend events; both the frontend commands and tray callback share the same refresh and overlay helpers. Refresh emits `usage-updated` after state changes, and overlay toggles continue to persist config and create/close the overlay through the shared path.

Settings account metadata now exposes the saved non-secret `org_id` while keeping session keys write-only. The Settings form reads that metadata so opening Settings for a configured account pre-populates the Organization ID field.

Validation:
- `cargo test tray` in `tauri-app/src-tauri/`: 4 tests pass, 0 failures.
- `cargo test` in `tauri-app/src-tauri/`: 21 tests pass, 0 failures.
- `npm run build` in `tauri-app/`: TypeScript and Vite build pass.
- Accepted existing Rust warnings: `provider_types.rs` has dead-code warnings for cross-provider variants/helpers that are part of the parity model but only exercised by tests in the current Tauri implementation.

## 2026-04-15 — Step 1.1: Electron Runtime Scaffold

Created the self-contained `electron-app/` scaffold for the new Windows/Linux Electron implementation. The scaffold includes Electron, React, TypeScript, Vite, Electron Builder, Vitest, package scripts, TypeScript configs, a builder config, a minimal main/preload/renderer entry, and a lockfile. The initial Electron dependency was upgraded to the npm-audit patched line so the scaffold has zero reported vulnerabilities.

Validation:
- `npm run typecheck` in `electron-app/`: passed.
- `npm test -- --run` in `electron-app/`: 1 scaffold test passed.
- `npm run build` in `electron-app/`: typecheck, tests, main build, and renderer Vite build passed.
- `xcodebuild test -scheme ClaudeUsage -destination 'platform=macOS'`: 119 tests passed, 0 failures.
- `npm install` warnings: fixed the direct Electron audit advisory by upgrading to `electron@^41.2.0`; remaining install warnings are deprecated transitive packages from the current Electron Builder/npm dependency graph, with `npm install` reporting 0 vulnerabilities after the upgrade.
- Accepted environment warning: xcodebuild selected the first of multiple matching local macOS destinations.

## 2026-04-15 — Step 1.4: Electron Preload Bridge

Implemented the narrow Electron preload bridge for the Windows/Linux runtime foundation. The preload API now exposes only `version`, `getUsageState`, `getSettings`, and `getAccounts` through a frozen `window.claudeUsage` object, with each method mapped to an allowlisted `ipcRenderer.invoke` channel. Shared IPC channel names and preload request/response typings now live in `electron-app/src/shared/types/ipc.ts`, and `electron-app/src/main/ipc.ts` re-exports them for the upcoming handler registration step. Renderer TypeScript now has a `window.claudeUsage` global declaration without importing Electron or Node APIs into renderer code.

Validation:
- `npm run typecheck` in `electron-app/`: passed.
- `npm test -- --run` in `electron-app/`: 1 scaffold test passed.
- `npm run build` in `electron-app/`: typecheck, tests, main build, and renderer Vite build passed.
- Confirmed `dist-electron/preload/index.js` exists after build.
- Confirmed renderer/shared source has no direct `electron`, `node:*`, or filesystem imports.

## 2026-04-15 — Step 1.6: Electron Storage Primitives

Added the main-process storage foundation for the Electron Windows/Linux app. The new `electron-app/src/main/storage/` boundary includes a SQLite connection factory using Electron's bundled Node 24 `node:sqlite`, an idempotent migration runner with the initial structured-data schema, a `safeStorage` secret wrapper, diagnostic redaction helpers, and a barrel export for later main-process services. Placeholder IPC state now surfaces the Linux `safeStorage` `basic_text` warning through the existing usage-state warning field.

Validation:
- `npm run typecheck` in `electron-app/`: passed.
- `npm test -- --run` in `electron-app/`: 1 scaffold test passed.
- `npm run build` in `electron-app/`: typecheck, tests, main build, and renderer Vite build passed.
- Confirmed renderer/shared source has no direct imports from `electron`, `node:*`, filesystem, crypto, child-process, or storage modules.

## 2026-04-15 — Step 1.8: Electron Foundation Regression Coverage

Added Vitest regression coverage for the Electron runtime foundation. The suite now covers shared IPC schema validation, secret-free credential response contracts, redaction helpers, the injected `safeStorage` wrapper, Linux weak-backend warning derivation, storage migration runner/schema contracts, mocked main-process window/tray routing, and renderer smoke mounts for popover/settings/onboarding/overlay through the typed preload API. The renderer settings smoke test verifies Claude credentials are write-only after save and never rendered back.

The coverage found and fixed a real contract mismatch: settings updates now accept partial overlay patches consistently across Zod validation, shared IPC types, preload typing, and main-process placeholder state merging.

Validation:
- `npm run typecheck` in `electron-app/`: passed.
- `npm test -- --run` in `electron-app/`: 22 tests passed.
- `npm run build` in `electron-app/`: typecheck, tests, main build, and renderer Vite build passed.
- Confirmed renderer/shared source has no direct imports from `electron`, `node:*`, filesystem, crypto, child-process, or storage modules.
