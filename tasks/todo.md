# Phase 1: Shared Provider Foundation

## Tests First
- [x] Step 1.1: Red-phase provider-shell tests verified — build fails with expected missing-type errors (`ProviderSnapshot`, `ProviderCoordinator`, `ProviderTrayPolicy`).

## Implementation
- [ ] Step 1.2: Introduce provider-aware domain types in `ClaudeUsage/Models/`.

  **What:** Create the domain types that the red-phase tests (lines 509-649 of `ClaudeUsageTests/ClaudeUsageTests.swift`) reference. These are pure value types with no networking or persistence — just the data model layer.

  **Files to create:**
  - `ClaudeUsage/Models/ProviderTypes.swift` — all types in one file (small enough):
    - `ProviderId` enum: `.claude`, `.codex`, `.gemini` (Hashable, Equatable)
    - `ProviderStatus` enum: `.configured`, `.missingConfiguration`, `.degraded(reason: String)`
    - `AuthStatus` enum: `.connected` (extend later)
    - `CardState` enum: `.configured`, `.missingConfiguration`, `.degraded`
    - `ProviderSnapshot` enum with associated values:
      - `.claude(usage: UsageData, authStatus: AuthStatus, isEnabled: Bool)`
      - `.codex(status: ProviderStatus, isEnabled: Bool)`
      - `.gemini(status: ProviderStatus, isEnabled: Bool)`
      - Computed `id: ProviderId` and `isEnabled: Bool`
    - `ProviderCard` struct: `id: ProviderId`, `cardState: CardState`, `headline: String`, `detailText: String?`, `sessionUtilization: Double?`, `weeklyUtilization: Double?`
    - `ShellState` struct: `providers: [ProviderCard]`, computed `trayProvider: ProviderCard?`
    - `ProviderTrayPolicy` struct: `rotationInterval: TimeInterval`, `manualOverride: ProviderId?`, `pinnedProvider: ProviderId?` with default init
    - `ProviderCoordinator` class:
      - `init(trayPolicy: ProviderTrayPolicy = ProviderTrayPolicy())`
      - `makeShellState(providers: [ProviderSnapshot], now: Date) -> ShellState`
      - `selectedTrayProvider(from: [ProviderSnapshot], now: Date) -> ProviderSnapshot?`

  **Xcode project:** Add `ProviderTypes.swift` to the ClaudeUsage target in `ClaudeUsage.xcodeproj/project.pbxproj`.

  **Key decisions:**
  - Single file — these are tightly coupled types, splitting adds no clarity
  - `ProviderCoordinator` lives here too since it's stateless logic over these types
  - `UsageData` already exists in `Models/UsageData.swift` — reuse as-is
  - Tray rotation uses `now: Date` parameter for testability (no internal clock)

  **Acceptance criteria:**
  - `xcodebuild build -scheme ClaudeUsage -destination 'platform=macOS'` compiles (tests still fail — that's Step 1.6)
  - All types referenced by the red-phase tests exist with correct signatures
  - No changes to existing files except `project.pbxproj`
- [ ] Step 1.3: [automated] Add a provider coordinator/store that maps the existing Claude `UsageViewModel` output into the new provider shell without altering Claude fetching behavior.
- [ ] Step 1.4: [automated] Update the menu bar and popover shell for rotating provider headlines, manual override, pinning, and stacked provider cards in `ClaudeUsageApp.swift`, `AppDelegate.swift`, and `Views/ContentView.swift`.
- [ ] Step 1.5: [automated] Extend settings/onboarding for provider enablement, plan/auth confirmation, and local install detection entry points in `Views/SettingsView.swift`, `Services/AccountStore.swift`, and related persistence files.

## Green
- [ ] Step 1.6: [automated] Make the new provider-shell tests pass, verify the existing Claude tests still pass, and run macOS build/test checks for the updated shell.

## Milestone
- [ ] Provider-aware state exists and can represent Claude, Codex, and Gemini side by side.
- [ ] Claude still renders through the current ingestion path with no fetch/auth behavior changes.
- [ ] The tray rotates across enabled providers, supports manual override, and supports pinning.
- [ ] The popover can show stacked provider cards for configured, missing, and degraded providers.
- [ ] All Phase 1 tests pass.
- [ ] No regressions in previous phase tests.
