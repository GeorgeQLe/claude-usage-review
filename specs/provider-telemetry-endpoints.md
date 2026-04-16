# Provider Telemetry Endpoints Add-On

## Summary

Add an opt-in provider telemetry layer for the Swift macOS app that can read provider-supplied quota state for Codex and Gemini Code Assist.

This is a narrow add-on to `specs/multi-provider-cli-usage-monitor.md`. It does not replace the existing passive local parsers, wrapper-based Accuracy Mode, tray rotation, provider cards, or Claude ingestion. It updates the implementation plan now that Codex and Gemini both have source-backed quota surfaces.

## Product Goal

Give power users exact or provider-supplied quota visibility for Codex and Gemini when their existing CLI authentication can safely support it, while preserving passive/wrapper fallbacks when telemetry is unavailable or degraded.

## Non-Goals

- Do not change Claude usage ingestion.
- Do not add new Codex, ChatGPT, Gemini, Google, or Vertex login flows.
- Do not support general ChatGPT message caps.
- Do not support Gemini API-key quota or Vertex AI billing/quota as exact telemetry in this slice.
- Do not build cross-platform Electron parity in this slice.
- Do not persist raw provider tokens or raw endpoint responses by default.
- Do not make live provider requests from automated tests.

## Evidence

### Codex

The public OpenAI Codex source includes a rate-limit client that calls:

- ChatGPT-backed Codex auth: `GET https://chatgpt.com/backend-api/wham/usage`
- Codex API-style backend: `GET {base_url}/api/codex/usage`

The response is mapped into rate-limit snapshots with fields such as limit id, limit name, primary and secondary windows, used percent, reset timing, credits, plan type, and additional limits.

The locally installed `codex-cli 0.121.0` binary contains matching endpoint strings and diagnostic strings for reading Codex rate limits, which supports treating this as a current CLI-backed surface rather than a stale source-only artifact.

### Gemini Code Assist

The installed Gemini CLI `0.25.1` source defines:

- Endpoint: `https://cloudcode-pa.googleapis.com`
- API version: `v1internal`
- Method URL format: `{endpoint}/v1internal:{method}`
- Quota method: `retrieveUserQuota`

The CLI's `/stats` command calls `refreshUserQuota()`, which calls `retrieveUserQuota` with the Code Assist project id. The response type includes quota buckets with `remainingAmount`, `remainingFraction`, `resetTime`, `tokenType`, and `modelId`.

## Scope

### In Scope

- Swift macOS app only.
- New `Provider Telemetry` setting, separate from `Accuracy Mode`.
- Opt-in provider telemetry per provider.
- Codex exact telemetry using the Codex rate-limit endpoint when CLI authentication supports it.
- Gemini Code Assist exact telemetry using `retrieveUserQuota` when CLI authentication supports it.
- Normalized quota snapshots for display and history.
- Provider-specific UI payloads for Codex and Gemini.
- Passive and Accuracy Mode fallback when provider telemetry is unavailable.
- Fixture-driven tests and injected HTTP clients.

### Out of Scope

- General ChatGPT usage or message cap monitoring.
- Gemini API-key usage, Gemini API billing, or Vertex AI quota as exact provider telemetry.
- Enterprise/team aggregation.
- New OAuth or browser login flows.
- Electron implementation work.
- Raw response persistence outside explicit redacted diagnostics and test fixtures.

## User Experience

### Settings

Add a per-provider `Provider Telemetry` control near existing provider settings.

Copy should communicate:

- The mode uses existing CLI authentication.
- It makes authenticated network requests to provider quota endpoints.
- It is experimental because the surfaces are internal or unofficial.
- If unavailable, the app falls back to passive local monitoring.

Default state:

- Off for Codex.
- Off for Gemini.

`Accuracy Mode` remains separate:

- `Accuracy Mode`: wrapper-based local observation.
- `Provider Telemetry`: authenticated provider quota reads.

### Provider Cards

When provider telemetry succeeds, provider cards should show `Exact` or `Provider supplied` confidence and expose provider-specific quota detail.

Codex card fields:

- Limit names and window labels.
- Used percent when supplied.
- Reset time.
- Window duration.
- Credits or balance when supplied.
- Plan type when supplied.
- Last telemetry refresh time.

Gemini card fields:

- Bucket model id.
- Token or quota type.
- Remaining amount.
- Remaining fraction.
- Reset time.
- Last telemetry refresh time.

Do not force Gemini quota buckets into Codex's used-percent shape unless Gemini supplies enough information to do that honestly.

### Failure UX

If telemetry is unavailable, show a clear but non-noisy state:

- `Telemetry unavailable, passive mode active`
- `Telemetry degraded, passive mode active`
- `CLI auth unavailable`
- `Unsupported encrypted credentials`
- `Provider endpoint changed`

When telemetry degrades, keep showing the provider through passive or wrapper-derived state instead of removing it from the tray or popover.

## Architecture

### Shared Model

Add a provider telemetry layer below the existing adapters:

- `ProviderTelemetryState`
- `ProviderTelemetrySnapshot`
- `ProviderTelemetryClient`
- `ProviderTelemetrySettings`

Suggested shared fields:

- `providerId`
- `accountLabel`
- `status`: disabled, unavailable, refreshing, exact, degraded
- `confidence`: exact, providerSupplied, passiveFallback
- `lastRefreshAt`
- `nextRefreshAt`
- `failureCount`
- `degradedReason`
- `rawSourceVersion`
- `providerPayload`

Provider payloads remain provider-specific:

- `CodexTelemetryPayload`
- `GeminiTelemetryPayload`

### Codex Telemetry Client

Responsibilities:

- Detect whether Codex CLI auth is available.
- Determine whether the auth mode is ChatGPT-backed or Codex API-style.
- Make the appropriate rate-limit request.
- Parse provider snapshots into Codex telemetry models.
- Redact tokens and account headers in diagnostics.
- Return structured failure states when auth or endpoint shape is unsupported.

Candidate endpoints:

- `https://chatgpt.com/backend-api/wham/usage`
- `{base_url}/api/codex/usage`

Authentication:

- Reuse existing Codex CLI authentication only.
- Read the minimum auth material needed at request time.
- Never persist raw Codex auth material.
- Do not add an in-app Codex login flow.

Parsed fields:

- `limitId`
- `limitName`
- `windowLabel`
- `usedPercent`
- `resetsAt`
- `windowDuration`
- `hasCredits`
- `unlimited`
- `balance`
- `planType`
- additional provider-supplied rate-limit details

If endpoint parsing fails, mark telemetry degraded and fall back to passive Codex estimation.

### Gemini Telemetry Client

Responsibilities:

- Detect whether Gemini Code Assist auth is available.
- Reuse Gemini CLI or Google auth material when supported.
- Call Code Assist `retrieveUserQuota`.
- Parse quota buckets into Gemini telemetry models.
- Redact auth details in diagnostics.
- Return structured failures for missing, expired, encrypted, or unsupported credentials.

Endpoint:

- `POST https://cloudcode-pa.googleapis.com/v1internal:retrieveUserQuota`

Request body:

- `{ "project": "<code-assist-project-id>" }`

Parsed fields:

- `modelId`
- `tokenType`
- `remainingAmount`
- `remainingFraction`
- `resetTime`

If credentials are encrypted or cannot be used safely by the app, mark telemetry unavailable and keep passive Gemini monitoring active.

## Refresh Model

Telemetry refresh cadence:

- Default interval: 5 minutes while the app is active.
- Manual refresh: always tries immediately.
- Passive file scans keep their existing cadence.

Failure handling:

- After 3 consecutive telemetry failures, mark provider telemetry degraded.
- Use exponential backoff capped at 30 minutes.
- Manual refresh bypasses backoff for that attempt.
- A successful refresh resets the failure count and clears degraded state.

## Data Storage

Persist:

- Provider telemetry enabled/disabled setting.
- Normalized quota snapshots.
- Timestamps.
- Provider and account labels when safely available.
- Failure counters and degraded reasons.

Do not persist:

- Raw provider auth tokens.
- Raw endpoint responses by default.
- Prompt content or model responses.
- Provider request headers containing secrets.

Raw responses may exist only in:

- Redacted explicit diagnostics export triggered by the user.
- Static unit-test fixtures with no live secrets.

## Security And Privacy

- Provider Telemetry is opt-in per provider.
- Reads only the minimum provider auth material required for the request.
- Does not copy provider auth into app-owned analytics or snapshot storage.
- Redacts tokens, cookies, account ids, and auth headers from logs.
- Avoids noisy repeated requests to internal endpoints.
- Displays experimental status clearly.

## Confidence Rules

Codex:

- `Exact` or `Provider supplied`: successful provider telemetry response with parseable rate-limit snapshots.
- `High confidence`: passive/wrapper evidence with stable plan and reset behavior.
- `Estimated`: plan profile plus passive/wrapper activity.
- `Observed locally only`: installation or auth evidence without quota data.

Gemini:

- `Exact` or `Provider supplied`: successful `retrieveUserQuota` response with parseable buckets.
- `High confidence`: reliable local or `/stats` data with known auth/profile.
- `Estimated`: auth mode known but request counting or quota context incomplete.
- `Observed locally only`: installation or local activity without quota context.

Provider Telemetry should not weaken Claude's existing exact confidence or ingestion path.

## Implementation Plan

### Phase 1: Model And Settings

- Add telemetry-enabled settings per provider.
- Add telemetry state and snapshot models.
- Add provider-specific telemetry payload models.
- Add settings UI copy and toggles.
- Keep defaults disabled.

### Phase 2: Codex Telemetry

- Implement injected HTTP client abstraction.
- Implement Codex auth detection for existing CLI auth.
- Implement Codex endpoint selection.
- Parse Codex rate-limit snapshots.
- Integrate telemetry snapshots into `CodexAdapter`.
- Fall back to existing passive state on failure.

### Phase 3: Gemini Telemetry

- Implement Gemini Code Assist auth detection.
- Implement project id discovery.
- Call `retrieveUserQuota`.
- Parse quota buckets.
- Integrate telemetry snapshots into `GeminiAdapter`.
- Fall back to existing passive state on failure.

### Phase 4: UI And Diagnostics

- Show provider-specific telemetry details in provider cards.
- Add last telemetry refresh time and degraded reason.
- Add manual refresh path.
- Add redacted diagnostics output.

### Phase 5: Hardening

- Add backoff and failure-state tests.
- Add endpoint-shape drift tests.
- Add manual live-test checklist.
- Update README disclaimers and provider capability table.

## Testing

Automated tests:

- Codex telemetry parser fixtures.
- Gemini quota bucket parser fixtures.
- Provider telemetry settings defaults.
- Confidence transitions from passive to provider-supplied and back.
- Backoff after repeated failures.
- Manual refresh bypassing backoff.
- Redaction tests for diagnostics.
- Adapter fallback when telemetry is unavailable.

Automated tests must use protocol-injected HTTP clients and must never hit live provider endpoints.

Manual verification:

- Codex CLI authenticated with ChatGPT-backed auth.
- Codex telemetry disabled by default.
- Codex telemetry enabled and refresh succeeds.
- Codex endpoint failure falls back to passive state.
- Gemini CLI authenticated with Code Assist.
- Gemini telemetry disabled by default.
- Gemini telemetry enabled and quota buckets render.
- Encrypted or unsupported Gemini credentials degrade cleanly.

## Risks

- Internal endpoints may change response shape without notice.
- Provider auth storage may be encrypted or unavailable from the app sandbox.
- Reading CLI auth directly may require careful entitlement and sandbox decisions.
- Account labels may be unavailable or unsafe to display.
- Codex endpoint may expose cloud/local shared quota rather than local-only quota.
- Gemini `retrieveUserQuota` may only apply to Code Assist auth, not all Gemini CLI modes.

## Success Criteria

- Provider Telemetry is off by default and opt-in.
- Enabling Codex telemetry can show provider-supplied rate-limit snapshots when Codex CLI auth supports it.
- Enabling Gemini telemetry can show Code Assist quota buckets when Gemini CLI auth supports it.
- Telemetry failures are quiet, clear, and recoverable.
- Existing Claude behavior is unchanged.
- Existing passive Codex/Gemini monitoring remains available.
- No raw secrets or raw endpoint responses are persisted by default.
