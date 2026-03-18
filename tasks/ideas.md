# ClaudeUsage — Ideas

## Quick wins (hours)

- **Configurable polling interval** — The 5-minute poll interval is hardcoded in `UsageViewModel.swift:93`. Power users on tight limits want faster updates; battery-conscious users want slower. Add a setting. _Start with:_ `/plan-interview configurable polling interval setting for ClaudeUsage`

- **Exponential backoff on network errors** — `performFetch` in `UsageViewModel.swift:257` retries at the same 5-min cadence after network failures, burning cycles. Add backoff (e.g. 5m → 10m → 20m) that resets on success. _Start with:_ `/plan-interview exponential backoff for network errors in ClaudeUsage polling`

- **Centralized date formatting** — `DateFormatter` is constructed inline in `UsageBar.swift:44`, `UsageViewModel.swift:395`, and pace detail. Extract a `TimeFormatter` utility to eliminate duplication and ensure consistent locale handling. _Start with:_ `/plan-interview extract centralized TimeFormatter utility for ClaudeUsage`

- **Consolidate menu bar text density** — The menu bar string (`🚶 17% · 11%W · 3:00 PM`) gets crowded. Let users pick which components to show (emoji, session %, weekly %, time). _Start with:_ `/plan-interview customizable menu bar layout for ClaudeUsage`

## Medium efforts (days)

- **Test coverage for AccountStore and HistoryStore** — 12 tests exist for `UsageService` JSON decoding, but `AccountStore` CRUD/migration, `HistoryStore` compaction logic, and `UsageViewModel` polling/account-switching have zero coverage. These are the most state-sensitive paths. _Start with:_ `/plan-interview comprehensive test suite for ClaudeUsage AccountStore HistoryStore and ViewModel`

- **macOS overlay widget (feature parity with Windows)** — The Tauri app has a floating overlay with 3 layouts (compact/minimal/sidebar) while the macOS app has none. An always-visible compact overlay would let users monitor usage without clicking the menu bar. _Start with:_ `/plan-interview always-on-top overlay widget for macOS ClaudeUsage`

- **Split UsageViewModel into focused services** — `UsageViewModel.swift` is 500+ lines mixing polling, pace math, time formatting, history, and notification scheduling. Extract `PaceCalculator`, `PollingManager`, and `NotificationScheduler` to improve testability and reduce cognitive load. _Start with:_ `/plan-interview refactor UsageViewModel into focused service objects`

- **GitHub integration on Windows** — macOS has `GitHubService` + `ContributionHeatmapView` but the Tauri app has no GitHub feature at all. Porting it would close the biggest feature gap between platforms. _Start with:_ `/plan-interview port GitHub contribution heatmap to Tauri Windows app`

## Larger initiatives (weeks)

- **Automated CI pipeline** — No CI exists. A GitHub Actions workflow running `xcodebuild test`, `cargo check`, and `tsc --noEmit` on PRs would catch regressions. Add code-signed release builds on tags. _Start with:_ `/plan-interview CI pipeline for ClaudeUsage with macOS and Tauri builds`

- **Usage analytics dashboard** — `HistoryStore` already persists 24h of snapshots. Extend to 30 days with richer visualization (daily averages, peak usage hours, weekly trends over time) to help users understand their consumption patterns. _Start with:_ `/plan-interview usage analytics dashboard with historical trends for ClaudeUsage`

- **Credential lifecycle management** — Session keys are pasted manually and only validated on 401/403. Build proactive expiration detection (track when key was saved, warn at ~25 days), one-click browser re-auth flow, and per-account GitHub credential scoping (currently global). _Start with:_ `/plan-interview credential lifecycle management with expiration warnings for ClaudeUsage`
