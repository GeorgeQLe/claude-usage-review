# Electron Cross-Platform AI Usage Monitor Spec

## Summary

Build a full Electron implementation of ClaudeUsage for Windows and Linux. The Electron app is not a small Tauri clone; it is the complete cross-platform product for monitoring Claude, Codex CLI, and Gemini CLI usage from the desktop.

The existing Swift app remains the premium canonical macOS menu-bar implementation. It is the richest current product reference and must not be treated as only a top-menu label prototype. It owns the full native macOS workflow today: menu-bar presence, popover, settings, credentials, history, GitHub heatmap, notifications, provider rotation, diagnostics, and Codex/Gemini adapters. Electron should port the complete product behavior from Swift where cross-platform APIs allow it, while focusing public distribution on Windows and Linux.

## Product Goals

- Provide a persistent desktop tray view of AI usage headroom, reset timing, quota pressure, and confidence across Claude, Codex CLI, and Gemini CLI.
- Make Windows and Linux first-class platforms without requiring users to run the incomplete Tauri implementation.
- Preserve the Swift app as the public high-polish macOS app while supporting Electron macOS builds for development and parity testing.
- Give power users truthful usage insight without pretending all providers expose exact quota data.
- Keep secrets and raw prompt content out of renderer state and out of persistent telemetry.

## Non-Goals

- Do not replace the Swift app as the public macOS product in this phase.
- Do not promise exact Codex or Gemini quota remaining unless there is a defensible provider signal.
- Do not scrape provider web dashboards or automate browser-cookie extraction.
- Do not mutate user shell profiles, PowerShell profiles, or system PATH automatically for wrapper setup.
- Do not add remote product analytics, crash uploads, or telemetry in v1.
- Do not make code signing, notarization, or auto-update a blocker for v1 packaging.

## Platform Strategy

### macOS

The Swift app remains the premium macOS app. Electron must be able to run on macOS for development, parity testing, and future optional distribution, but public macOS polish remains the Swift app's responsibility unless this decision is revisited.

### Windows

Electron is the primary Windows implementation. It must support tray presence, popover, settings, overlay, notifications, secure credential storage, packaged installation, and portable usage.

### Linux

Electron is the primary Linux implementation. Linux tray behavior varies by desktop environment, so the app must provide a tray-first experience where supported and a fallback small window or app indicator behavior where tray support is unavailable.

## Research Notes

- Electron supports the native surface needed for this app: tray icons, context menus, BrowserWindow-based popovers/settings/overlays, notifications, login-item settings, `contextBridge`, and `safeStorage`.
- Electron security guidance requires disabling Node integration in renderers, using context isolation, validating IPC, and limiting exposed preload APIs.
- Electron `safeStorage` can encrypt strings using OS facilities; on Linux it may fall back to a weaker backend, so the app must detect and warn when `safeStorage.getSelectedStorageBackend()` reports `basic_text`.
- Electron Builder supports Windows `nsis` and portable builds, Linux AppImage and `deb`, and optional signing/publishing later.
- OpenAI documentation indicates Codex usage from local environments is not available through the Compliance API, so local Codex monitoring must be passive/wrapper-derived and confidence-labeled.
- Gemini CLI documentation publishes quota and pricing guidance for several auth modes and points users to `/stats` for usage summaries, so Gemini can use both local files and command-derived summaries where available.

## Target User

Primary users are power-user agentic programmers who run Claude, Codex CLI, and Gemini CLI heavily through the day and want a fast desktop answer to:

- How much can I still use right now?
- Which provider is close to a limit?
- When will the relevant window reset?
- Which readings are exact, high-confidence, estimated, or only locally observed?
- Which provider should I switch to next?

Users are assumed to be technically comfortable enough to paste session cookies, confirm plan/auth modes, and optionally set up CLI wrappers.

## Product Surface

### Tray

The tray item rotates across enabled providers every 5 to 10 seconds by default. Users can manually select a provider or pin one provider to stop rotation.

Provider examples:

- Claude: `Claude 82% - 0:41:12`
- Codex: `Codex High - 5h est`
- Gemini: `Gemini 412/1000 - 16h left`
- Stale: `Codex - Stale`
- Degraded: `Gemini - Degraded`
- Missing: `Codex - Not configured`

Tray requirements:

- Show provider-specific compact status text.
- Use color/icon treatment for healthy, warning, critical, stale, degraded, and missing states.
- Skip degraded providers during automatic rotation when at least one non-degraded provider is available.
- Preserve a manual override until the user changes provider, clears override, or pins another provider.
- Provide context menu actions: refresh now, open settings, toggle overlay, pause rotation, provider selection, quit.
- Use direct backend actions for context menu commands, not unused renderer events.

### Popover

The popover is the primary at-a-glance workspace. It includes:

- Active account picker.
- Claude exact usage bars.
- Provider cards for Claude, Codex, and Gemini.
- Collapsible history sparklines.
- Optional GitHub contribution heatmap.
- Last updated / error / stale status.
- Manual refresh, settings, add account, and quit controls.

Provider cards include:

- Provider name and status.
- Auth mode or plan/profile when relevant.
- Confidence label: Exact, High Confidence, Estimated, Observed Locally Only.
- Primary headroom metric.
- Secondary reset/rate/cooldown metric.
- Last updated time.
- Stale/degraded/missing badges.
- Confidence explanation in plain language.
- Quick action to configure, refresh, or open Accuracy Mode setup.

### Settings

Settings must cover:

- Account management: add, rename, switch, delete.
- Claude credentials: session key and org ID.
- Test connection.
- Time display preference: reset time or countdown.
- Pace theme.
- Weekly color mode: pace-aware or raw percentage.
- Launch at login.
- Overlay enablement, layout, opacity, and position reset.
- GitHub integration: username and token.
- Provider enablement for Codex and Gemini.
- Provider plan/auth confirmation.
- Accuracy Mode setup and verification.
- Migration status and re-enter-secret prompts.
- Diagnostics export.

Settings must never render stored secret values back into the UI. Secret inputs can be write-only with a "saved" indicator.

### Onboarding

First launch uses a guided flow:

1. Choose providers to monitor.
2. Configure Claude account if desired.
3. Auto-detect Codex and Gemini installations.
4. Confirm Codex plan/profile and Gemini auth mode/profile.
5. Import non-secret metadata from Swift/Tauri when present.
6. Re-enter secrets that cannot be migrated safely.
7. Choose tray rotation and overlay defaults.
8. Optionally configure Accuracy Mode wrappers.

Onboarding can be skipped, but the app must remain useful with missing providers and explain what is needed.

### Overlay

The overlay is a borderless always-on-top window with three layouts:

- Compact: session and weekly rings plus reset/countdown text.
- Minimal: one-line provider/tray text.
- Sidebar: stacked provider/limit bars.

Requirements:

- Draggable with persisted position.
- Opacity setting.
- Double-click opens popover.
- Right-click or context action hides/disables overlay.
- Reacts to live state updates without refreshing the whole app.

### Notifications

Notifications:

- Claude session reset.
- Provider becomes degraded after repeated failures.
- Auth expires.
- Optional warning when a provider crosses configured usage/rate thresholds.

Notifications are local-only and user configurable.

## Providers

### Shared Provider Model

All providers normalize into a shared shell while preserving provider-specific payloads.

Shared fields:

- `providerId`
- `displayName`
- `enabled`
- `status`: configured, missing_configuration, stale, degraded, expired
- `confidence`: exact, high_confidence, estimated, observed_only
- `headline`
- `detailText`
- `sessionUtilization`
- `weeklyUtilization`
- `dailyRequestCount`
- `requestsPerMinute`
- `resetAt`
- `lastUpdatedAt`
- `adapterMode`: passive, accuracy
- `confidenceExplanation`
- `actions`

### Claude

Claude is the exact provider.

Requirements:

- Use `GET https://claude.ai/api/organizations/{orgId}/usage`.
- Send `sessionKey` as a cookie.
- Send `anthropic-client-platform: web_claude_ai`.
- Parse all known limits: five-hour, seven-day, Sonnet, Opus, OAuth apps, Cowork, other, extra usage.
- Handle `Set-Cookie` session key rotation.
- Treat 401/403 as auth expired.
- Poll every 5 minutes with exponential backoff for network failures.
- Auto-fetch at session reset time.
- Persist history snapshots per account.
- Drive live countdown text every second.

Claude confidence is Exact when data is current from the API.

### Codex

Codex is not exact by default. It uses local passive signals and optional wrapper-derived events.

Passive sources:

- `CODEX_HOME` when set, otherwise `~/.codex`.
- `config.toml` for install detection.
- `auth.json` for auth presence only; do not read or serialize token contents.
- `history.jsonl` with incremental byte-offset bookmarks.
- `sessions/YYYY/MM/DD/rollout-*.jsonl` recursively.
- Local logs for usage/rate/limit text when present.

Accuracy Mode:

- Optional wrapper command generated by the app.
- Captures invocation start/end timestamps.
- Captures command mode and model when observable.
- Captures exit status.
- Scans stderr in memory for rate-limit, usage-limit, lockout, or reset hints.
- Does not capture stdout.
- Does not persist prompt bodies.

Codex confidence rules:

- Exact: reserved for a future official or stable exact source.
- High Confidence: repeated limit-hit/reset signals plus configured plan/profile.
- Estimated: plan/profile plus local activity or wrapper events.
- Observed Only: local activity or auth/install evidence without enough plan/quota context.

The UI must never present Codex remaining quota as exact unless the exact confidence rule is satisfied.

### Gemini

Gemini uses local passive signals, command-derived summaries, published quota profiles, and optional wrapper events.

Passive sources:

- `GEMINI_HOME` when supported/configured, otherwise `~/.gemini`.
- `settings.json` for install/auth mode detection.
- `oauth_creds.json` for auth presence only.
- `tmp/**/chats/session-*.json` for local request/timestamp/token/model data.

Command summary source:

- Run or guide the user to run Gemini CLI `/stats` where available.
- Parse command output only through a deliberate helper path.
- Treat `/stats` as higher-confidence than raw file observation, but still label confidence based on the auth/profile and data quality.

Auth/profile modes:

- Personal Google sign-in.
- Gemini API key.
- Vertex AI.
- Code Assist.
- Custom profile for user-specific or organization-specific quotas.

Rate metrics:

- Requests per minute over a 5-minute window.
- Requests per day over a rolling 24-hour window or provider-published reset window when known.
- Remaining daily headroom when the configured profile has a daily limit.
- Token counts when available.

Gemini confidence rules:

- Exact: reserved for provider-supplied exact current usage.
- High Confidence: authenticated mode, configured profile, and reliable local or `/stats` data.
- Estimated: authenticated mode with local request data but incomplete quota context.
- Observed Only: local activity without plan/auth confidence.

## GitHub Heatmap

The app can optionally fetch contribution data from GitHub GraphQL.

Requirements:

- User supplies username and token.
- Token remains secret-only in main process storage.
- Query uses GraphQL variables, not string interpolation.
- Display last 12 weeks in the popover.
- Refresh no more often than hourly unless manually requested.
- Handle 401/403 as token expired/invalid.

## Pace, History, and Display Logic

### Pace

Maintain the Swift app's pace semantics:

- Weekly pace ratio uses seven-day window.
- Ignore weekly pace in the first 6 hours and last 1 hour of the window.
- Session pace ratio uses five-hour window.
- Ignore session pace in the first 15 minutes and last 5 minutes of the window.
- Statuses: unknown, on_track, behind_pace, way_behind, warning, critical, limit_hit.
- Pace-aware color mode can represent both under-use and over-use.

### Daily Budget

Compute daily budget from remaining weekly percentage divided by remaining days. Compute today usage as the delta from the closest snapshot before local midnight, falling back to earliest same-day snapshot.

### History

Persist per-account usage snapshots:

- Keep all snapshots for the last 24 hours.
- Downsample snapshots from 24 hours to 7 days to one per hour, retaining the highest session utilization in each hour.
- Drop snapshots older than 7 days unless a future retention setting is added.

### Time Display

Support:

- Reset time in local timezone.
- Live countdown in `h:mm:ss`.
- Last updated text.
- Provider-specific reset/cooldown text.

## Architecture

### Directory Layout

Create `electron-app/` as a sibling to `tauri-app/`.

Proposed structure:

```text
electron-app/
  package.json
  electron-builder.yml
  vite.config.ts
  src/
    main/
      app.ts
      tray.ts
      windows.ts
      ipc.ts
      storage/
      services/
      providers/
      migration/
      wrappers/
      diagnostics/
    preload/
      index.ts
      api.ts
    renderer/
      app/
      settings/
      overlay/
      onboarding/
      components/
      styles/
    shared/
      types/
      schemas/
      confidence/
      formatting/
      fixtures/
```

### Main Process

Owns:

- Credential storage.
- SQLite database.
- Provider adapters.
- Polling loops and backoff.
- Tray and context menu.
- Window lifecycle.
- Notifications.
- Wrapper generation and process launch for setup verification.
- Migration from Swift/Tauri metadata.
- GitHub and Claude network calls.
- Diagnostics logs.

### Renderer

React renderer windows:

- Popover.
- Settings.
- Overlay.
- Onboarding.

Renderer constraints:

- No Node integration.
- Context isolation enabled.
- Sandbox enabled where compatible.
- No direct filesystem access.
- No secrets in renderer state.
- All main-process access through typed preload APIs.

### Preload API

Expose a narrow typed API:

- `getUsageState()`
- `refreshNow()`
- `subscribeUsageUpdated(callback)`
- `getSettings()`
- `updateSettings(patch)`
- `saveClaudeCredentials(accountId, sessionKey, orgId)`
- `testClaudeConnection(sessionKey, orgId)`
- `getAccounts()`
- `addAccount(label)`
- `renameAccount(accountId, label)`
- `removeAccount(accountId)`
- `setActiveAccount(accountId)`
- `getProviderDiagnostics(providerId)`
- `runProviderDetection(providerId)`
- `generateWrapper(providerId)`
- `verifyWrapper(providerId)`
- `exportDiagnostics()`

Every IPC handler must validate payloads with shared schemas.

### Storage

Use SQLite for structured data:

- Account metadata.
- Active account.
- App settings.
- Provider settings.
- Usage snapshots.
- Wrapper event ledgers.
- Parse bookmarks.
- Migration records.
- Diagnostics/events.

Use Electron `safeStorage` for encrypted secret blobs:

- Claude session keys.
- GitHub token.
- Future provider secrets if needed.

On Linux, detect and warn if `safeStorage` uses `basic_text`.

### Migration

Import non-secret metadata only.

Import candidates:

- Swift UserDefaults-derived account metadata when accessible.
- Tauri `config.json`.
- Tauri history snapshots when structurally compatible.
- Provider settings.
- Overlay settings.
- Pace/time display settings.

Do not import secrets automatically:

- Claude session keys.
- GitHub tokens.
- Provider auth tokens.

Migration UI must explain which metadata was imported and which secrets need re-entry.

### Security

Requirements:

- Disable renderer Node integration.
- Enable context isolation.
- Prefer sandboxed renderers.
- Validate all IPC inputs.
- Use a CSP that disallows arbitrary remote script execution.
- Do not use `eval`.
- Do not expose raw filesystem APIs to renderer.
- Do not send secrets to renderer.
- Escape or React-render all user/provider text.
- Keep wrapper stderr scanning in memory; persist only derived metadata.
- Redact secrets in logs and diagnostics exports.

## Accuracy Mode Wrapper Setup

Accuracy Mode is off by default.

When enabled, the app:

1. Generates wrapper scripts/binaries in the app user data directory.
2. Shows copyable shell setup commands.
3. Verifies whether `codex` or `gemini` resolves to the wrapper.
4. Shows active/inactive setup status.
5. Provides removal instructions.

The app must not automatically edit:

- `.zshrc`
- `.bashrc`
- Fish config
- PowerShell profiles
- System PATH
- Shell aliases

Wrapper ledger fields:

- provider ID
- invocation ID
- start time
- end time
- duration
- command mode
- model when observable
- exit status
- limit-hit detected
- source version

## Diagnostics

Diagnostics view/export includes:

- App version and platform.
- Storage backend status.
- Provider detection summary.
- Last refresh times.
- Consecutive failure counts.
- Last non-secret error messages.
- Parse bookmark status.
- Wrapper setup status.
- Redacted recent logs.

Diagnostics export must never contain session keys, GitHub tokens, auth tokens, raw prompts, or raw CLI stdout.

## Packaging

v1 artifacts:

- Windows: NSIS installer and portable build.
- Linux: AppImage and `deb`.
- macOS: optional unsigned dev/parity build only.

Post-v1:

- Code signing.
- Notarization if macOS Electron distribution becomes public.
- Auto-update.
- Release-channel management.

## Testing Strategy

### Unit Tests

Use Vitest for:

- Claude API parsing and Set-Cookie parsing.
- Pace calculations.
- Daily budget and today usage baseline.
- History compaction.
- Provider normalization.
- Codex parsing.
- Gemini parsing.
- Confidence engines.
- Storage migrations.
- IPC schema validation.
- Renderer components.

### Integration Tests

Cover:

- Main-process storage operations.
- Secret write/read/delete.
- Polling loops with fake timers.
- Backoff behavior.
- Reset-time fetch scheduling.
- GitHub GraphQL client.
- Provider adapter refresh flows.
- Tray menu action routing.
- Window lifecycle.
- Wrapper generation and verification.

### E2E / Smoke Tests

Use Playwright or equivalent for Electron:

- First-run onboarding.
- Add account and save credentials flow with mocked backend.
- Popover provider cards.
- Settings forms.
- Overlay layouts and drag persistence.
- Error and auth-expired states.
- Migration summary.

### Packaging Checks

CI or local release verification must build:

- Windows NSIS.
- Windows portable.
- Linux AppImage.
- Linux deb.

## Acceptance Criteria

- Electron app runs on Windows and Linux with tray/popover/settings/overlay.
- Swift app remains documented as the premium macOS product.
- Claude exact usage matches Swift behavior, including session-key rotation, backoff, reset fetch, history, pace, and countdown.
- Codex and Gemini providers are first-class, confidence-labeled, stale-aware, and degraded-aware.
- Gemini uses local sessions and supports `/stats`-derived summaries where available.
- Accuracy Mode wrappers are explicit, opt-in, privacy-safe, and verifiable.
- No raw prompts, CLI stdout, session keys, or GitHub tokens are persisted outside secret storage.
- Renderer never receives secrets.
- Migration imports non-secret metadata and clearly prompts for secret re-entry.
- React renderer escapes dynamic text by construction.
- Tests cover domain logic, IPC, storage, provider adapters, windows, and packaging smoke checks.

## Phased Build Plan

### Phase 1: Electron Foundation and Claude

- Scaffold `electron-app/` with Electron, React, TypeScript, Vite, and Electron Builder.
- Add secure main/preload/renderer split.
- Add SQLite storage and `safeStorage` secret store.
- Implement account metadata and Claude credential commands.
- Implement Claude usage client.
- Implement polling, backoff, reset fetch, and session-key rotation.
- Implement tray, popover, settings, onboarding, and notifications baseline.
- Add unit/integration tests for Claude, storage, IPC, and tray actions.

### Phase 2: Swift Feature Parity UI

- Port pace themes, weekly color modes, live countdown, daily budget, and pace guidance.
- Port history snapshots and sparklines.
- Port GitHub heatmap.
- Port overlay layouts and drag persistence.
- Add notification preferences.
- Add renderer smoke tests.

### Phase 3: Provider Adapters

- Implement shared provider shell and rotation policy.
- Port Codex passive detection/parser/bookmarks.
- Port Gemini passive detection/parser.
- Add Gemini `/stats` summary support.
- Implement provider settings and plan/auth confirmation.
- Add stale/degraded diagnostics.
- Add fixture-based tests.

### Phase 4: Accuracy Mode

- Generate Codex and Gemini wrappers.
- Implement wrapper ledgers.
- Add setup verification.
- Merge wrapper events into confidence engines.
- Add privacy tests proving no prompt/stdout persistence.

### Phase 5: Migration, Diagnostics, and Packaging

- Import non-secret Swift/Tauri metadata.
- Add migration UI and migration records.
- Add diagnostics view/export.
- Build Windows/Linux packages.
- Run full regression gates.
- Document handoff from Tauri to Electron for Windows/Linux.

## Coverage Checkpoint

- Goals: complete Electron product for Windows/Linux, not a Tauri parity clone.
- Users: power-user agentic programmers.
- Architecture: Electron main process services, React renderers, typed preload bridge, SQLite, `safeStorage`.
- Data models: accounts, usage snapshots, provider cards, confidence, wrapper ledgers, diagnostics.
- APIs: Claude, GitHub, IPC, provider detection, wrappers.
- UX flows: onboarding, tray, popover, settings, overlay, migration, diagnostics.
- Edge cases: auth expiry, network backoff, stale providers, degraded providers, missing CLIs, Linux storage backend, unsupported tray environments.
- Security/privacy: no renderer secrets, no raw prompts/stdout persistence, no remote telemetry.
- Performance: 5-minute Claude polling, 15-second local provider refresh target where cheap, indexed SQLite history, no expensive recursive parsing without bookmarks.
- Scope boundaries: Swift stays premium macOS; Electron targets Windows/Linux; signing/auto-update post-v1.
