# Provider Telemetry Endpoints Interview

## Initial Draft

The user asked whether the app could discover unofficial usage endpoints similar to the Claude usage endpoint, then confirmed they wanted to plan implementation of the discovered Codex and Gemini provider telemetry surfaces.

The initial multi-provider spec assumed Codex exact quota might remain unavailable and Gemini exact quota would mostly come from wrapper or local session data. Research changed that assumption:

- Codex has source-backed usage/rate-limit endpoints.
- Gemini Code Assist has a source-backed `retrieveUserQuota` endpoint used by the Gemini CLI.

## Research Findings Presented

### Codex

Found a Codex rate-limit client in the public OpenAI Codex source and matching strings in the installed `codex-cli 0.121.0` binary.

Candidate endpoints:

- `GET https://chatgpt.com/backend-api/wham/usage`
- `GET {base_url}/api/codex/usage`

The endpoint shape maps into rate-limit snapshots with limit windows, used percent, reset time, credits, balance, and plan type.

### Gemini

Found the Gemini Code Assist quota path in installed Gemini CLI `0.25.1` source.

Endpoint:

- `POST https://cloudcode-pa.googleapis.com/v1internal:retrieveUserQuota`

The CLI `/stats` command calls `refreshUserQuota()`, which calls `retrieveUserQuota`. The response contains quota buckets with remaining amount, fraction, reset time, token type, and model id.

## Questions And Decisions

### Auth Boundary

Question:

Should provider-authenticated reads be opt-in per provider, with no raw provider tokens copied into the app's analytics store, or should the app use a stricter mode where it never directly reads provider auth files and only shells out to CLIs?

Recommendation:

Use opt-in provider-authenticated reads. For Codex, use local Codex auth only to make the usage request. For Gemini, reuse the Gemini CLI or Google auth path. Store only derived quota snapshots.

User decision:

Approved.

### Scope For v1

Question:

Should v1 implement exact quota clients for Codex and Gemini Code Assist now, while leaving general ChatGPT message caps and non-Code-Assist Gemini API/Vertex quota out of scope?

Recommendation:

Implement Codex and Gemini Code Assist exact telemetry only.

User decision:

Approved.

### Spec Shape

Question:

Should this replace the existing multi-provider spec or be a narrower add-on spec?

Recommendation:

Use a narrower add-on spec so the existing passive/wrapper multi-provider spec remains intact.

User decision:

Approved narrower add-on spec.

### Telemetry Mode Naming

Question:

Should the UI call the new setting `Provider Telemetry`, `Exact Quota Telemetry`, or something else?

Recommendation:

Use `Provider Telemetry`, separate from existing `Accuracy Mode`.

User decision:

Approved.

### Default Enablement

Question:

Should Provider Telemetry be off by default, with a one-time card or prompt that exact provider telemetry is available?

Recommendation:

Default off because this crosses from passive local parsing into authenticated network calls against internal or unofficial endpoints.

User decision:

Approved.

### Refresh Cadence

Question:

Should telemetry refresh every 5 minutes while active plus manual refresh, or use a more aggressive interval like 1 minute?

Recommendation:

Use 5 minutes plus manual refresh because endpoint rate behavior is unknown.

User decision:

Approved.

### Call Strategy

Question:

Should implementation use direct Swift clients or shell out to `codex` and `gemini` on every refresh?

Recommendation:

Use direct Swift clients. Read only minimum auth material at request time, never persist it, and redact auth-related diagnostics. For Gemini, start with Code Assist auth files and degrade when credentials are encrypted or unavailable.

User decision:

Approved.

### Endpoint Fragility Policy

Question:

Should both providers be labeled as `Experimental Provider Telemetry`, with quiet fallback if endpoint requests fail repeatedly?

Recommendation:

Yes. The surfaces are source-backed but still internal or unofficial.

User decision:

Approved.

### Displayed Data

Question:

Should exact telemetry render as provider-specific quota cards rather than forcing one shared quota shape?

Recommendation:

Show Codex windows, used percent, reset time, credits, and plan type. Show Gemini quota buckets by model/token type, remaining amount/fraction, and reset time.

User decision:

Approved.

### Implementation Target

Question:

Should implementation start in the Swift macOS app only?

Recommendation:

Yes. The current user-visible product is Swift macOS, and auth/file handling is likely macOS-specific.

User decision:

Approved.

### Auth Flow Scope

Question:

Should v1 avoid new in-app Codex or Gemini login flows and rely only on existing CLI authentication?

Recommendation:

Yes. If credentials are encrypted, missing, expired, or unsupported, show telemetry unavailable and keep passive mode active.

User decision:

Approved.

### Data Retention

Question:

Should the app persist only normalized quota snapshots and avoid persisting raw endpoint responses by default?

Recommendation:

Yes. Raw responses should appear only in unit-test fixtures or explicit redacted diagnostics exports.

User decision:

Approved.

### Backoff And Failure State

Question:

Should telemetry degrade after 3 consecutive failures and retry with exponential backoff capped at 30 minutes, while manual refresh always tries immediately?

Recommendation:

Yes.

User decision:

Approved.

### Account Labeling

Question:

Should the app use provider-reported account/workspace labels when available but not require account identity for telemetry to work?

Recommendation:

Yes. Fall back to `Codex account` or `Gemini account` when identity cannot be safely identified.

User decision:

Approved.

### Testing Requirement

Question:

Should the spec require fixture-driven parser tests and injected HTTP clients, with no live endpoint calls in automated tests?

Recommendation:

Yes. Manual live testing should be a separate checklist item.

User decision:

Approved.

## Coverage Checkpoint

Presented a final summary covering:

- Scope.
- Provider boundary.
- Opt-in model.
- Call strategy.
- UI and confidence.
- Displayed data.
- Refresh cadence.
- Auth flow scope.
- Storage.
- Testing.
- Swift-only implementation target.

Question:

Does this cover everything? Any constraints, missing facts, or areas to revisit before writing the add-on spec and interview log?

User decision:

Approved.

## Significant Deviations From Initial Draft

- Codex is no longer treated as exact-quota-unknowable. It now has an experimental provider telemetry path based on source-backed endpoint discovery.
- Gemini exact quota is no longer limited to wrapper-counted requests against published quotas. Gemini Code Assist has a direct quota endpoint used by the CLI.
- Accuracy Mode remains wrapper/local observation and is not overloaded with provider-authenticated network telemetry.
- The implementation is narrowed to a Swift macOS add-on rather than expanding the broader multi-provider or Electron specs.
- The feature is opt-in and experimental because it depends on internal or unofficial provider surfaces.
