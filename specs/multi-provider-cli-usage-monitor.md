# Multi-Provider CLI Usage Monitor

## Summary

Extend the existing desktop tray/menu bar app from a Claude-only usage monitor into a multi-provider monitor for:

- Claude Code
- Codex
- Gemini CLI

The product is for power-user agentic programmers who want to maximize subscription-backed CLI usage throughout the workday.

Claude data collection must remain unchanged. New provider support will be added through separate adapters for Codex and Gemini.

## Product Goal

Give power users a persistent desktop view of CLI usage headroom, rate pressure, and reset timing across Claude Code, Codex, and Gemini, without forcing them to open web dashboards or manually track cooldown windows.

## Non-Goals

- Do not replace the existing Claude adapter or Claude ingestion path.
- Do not promise identical quota precision across all providers.
- Do not support chat-app caps or general web product usage.
- Do not store raw prompt contents for analytics.
- Do not commit to Windows/Linux parity in v1.

## User

Primary user:

- Individual power users running Claude Code, Codex, and Gemini CLI heavily across the day
- Subscription-backed usage first, not API-billing-first users
- Comfortable with local files, shell wrappers, and advanced settings

## Research Constraints

The provider surfaces are materially different, so the product must use provider-specific confidence levels instead of pretending all providers expose the same quota signal.

- Claude Code: current app already has a working path and it must remain untouched.
- Codex: OpenAI documents plan windows and says local Codex usage is not available in the Compliance API. Local usage therefore cannot be fetched from an official remote parity endpoint.
- Gemini CLI: Google publishes concrete quota numbers for some auth modes and the CLI is open source. This makes local telemetry and optional wrapper instrumentation more viable.

## Decisions Locked During Interview

- Keep the existing desktop tray/menu bar app.
- Keep Claude ingestion exactly as it works today.
- Support subscription-backed CLI usage first.
- Use provider-specific UI and metrics where needed.
- Auto-rotate the tray headline across providers, with manual override and optional pinning.
- Show all providers stacked in the popover.
- Auto-detect installed CLIs and local state on first run.
- Use passive local detection by default.
- Offer provider-specific optional Accuracy Mode wrappers for Codex and Gemini.
- Store derived metrics only, not raw prompt content.
- Ask the user to confirm plan/auth mode when auto-detection cannot prove it.
- Ship macOS first. Keep Tauri design-ready for later parity.
- For Codex, show a plan-window estimate with confidence instead of a fake exact percentage.

## UX

## Tray Behavior

The menu bar item rotates between providers every 5 to 10 seconds.

- Default mode: round-robin rotation across enabled providers
- Manual override: click or scroll to switch immediately
- Pin mode: user can pin one provider to stop rotation

Each provider gets its own compact tray string and color/icon treatment.

Examples:

- Claude: `🔥 82% · 0:41:12`
- Codex: `Codex High · 5h est · 68%`
- Gemini: `Gemini 412/1000 · 16h left`

If a provider is unavailable or low-confidence, the tray string must say so explicitly rather than showing a misleading percentage.

Examples:

- `Codex Est. only`
- `Gemini Passive`
- `Not configured`

## Popover

The popover shows all configured providers in a stacked view.

Each provider card includes:

- Provider name and auth mode
- Confidence label: `Exact`, `High confidence`, `Estimated`, or `Observed locally only`
- Primary headroom metric
- Secondary rate/reset metric
- Last updated time
- Error or cooldown state
- Quick action to configure, refresh, or enable Accuracy Mode

Claude keeps its current pace-aware bars.

Codex and Gemini use provider-specific cards instead of forcing the Claude bar model onto them.

## First-Run Setup

On launch, the app scans for:

- Claude configuration already used by the current app
- `~/.codex` local state
- `~/.gemini` local state
- Installed `codex` and `gemini` binaries on `PATH`

The app suggests providers it detects and asks the user to confirm:

- whether the provider is actually used on this machine
- plan/auth mode
- whether to enable passive mode only or Accuracy Mode

## Provider Setup

### Claude Code

No change to current setup and no migration of the existing Claude ingestion path.

### Codex

Setup collects:

- account label
- plan: Plus, Pro, Business, Edu, Enterprise
- execution modes the user cares about: local only or local + cloud
- whether to enable Accuracy Mode wrapper

### Gemini

Setup collects:

- account label
- auth mode: personal Google sign-in, Gemini API key, Vertex AI, or Code Assist
- plan or quota context if known
- whether to enable Accuracy Mode wrapper

## Metric Model

The app needs a normalized shell plus provider-specific payloads.

### Shared Provider State

- `provider_id`
- `display_name`
- `status`: connected, degraded, expired, not_configured
- `confidence`: exact, high, estimated, observed_only
- `headline_value`
- `headline_label`
- `secondary_value`
- `secondary_label`
- `reset_at`
- `last_updated_at`
- `error_state`
- `adapter_mode`: passive or accuracy

### Claude State

Reuse current state model and current bars.

### Codex State

- configured plan
- window type: five_hour and weekly
- observed local activity count
- recent rate-limit or lockout events
- estimated burn rate
- estimated headroom band
- confidence score and explanation

### Gemini State

- auth mode
- known published quota profile if applicable
- observed request count
- observed request timestamps
- requests per minute
- requests per day
- remaining daily headroom when calculable
- confidence score and explanation

## Architecture

## Adapter Layer

Add a provider adapter abstraction on top of the current app state:

- `ClaudeAdapter`
- `CodexAdapter`
- `GeminiAdapter`

Each adapter implements:

- `detect()`
- `load_configuration()`
- `fetch_or_derive_state()`
- `health_check()`
- `explain_confidence()`

The app core aggregates provider states into:

- rotating tray headline state
- stacked popover state
- provider-specific settings state

## Claude Adapter

Reuse the current implementation as-is.

Requirements:

- no endpoint changes
- no auth flow changes
- no regression in current polling behavior
- no normalization work that weakens Claude fidelity

## Codex Adapter

### Passive Mode

Read local, non-secret state from Codex-managed files where available.

Potential sources:

- `~/.codex/history.jsonl`
- `~/.codex/state_*.sqlite`
- `~/.codex/logs_*.sqlite`
- `~/.codex/auth.json` for auth presence only, not token extraction
- `~/.codex/log/` for lockout and error detection

Passive mode goals:

- detect whether Codex is installed and authenticated
- count recent local interactions observed on this machine
- detect likely five-hour window activity
- detect cooldown or "usage limit hit" events
- infer headroom pressure from configured plan profile plus observed recent activity

Passive mode must not claim exact remaining percentage unless a stronger local signal is later discovered.

### Accuracy Mode

Provide an optional provider-specific wrapper or launcher for Codex invocations.

Wrapper responsibilities:

- capture invocation start and end timestamps
- capture command mode and selected model when observable
- capture locally visible usage-limit errors and reset messages
- maintain a rolling event ledger of invocations and limit hits

Accuracy Mode improves estimation quality but is still not allowed to claim exact remaining quota without a defensible provider signal.

### Codex Confidence Rules

- `Exact`: reserved for a future discovered official or stable exact source
- `High confidence`: observed window behavior plus repeated reset/limit patterns
- `Estimated`: plan profile plus passive local activity
- `Observed locally only`: auth detected but insufficient quota evidence

## Gemini Adapter

### Passive Mode

Read local Gemini CLI state and session artifacts where available.

Potential sources:

- `~/.gemini/state.json`
- `~/.gemini/settings.json`
- `~/.gemini/google_accounts.json`
- `~/.gemini/tmp/**/chats/*.json`
- other stable local logs if discovered during implementation

Passive mode goals:

- detect installation and auth mode
- count local request cadence where chat/session artifacts make that possible
- derive daily request count and RPM pressure for auth modes with published limits

### Accuracy Mode

Provide an optional Gemini wrapper or launcher.

Preferred approach:

- launch Gemini through a monitored entrypoint
- where practical, use structured Gemini CLI output modes instead of scraping terminal text

Accuracy Mode responsibilities:

- count requests initiated through the wrapper
- record timestamps for RPM and daily counters
- capture rate-limit responses
- distinguish auth mode when known

### Gemini Confidence Rules

- `Exact`: wrapper-counted requests against a known published quota profile
- `High confidence`: passive local artifacts with stable request events and known auth mode
- `Estimated`: auth mode known but request counting incomplete
- `Observed locally only`: installation or auth seen, quota context unknown

## Plan Profiles

The app maintains provider plan profiles with source-backed metadata and a date stamp.

Examples:

- Codex Plus: five-hour and weekly shared local/cloud plan windows with published rough averages, but no exact local remaining counter
- Codex Pro: same shape with larger published ranges
- Gemini personal Google auth: published `60 requests/min` and `1000 requests/day`
- Gemini API key and Vertex modes: user-specific or billing-backed limits, so exact remaining headroom may be unavailable without provider APIs

Plan profiles are reference inputs to estimation logic, not proof of current remaining usage.

## Data Storage

Store:

- provider configuration
- user-confirmed plan/auth mode
- wrapper enablement
- derived counters
- observed invocation timestamps
- reset detections
- confidence diagnostics

Do not store:

- raw prompt bodies
- raw model responses
- auth tokens copied into analytics stores

Secrets remain in Keychain as appropriate for provider auth helpers. Derived metrics can live in app support storage.

## Refresh Model

- Claude keeps its current polling cadence.
- Codex and Gemini passive adapters refresh on a short local cadence or filesystem change notifications.
- Tray rotation is independent from provider refresh.
- Accuracy Mode wrappers append events immediately; UI refreshes from those events in near-real time.

Recommended defaults:

- tray rotation: 7 seconds
- passive provider scan: 15 seconds
- filesystem debounce: 1 second

## Error Handling

The app must differentiate:

- provider not installed
- installed but not authenticated
- authenticated but no usable usage signal
- provider local files unreadable
- provider version changed and adapter degraded
- rate-limit hit detected
- cooldown active

If a provider degrades, the app should continue showing the last known state with a stale badge rather than dropping the provider silently.

## Security and Privacy

- Read only the minimum local files needed for derived metrics.
- Never persist raw prompt content as product telemetry.
- Redact tokens and secrets in logs.
- Make passive file-reading behavior explicit in onboarding.
- Make wrapper mode opt-in per provider.

## Performance

- Local parsing must be incremental.
- JSONL readers must bookmark offsets instead of rescanning full history.
- SQLite readers must query only recent rows and tolerate file locking.
- UI updates must remain lightweight enough for menu bar operation.

## Scope Boundaries

## In Scope for v1

- macOS desktop tray/menu bar app
- existing Claude adapter untouched
- Codex passive adapter
- Gemini passive adapter
- optional provider-specific Accuracy Mode wrappers
- stacked popover with provider-specific cards
- rotating tray headline
- provider setup and plan/auth confirmation

## Out of Scope for v1

- Windows/Linux parity
- exact Codex remaining quota unless a real signal is discovered
- enterprise admin dashboards
- team aggregation across multiple machines
- API-spend analytics as the primary product
- chat-app product usage outside the CLIs

## Phased Delivery

### Phase 1: Adapter Foundation

- Introduce provider abstraction
- Preserve Claude behavior unchanged
- Add provider configuration model
- Add rotating tray state and stacked popover state

### Phase 2: Gemini Passive

- implement install/auth detection
- implement passive request counting
- implement published quota profile support for personal Google auth

### Phase 3: Codex Passive

- implement install/auth detection
- implement passive local activity counting
- implement lockout/reset detection
- implement estimate and confidence labeling

### Phase 4: Accuracy Mode

- add optional wrappers for Gemini and Codex
- append local invocation ledger
- improve estimation quality and freshness

### Phase 5: Hardening

- handle provider version drift
- add adapter diagnostics UI
- prepare Tauri parity design

## Testing

- Unit tests for provider state derivation and confidence scoring
- Fixture-based tests for local file parsers
- Regression tests proving Claude state computation is unchanged
- UI tests for tray rotation and provider pinning
- Manual tests with real local Codex and Gemini state on macOS

## Open Implementation Risks

- Codex local storage format may change without notice
- Codex exact remaining quota may remain unknowable
- Gemini paid/enterprise auth modes may not expose stable local counters
- local SQLite schemas may differ across CLI versions
- wrapper adoption may be lower than desired, reducing Codex accuracy

## Success Criteria

- User can install the app and see all three providers in one menu bar product.
- Claude behavior is unchanged.
- Gemini free personal mode can show daily usage with strong confidence.
- Codex shows honest, useful headroom estimation with explicit confidence labels.
- Power users can opt into wrapper mode for better Codex/Gemini accuracy.

## Evidence Notes

- Claude `/cost` is not intended for Claude Max and Pro subscribers, which reinforces keeping the current Claude subscription path untouched rather than replacing it with `/cost`.
- OpenAI documents Codex plan windows but explicitly says local Codex usage is not available in the Compliance API.
- Gemini CLI documents personal Google auth limits and supports structured output modes that are useful for wrapper-based instrumentation.
