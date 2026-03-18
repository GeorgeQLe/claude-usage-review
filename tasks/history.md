# ClaudeUsage — Session History

## 2026-03-18 — Tauri 2 Windows Port (Phases 1–5)

Built the complete Tauri 2 Windows port of the macOS ClaudeUsage menu bar app.

**Rust backend (8 files):** Ported all business logic from Swift — API client with Set-Cookie rotation, Windows Credential Manager via keyring crate, JSON config persistence, 300s polling loop, pace calculation (▲/▼ with stability windows), 16 IPC command handlers, overlay window management with 3 layouts.

**Frontend (10 files):** Popover UI with usage bars + progress rings + account picker, settings window with credentials/overlay/preferences, desktop overlay with compact/minimal/sidebar layouts + drag support. Dark theme CSS matching macOS.

**Build status:** Rust `cargo check` passes, TypeScript `tsc --noEmit` passes, Vite builds all 3 entry points. Still needs Tauri capability declarations for runtime IPC permissions.

## 2026-03-18 — Phase 6: Tauri Capabilities & Permissions

Added Tauri 2 ACL declarations so frontend `invoke()` calls aren't blocked at runtime.

- Created `src-tauri/permissions/default.toml` — defines 15 individual command permissions (`allow-get-usage`, `allow-refresh-now`, etc.) and bundles them into a `default` permission set
- Created `src-tauri/capabilities/default.json` — grants app `default` + `core:default` + `core:event:default` + `core:window:*` + `autostart:default` to all windows
- Added `tauri-app/.gitignore` for `node_modules/`, `dist/`, `target/`
- `cargo check` passes with capabilities resolved

## 2026-03-18 — Phase 6: Windows Icon (.ico)

Replaced the fake `icon.ico` (was a renamed 32x32 PNG) with a proper multi-resolution MS Windows icon resource.

- Generated 16x16, 32x32, 48x48, 256x256 PNGs from 128x128.png source using `sips`
- Built proper .ico with `npx png-to-ico` containing 4 embedded resolutions
- Upgraded `icon.png` from 32x32 to 256x256 as high-res source
- Added `256x256.png` for high-DPI scaling
- Updated `tauri.conf.json` bundle icon list to include new assets
- `file icon.ico` now reports "MS Windows icon resource" (not PNG)
- Moved project from `/tmp/claude-usage-review/` to `~/projects/apps/claude-usage-review/`

## 2026-03-18 — Pace Emoji Themes + Popover Pace Detail (macOS)

Added selectable pace emoji themes and improved weekly pace detail in the macOS menu bar app.

- Added `PaceTheme` enum with 3 themes: Running (🚶🏃🔥💀), Racecar (🏎️🟡🚨🔴), F1 Quali (🟣🟢🟡🔴)
- Added `limitHit` case to `PaceStatus` — triggers at >=100% weekly utilization
- Theme persisted via UserDefaults `"claude_pace_theme"`, watched via NotificationCenter
- Menu bar now shows pace emoji from selected theme instead of hardcoded colored circles
- Replaced `weeklyBudgetPerDay` with `weeklyPaceDetail` — actionable guidance (e.g. "12%/day · 4d left · On track — room to push")
- Added "Pace Theme" picker in Settings
- Build verified via xcodebuild

## 2026-03-18 — Usage History + GitHub Contribution Heatmap (macOS)

Added usage history persistence with sparkline charts and GitHub contribution heatmap to the macOS menu bar app.

**Phase 1 — Usage History:**
- `UsageSnapshot` model (timestamp, session/weekly utilization)
- `HistoryStore` — JSON persistence at `~/Library/Application Support/ClaudeUsage/history-{accountId}.json` with compaction (>24h → 1/hour max, >7d → delete, ~2000 entries max)
- `SparklineView` — 30pt Path-based line graph with gradient fill, color follows bar thresholds (green/yellow/red)
- Hooked into `UsageViewModel.performFetch` — appends snapshot after each successful poll, reloads on account switch
- Collapsible "History" DisclosureGroup in popover with session + weekly sparklines

**Phase 2 — GitHub Contribution Heatmap:**
- `ContributionDay` model + GraphQL response wrapper structs
- `GitHubService` — GraphQL query to `api.github.com/graphql` for `contributionCalendar`
- `GitHubViewModel` — separate ObservableObject, 1-hour polling interval
- `ContributionHeatmapView` — last 12 weeks grid, 5pt cells, GitHub green color scale with tooltips
- Added `githubToken` to KeychainService (global, not per-account)
- GitHub username/token fields in SettingsView with helper text
- GitHubViewModel wired through ClaudeUsageApp → ContentView
- All 7 new files added to Xcode project (pbxproj)
- Build verified via xcodebuild

## 2026-03-18 — Dual-Mode Color Logic (macOS)

Implemented inverted color semantics for session vs weekly usage bars.

- Added `UsageColorMode` enum (`.session` = high is bad/red, `.weekly` = high is good/green)
- Threaded `colorMode` through `UsageBar`, `CircleProgress`, `SparklineView`
- ContentView passes `.session` for Session bar, `.weekly` for all weekly bars
- Updated pace guidance wording: "On pace — use more", "Ahead of pace — ease up", "Way ahead — slow down", "Maxed out"
- Daily budget (%/day) was already implemented via `weeklyPaceDetail`
- Build verified via xcodebuild
