# Phase 7: Swift Provider Telemetry Endpoints

> Project: ClaudeUsage Swift macOS app
> Source: `specs/provider-telemetry-endpoints.md`
> Scope: Add opt-in Provider Telemetry for Codex and Gemini Code Assist using provider-supplied quota endpoints, while preserving Claude ingestion and passive/wrapper fallbacks.
> Test strategy: tdd

## Tests First
- [x] Step 7.1: [automated] Add failing tests for the Swift Provider Telemetry contract under `ClaudeUsageTests/`: provider telemetry settings default off, Codex/Gemini telemetry model decoding, injected HTTP client behavior, confidence transitions from passive to provider-supplied and back, refresh/backoff state, redaction, and adapter fallback. Tests must use fixtures and fake clients only; no live Codex, ChatGPT, Gemini, Google, or Vertex requests.

## Implementation
- [x] Step 7.2: [automated] Add shared telemetry models and settings in `ClaudeUsage/Models/ProviderTelemetryTypes.swift`, `ClaudeUsage/Models/ProviderSettingsStore.swift`, `ClaudeUsage/Models/ProviderTypes.swift`, and related tests: per-provider Provider Telemetry toggles, normalized telemetry snapshots, provider-specific Codex/Gemini payloads, degraded/unavailable states, account labels, and failure metadata.

  **Implementation plan for Step 7.2:**
  - Create `ClaudeUsage/Models/ProviderTelemetryTypes.swift` and register it in `ClaudeUsage.xcodeproj`. Define the shared telemetry surface used by the red contract tests: `ProviderTelemetryStatus` with exact/unavailable/degraded states, `ProviderTelemetryConfidence`, `ProviderTelemetrySnapshot`, `ProviderTelemetryProviderPayload`, `ProviderTelemetryError`, `ProviderTelemetryHTTPResponse`, `ProviderTelemetryHTTPClient`, `ProviderTelemetryClient`, and lightweight store abstractions such as `ProviderTelemetryStore` / `InMemoryProviderTelemetryStore`.
  - Add provider-specific payload and auth models expected by `ProviderTelemetryContractTests`: `CodexTelemetryPayload`, `CodexTelemetryAuth`, `CodexTelemetryAuthProviding`, `GeminiTelemetryPayload`, `GeminiTelemetryAuth`, and `GeminiTelemetryAuthProviding`. Keep Codex percent/window fields and Gemini remaining quota fields provider-specific rather than forcing one shape.
  - Update `ProviderSettingsStore` to accept an injected `UserDefaults` while preserving the current default initializer. Add `providerTelemetryEnabled(for:)` and `setProviderTelemetryEnabled(_:for:)`; Codex and Gemini must default off, and these toggles must not affect `codexAccuracyMode()` or `geminiAccuracyMode()`.
  - Extend `ProviderTypes.swift` only where the shared models need to bridge to current provider IDs/statuses. Add the minimum compile-time hooks referenced by the red tests, such as provider telemetry attachment on snapshots and `ProviderTelemetryAdapterBridge`; behavior can remain red until the relevant implementation step. Do not change Claude ingestion or existing Claude provider snapshots.
  - Add compile-safe placeholders for later-step service names referenced by the contract tests (`ProviderTelemetryCoordinator`, `CodexTelemetryClient`, `GeminiTelemetryClient`, and `ProviderTelemetryDiagnostics`) so the test target can run and expose assertion failures instead of stopping at missing-symbol errors. Keep real orchestration/client behavior scoped to Steps 7.3-7.5.
  - Run `xcodebuild test -scheme ClaudeUsage -destination 'platform=macOS'`. For Step 7.2, the settings/defaults and payload decoding contract tests should pass; client/coordinator/adapter behavior may remain red for later steps if the failures are explicitly tied to Step 7.3+ APIs.
- [ ] Step 7.3: [automated] Add the refresh/backoff orchestration and snapshot persistence in `ClaudeUsage/Services/ProviderTelemetryCoordinator.swift` and `ClaudeUsage/Services/ProviderTelemetryStore.swift`, integrating with `ProviderShellViewModel` without changing Claude polling or Claude API ingestion.

  **Implementation plan for Step 7.3:**
  - Move the temporary telemetry store abstractions out of `ClaudeUsage/Models/ProviderTelemetryTypes.swift` into a dedicated `ClaudeUsage/Services/ProviderTelemetryStore.swift` and register it in `ClaudeUsage.xcodeproj`. Preserve the current privacy contract: saved snapshots must drop `rawResponseData` and must not persist prompt/response diagnostic text.
  - Expand `ProviderTelemetryStore` beyond the current in-memory test store with app-owned persistence for normalized telemetry snapshots only. Persist provider id, account label, status, confidence, last/next refresh times, failure count, degraded reason, raw source version, and provider-specific parsed payload. Do not persist provider auth, raw endpoint responses, request headers, prompts, or model responses.
  - Harden `ProviderTelemetryCoordinator` into the real orchestration layer: one active client per provider, 5-minute scheduled refresh cadence, manual refresh bypassing backoff, exponential backoff capped at 30 minutes after three consecutive failures, successful refresh clearing failure state, and unavailable/degraded fallback snapshots carrying the passive provider snapshot.
  - Integrate the coordinator with `ProviderShellViewModel` without changing Claude polling or Claude API ingestion. Codex/Gemini passive adapters should keep their existing 15-second local scan cadence; Provider Telemetry should be opt-in through `ProviderSettingsStore.providerTelemetryEnabled(for:)` and should attach normalized telemetry to provider snapshots only when enabled.
  - Keep test isolation: all coordinator tests must use fake `ProviderTelemetryClient` or fake HTTP clients, no live Codex, ChatGPT, Gemini, Google, or Vertex calls. Add focused tests for scheduled backoff skip, manual bypass, persistence sanitization, disabled-provider no-op behavior, and passive fallback preservation through the shell view model.
  - Run `xcodebuild test -scheme ClaudeUsage -destination 'platform=macOS'` and confirm the existing 132 tests still pass with the new coordinator/store coverage.
- [ ] Step 7.4: [automated] Implement Codex provider telemetry in `ClaudeUsage/Services/CodexTelemetryClient.swift`, `ClaudeUsage/Services/CodexDetector.swift`, `ClaudeUsage/Services/CodexAdapter.swift`, and `ClaudeUsage/Models/CodexTypes.swift`: detect usable existing CLI auth, select `https://chatgpt.com/backend-api/wham/usage` or `{base_url}/api/codex/usage`, parse rate-limit snapshots, map provider-supplied fields, redact auth diagnostics, and fall back to passive Codex state on unsupported auth or endpoint drift.
- [ ] Step 7.5: [automated] Implement Gemini Code Assist provider telemetry in `ClaudeUsage/Services/GeminiTelemetryClient.swift`, `ClaudeUsage/Services/GeminiDetector.swift`, `ClaudeUsage/Services/GeminiAdapter.swift`, and `ClaudeUsage/Models/GeminiTypes.swift`: detect Code Assist auth support, discover the project id, call `POST https://cloudcode-pa.googleapis.com/v1internal:retrieveUserQuota`, parse quota buckets, handle encrypted/unsupported credentials, redact auth diagnostics, and fall back to passive Gemini state.
- [ ] Step 7.6: [automated] Wire Provider Telemetry into the Swift UI and docs in `ClaudeUsage/Views/SettingsView.swift`, `ClaudeUsage/Views/ProviderCardView.swift`, `ClaudeUsage/Models/ProviderShellViewModel.swift`, `README.md`, and any Xcode project registration needed for new Swift files: show opt-in toggles separate from Accuracy Mode, provider-specific telemetry details, last telemetry refresh time, degraded reasons, manual refresh behavior, and experimental/unofficial endpoint copy.

## Green
- [ ] Step 7.7: [automated] Make the Phase 7 test suite pass and add any missing regression coverage for endpoint-shape drift, three-failure degradation, manual refresh bypassing backoff, no raw response persistence, no prompt/response persistence, and diagnostics redaction.
- [ ] Step 7.8: [automated] Run Phase 7 verification: `xcodebuild test -scheme ClaudeUsage -destination 'platform=macOS'`, confirm existing Claude usage tests still pass unchanged, confirm no automated test performs a live provider request, and update `tasks/history.md` with the implementation result.

## Milestone
- [ ] Provider Telemetry is off by default and opt-in per provider.
- [ ] Provider Telemetry is separate from Accuracy Mode in settings, copy, and behavior.
- [ ] Codex can show provider-supplied rate-limit snapshots when existing Codex CLI auth supports the endpoint.
- [ ] Gemini can show Code Assist quota buckets when existing Gemini CLI/Code Assist auth supports `retrieveUserQuota`.
- [ ] Telemetry refreshes every 5 minutes while active, supports manual refresh, and backs off after repeated failures.
- [ ] Three consecutive telemetry failures mark provider telemetry degraded and preserve passive/wrapper fallback display.
- [ ] Claude behavior and Claude ingestion are unchanged.
- [ ] Automated tests use injected HTTP clients and fixtures; no automated test calls live provider endpoints.
- [ ] Diagnostics redact tokens, cookies, account ids, and auth headers.
- [ ] No raw provider tokens, raw endpoint responses, prompts, or model responses are persisted by default.
- [ ] All phase tests pass.
- [ ] No regressions.
