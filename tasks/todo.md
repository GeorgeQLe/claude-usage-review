# Phase 7: Swift Provider Telemetry Endpoints

> Project: ClaudeUsage Swift macOS app
> Source: `specs/provider-telemetry-endpoints.md`
> Scope: Add opt-in Provider Telemetry for Codex and Gemini Code Assist using provider-supplied quota endpoints, while preserving Claude ingestion and passive/wrapper fallbacks.
> Test strategy: tdd

## Tests First
- [x] Step 7.1: [automated] Add failing tests for the Swift Provider Telemetry contract under `ClaudeUsageTests/`: provider telemetry settings default off, Codex/Gemini telemetry model decoding, injected HTTP client behavior, confidence transitions from passive to provider-supplied and back, refresh/backoff state, redaction, and adapter fallback. Tests must use fixtures and fake clients only; no live Codex, ChatGPT, Gemini, Google, or Vertex requests.

## Implementation
- [ ] Step 7.2: [automated] Add shared telemetry models and settings in `ClaudeUsage/Models/ProviderTelemetryTypes.swift`, `ClaudeUsage/Models/ProviderSettingsStore.swift`, `ClaudeUsage/Models/ProviderTypes.swift`, and related tests: per-provider Provider Telemetry toggles, normalized telemetry snapshots, provider-specific Codex/Gemini payloads, degraded/unavailable states, account labels, and failure metadata.

  **Implementation plan for Step 7.2:**
  - Create `ClaudeUsage/Models/ProviderTelemetryTypes.swift` and register it in `ClaudeUsage.xcodeproj`. Define the shared telemetry surface used by the red contract tests: `ProviderTelemetryStatus` with exact/unavailable/degraded states, `ProviderTelemetryConfidence`, `ProviderTelemetrySnapshot`, `ProviderTelemetryProviderPayload`, `ProviderTelemetryError`, `ProviderTelemetryHTTPResponse`, `ProviderTelemetryHTTPClient`, `ProviderTelemetryClient`, and lightweight store abstractions such as `ProviderTelemetryStore` / `InMemoryProviderTelemetryStore`.
  - Add provider-specific payload and auth models expected by `ProviderTelemetryContractTests`: `CodexTelemetryPayload`, `CodexTelemetryAuth`, `CodexTelemetryAuthProviding`, `GeminiTelemetryPayload`, `GeminiTelemetryAuth`, and `GeminiTelemetryAuthProviding`. Keep Codex percent/window fields and Gemini remaining quota fields provider-specific rather than forcing one shape.
  - Update `ProviderSettingsStore` to accept an injected `UserDefaults` while preserving the current default initializer. Add `providerTelemetryEnabled(for:)` and `setProviderTelemetryEnabled(_:for:)`; Codex and Gemini must default off, and these toggles must not affect `codexAccuracyMode()` or `geminiAccuracyMode()`.
  - Extend `ProviderTypes.swift` only where the shared models need to bridge to current provider IDs/statuses. Add the minimum compile-time hooks referenced by the red tests, such as provider telemetry attachment on snapshots and `ProviderTelemetryAdapterBridge`; behavior can remain red until the relevant implementation step. Do not change Claude ingestion or existing Claude provider snapshots.
  - Add compile-safe placeholders for later-step service names referenced by the contract tests (`ProviderTelemetryCoordinator`, `CodexTelemetryClient`, `GeminiTelemetryClient`, and `ProviderTelemetryDiagnostics`) so the test target can run and expose assertion failures instead of stopping at missing-symbol errors. Keep real orchestration/client behavior scoped to Steps 7.3-7.5.
  - Run `xcodebuild test -scheme ClaudeUsage -destination 'platform=macOS'`. For Step 7.2, the settings/defaults and payload decoding contract tests should pass; client/coordinator/adapter behavior may remain red for later steps if the failures are explicitly tied to Step 7.3+ APIs.
- [ ] Step 7.3: [automated] Add the refresh/backoff orchestration and snapshot persistence in `ClaudeUsage/Services/ProviderTelemetryCoordinator.swift` and `ClaudeUsage/Services/ProviderTelemetryStore.swift`, integrating with `ProviderShellViewModel` without changing Claude polling or Claude API ingestion.
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
