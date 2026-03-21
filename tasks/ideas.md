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

---

## Brainstorm 2 (2026-03-20)

### Quick wins (hours)

- **Copy usage summary to clipboard** — No way to share current status. Add a "Copy" button to the popover that formats usage as text (e.g., `Session: 69% (resets 3:00 PM) | Weekly: 12%`) for pasting into Slack/chat. Both platforms lack this. _Start with:_ `/plan-interview copy usage summary to clipboard for ClaudeUsage`

- **Usage threshold notifications** — macOS has `UserNotifications` imported and reset notifications, but no alerts when usage crosses 50%/80%/95% thresholds. The pace calculation in `UsageViewModel.swift` already computes these breakpoints — wire them to notifications. _Start with:_ `/plan-interview usage threshold push notifications for ClaudeUsage`

- **System theme awareness for Tauri** — `styles.css` hardcodes a dark theme (`--bg-primary: #1a1a2e`). Tauri supports `prefers-color-scheme` media queries. Add a light mode variant so the popover doesn't clash on light-themed Windows desktops. _Start with:_ `/plan-interview light mode and system theme detection for Tauri ClaudeUsage`

- **Keyboard shortcuts in popover** — The popover toolbar has click-only buttons (refresh, settings, quit). Add keyboard handlers (`R` to refresh, `S` for settings, `Q` to quit, `1-9` for account switching) — both `main.ts` and `ContentView.swift` handle input but have no key bindings. _Start with:_ `/plan-interview keyboard shortcuts for ClaudeUsage popover actions`

### Medium efforts (days)

- **Sparkline history graphs for Tauri** — macOS has `SparklineView.swift` and `HistoryStore.swift` showing 24h usage trends, but the Tauri app shows only current values. The Rust backend already has the polling loop — add snapshot persistence and a canvas-based sparkline in `main.ts`. _Start with:_ `/plan-interview port sparkline usage history graphs to Tauri app`

- **Offline mode with stale data indicator** — When the network is down, both platforms show an error banner and no data. Instead, cache the last successful response and show it with a "stale" badge and timestamp. `state.rs` already stores `last_updated` — persist `usage_data` to disk alongside it. _Start with:_ `/plan-interview offline mode with cached usage data and staleness indicator`

- **Linux build & packaging script** — `setup-windows.ps1` automates the full Windows build pipeline, but Linux has no equivalent. Create a `setup-linux.sh` that installs deps (Rust, Node, webkit2gtk), builds the AppImage/deb, and validates the output. _Start with:_ `/plan-interview Linux build and packaging script for Tauri ClaudeUsage`

- **Pace indicators for Tauri** — macOS has rich pace tracking (3 emoji themes, daily budget, arrow indicators) while Tauri only shows basic `pace_detail` text. Port the pace emoji system and daily budget display from `UsageViewModel.swift` to `state.rs` and surface it in the Tauri popover UI. _Start with:_ `/plan-interview port pace emoji themes and daily budget to Tauri app`

### Larger initiatives (weeks)

- **Browser extension companion** — Inject a small usage badge directly into the claude.ai page header so users see limits while chatting. Reuse the API integration logic; the extension just needs to read the same endpoint with the existing session cookie (no credential entry needed). _Start with:_ `/plan-interview browser extension showing Claude usage limits on claude.ai`

- **CLI usage checker** — A lightweight `claude-usage` terminal command that prints current limits (e.g., `Session: 69% resets in 2h45m | Weekly: 12%`). Useful for developers who live in the terminal. Could share the Rust API client from `tauri-app/src-tauri/src/api.rs` as a library crate. _Start with:_ `/plan-interview CLI tool for checking Claude usage limits from the terminal`

- **Unified core library** — macOS Swift and Tauri Rust duplicate significant logic: pace calculation, time formatting, polling cadence, API parsing, multi-account management. Extract a shared Rust core (via Swift-Bridge or UniFFI) that both platforms consume, eliminating drift and cutting maintenance in half. _Start with:_ `/plan-interview shared Rust core library for ClaudeUsage across macOS and Tauri`
