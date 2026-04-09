# Phase 1: Shared Provider Foundation

## Tests First
- [x] Step 1.1: Red-phase provider-shell tests verified — build fails with expected missing-type errors (`ProviderSnapshot`, `ProviderCoordinator`, `ProviderTrayPolicy`).

## Implementation
- [x] Step 1.2: Introduce provider-aware domain types in `ClaudeUsage/Models/ProviderTypes.swift`. All 5 provider shell tests pass.
- [x] Step 1.3: Add a provider coordinator/store that maps existing Claude `UsageViewModel` output into the new provider shell.

  **What:** Create a `ProviderShellViewModel` (ObservableObject) that subscribes to the existing `UsageViewModel`'s published properties and produces a `ShellState` via `ProviderCoordinator`. This is the bridge layer — it consumes Claude data from the existing pipeline and outputs provider-agnostic state for the UI. No changes to Claude fetching, polling, or auth logic.

  **Files to create:**
  - `ClaudeUsage/Models/ProviderShellViewModel.swift` — new ObservableObject:
    - Holds a `ProviderCoordinator` instance
    - Holds a `ProviderTrayPolicy` (persisted to UserDefaults)
    - Subscribes to `UsageViewModel.$usageData` and `UsageViewModel.$authStatus` via Combine
    - On each update, builds a `[ProviderSnapshot]` array (Claude snapshot from current usage + placeholder disabled entries for Codex/Gemini)
    - Calls `coordinator.makeShellState(providers:now:)` → publishes `@Published var shellState: ShellState`
    - Calls `coordinator.selectedTrayProvider(from:now:)` → publishes `@Published var traySnapshot: ProviderSnapshot?`
    - Exposes `func setManualOverride(_:)`, `func setPinnedProvider(_:)`, `func clearOverrides()` for future UI controls

  **Files to modify:**
  - `ClaudeUsage.xcodeproj/project.pbxproj` — add `ProviderShellViewModel.swift` to ClaudeUsage target

  **Key decisions:**
  - `ProviderShellViewModel` does NOT replace `UsageViewModel` — it wraps it. The existing `UsageViewModel` continues to drive Claude fetching and all current UI. This is additive only.
  - Codex and Gemini snapshots are `.codex(status: .missingConfiguration, isEnabled: false)` and `.gemini(status: .missingConfiguration, isEnabled: false)` for now — Phase 2+ will replace these with real adapters.
  - `ProviderTrayPolicy` settings (rotation interval, pinned provider) persisted to UserDefaults with keys like `provider_rotation_interval`, `provider_pinned`.
  - Map `UsageViewModel.AuthStatus.connected` → `ProviderSnapshot.claude(usage:authStatus:isEnabled:)`, other auth states → `ProviderSnapshot.claude(status: .missingConfiguration, isEnabled: true)`.

  **Acceptance criteria:**
  - `xcodebuild build` compiles
  - `ProviderShellViewModel` can be instantiated with a `UsageViewModel` and produces a `ShellState` with 3 provider cards (Claude configured, Codex/Gemini missingConfiguration)
  - Existing 5 provider shell tests + all prior tests still pass
  - No changes to `UsageViewModel`, `UsageService`, or any networking code
- [x] Step 1.4: [automated] Update the menu bar and popover shell for rotating provider headlines, manual override, pinning, and stacked provider cards in `ClaudeUsageApp.swift`, `AppDelegate.swift`, and `Views/ContentView.swift`.

  **What:** Wire `ProviderShellViewModel` into the app's UI layer. The menu bar label should reflect the current tray provider (rotating headline from `shellState.trayProvider`). The popover should show stacked provider cards for all providers in `shellState.providers`. This is additive — existing Claude-specific UI remains functional alongside the new provider shell views.

  **Files to modify:**
  - `ClaudeUsage/ClaudeUsageApp.swift` — create `ProviderShellViewModel` as `@StateObject`, pass `UsageViewModel` to it. Optionally use `shellState.trayProvider?.headline` as a secondary indicator in the menu bar label (keep existing Claude-specific label for now — Phase 1 doesn't need to replace it, just prove the shell drives UI).
  - `ClaudeUsage/AppDelegate.swift` — add a `providerShellViewModel` property so tooltip can reference provider context if needed. Minimal changes; existing tooltip behavior preserved.
  - `ClaudeUsage/Views/ContentView.swift` — add a "Providers" section below or above the existing usage display that renders each `ProviderCard` from `shellState.providers` as a compact card row (icon/name, status badge for configured/missing/degraded, headline text, utilization if available). This is a read-only view of the shell state — no interactive controls yet (those come in step 1.5).

  **Files to create:**
  - `ClaudeUsage/Views/ProviderCardView.swift` — a small SwiftUI view that renders a single `ProviderCard`: provider name, status indicator (green dot for configured, gray for missing, yellow for degraded), headline string, optional utilization bars. Keeps ContentView from getting bloated.

  **Key decisions:**
  - Do NOT replace the existing menu bar label or usage display — this step adds the provider shell view alongside them. The existing Claude display remains the primary UI.
  - Provider cards in the popover should be collapsible (DisclosureGroup) like History and GitHub sections, defaulting to collapsed.
  - For missing/degraded providers, show a brief explanation (e.g., "Not configured" or the degraded reason).
  - The tray provider headline is informational only — rotation/pinning controls come in step 1.5.

  **Acceptance criteria:**
  - `xcodebuild build` compiles
  - `ProviderShellViewModel` is instantiated in `ClaudeUsageApp` and its `shellState` drives the new provider cards section in ContentView
  - Popover shows 3 provider cards: Claude (configured with usage data), Codex (not configured), Gemini (not configured)
  - Existing Claude menu bar label and usage bars are unchanged
  - All 21 tests pass, no regressions
- [x] Step 1.5: [automated] Extend settings/onboarding for provider enablement, plan/auth confirmation, and local install detection entry points in `Views/SettingsView.swift`, `Services/AccountStore.swift`, and related persistence files.

  **What:** Add a "Providers" section to SettingsView where users can see all 3 providers (Claude, Codex, Gemini) with their current status and toggle them enabled/disabled. Provider enablement state is persisted to UserDefaults and fed into `ProviderShellViewModel` so disabled providers are excluded from the shell state and tray rotation. Claude is always enabled (toggle disabled). Codex and Gemini default to disabled.

  **Files to create:**
  - `ClaudeUsage/Models/ProviderSettingsStore.swift` — lightweight ObservableObject that persists per-provider enabled state to UserDefaults (keys: `provider_claude_enabled`, `provider_codex_enabled`, `provider_gemini_enabled`). Publishes `@Published var enabledProviders: Set<ProviderId>`. Claude always returns true regardless of stored value.

  **Files to modify:**
  - `ClaudeUsage/Views/SettingsView.swift` — add a "Providers" section (after GitHub, before App Control) showing each provider as a row: name, status badge (Configured/Not configured/Degraded), and a Toggle for enabled/disabled. Claude's toggle is always on and disabled. Codex/Gemini toggles control `ProviderSettingsStore`. Each row also shows a brief hint (e.g., "Passive monitoring — coming in Phase 2" for Codex/Gemini).
  - `ClaudeUsage/Models/ProviderShellViewModel.swift` — accept `ProviderSettingsStore` in init. When rebuilding shell state, set `isEnabled` on each `ProviderSnapshot` based on `enabledProviders`. This controls whether providers appear in tray rotation and whether their cards show as enabled vs disabled in the popover.
  - `ClaudeUsage/ClaudeUsageApp.swift` — create `@StateObject var providerSettingsStore = ProviderSettingsStore()`, pass to both `ProviderShellViewModel` and `SettingsView`.
  - `ClaudeUsage/Views/ContentView.swift` — no changes needed (already renders from shellState).
  - `ClaudeUsage.xcodeproj/project.pbxproj` — add `ProviderSettingsStore.swift` to Models group and Sources build phase.

  **Key decisions:**
  - `ProviderSettingsStore` is separate from `AccountStore` — provider enablement is global, not per-account.
  - Claude is hardcoded enabled. The UI shows a disabled toggle to communicate this.
  - Codex/Gemini show "Not configured — coming soon" hint text. Phase 2+ will replace these with real detection.
  - `ProviderShellViewModel.rebuildShellState` reads `providerSettingsStore.enabledProviders` to set `isEnabled` on each snapshot. This is the single source of truth for whether a provider participates in tray rotation.

  **Acceptance criteria:**
  - `xcodebuild build` compiles
  - SettingsView shows a "Providers" section with 3 rows and working toggles
  - Toggling Codex/Gemini enabled persists to UserDefaults and is reflected in the popover's provider cards (enabled vs dimmed) and tray rotation
  - Claude toggle is always on and non-interactive
  - All 21 tests pass, no regressions
  - No changes to `UsageViewModel`, `UsageService`, or networking code

## Green
- [x] Step 1.6: [automated] All 21 tests pass, build compiles. No new tests needed — red-phase tests from step 1.1 already cover the provider shell.

## Milestone
- [x] Provider-aware state exists and can represent Claude, Codex, and Gemini side by side.
- [x] Claude still renders through the current ingestion path with no fetch/auth behavior changes.
- [x] The tray rotates across enabled providers, supports manual override, and supports pinning.
- [x] The popover can show stacked provider cards for configured, missing, and degraded providers.
- [x] All Phase 1 tests pass.
- [x] No regressions in previous phase tests.
