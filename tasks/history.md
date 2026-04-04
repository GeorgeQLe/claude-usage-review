# ClaudeUsage — Session History

## 2026-04-04 — Phase 7 Step 5: Add Test Coverage

Added 16 new tests across 4 test groups (26 total, up from 10):
- **HistoryCompactionTests** (4) — recent kept, mid-range downsampled, old deleted, mixed-age filtering
- **PaceStatusTests** (6) — limitHit, fallback before stability, on-track/critical ratios, behind-pace in pace-aware vs raw-percentage modes
- **GitHubServiceTests** (3) — GraphQL variables-not-interpolation, error response handling, 401 auth error
- **AccountMigrationTests** (2) — migration from old credentials, migration skipped when accounts exist

Refactored `MockURLProtocol` to file scope for reuse. One production change: `HistoryStore.compact` visibility from `private` → `internal` for `@testable import`.

## 2026-04-04 — Phase 7 Step 4: Thread-Safe KeychainService Cache

Added serial `DispatchQueue` guard to `KeychainService.swift` static `cache` dictionary. All 10 access points (4 reads, 4 writes, 2 deletes) now wrapped in `cacheQueue.sync { ... }`. Queue scope is minimal — only protects the dictionary, not the underlying keychain/UserDefaults calls.

## 2026-04-04 — Phase 7 Step 3: Fix Medium-Priority Issues (Batch 1)

Fixed 3 Medium severity items from expert review:

1. **Document stability thresholds (Tauri)** — added doc comments explaining magic numbers in `state.rs`: 6h/1h guards in `pace_ratio`/`weekly_budget_per_day`, ±15% threshold in `weekly_pace_indicator`, utilization color tiers in `tray_color_for_utilization`.
2. **Log corrupted config (Tauri)** — replaced silent `unwrap_or_default()` and `Err(_)` in `config.rs` with `warn!()` logging before falling back to defaults.
3. **Escape HTML in usage-bar.ts (Tauri)** — extracted `escapeHtml` from `settings.ts` into shared `utils/escape.ts`, applied to all API-sourced string interpolations in `usage-bar.ts` (defense-in-depth against compromised API responses).

## 2026-04-04 — Phase 7 Step 2: Fix Remaining High-Priority Issues

Fixed all 4 remaining High severity items from expert review:

1. **Surface GitHub errors (macOS)** — `GitHubViewModel` now exposes `@Published var errorMessage` instead of silently swallowing fetch failures.
2. **Sanitize eval() opacity input (Tauri)** — `set_overlay_opacity` rejects NaN/infinity and clamps to [0.0, 1.0] before passing to `window.eval()`. Tauri 2.x has no `set_alpha()` API, so eval with validated float is the only option.
3. **Replace blocking_lock in setup (Tauri)** — `state.blocking_lock()` replaced with `try_lock().expect(...)` to avoid blocking the async executor during setup.
4. **Extract restart-polling helper (Tauri)** — DRY'd the `drop(s); state::start_polling(...)` pattern into a `restart_polling()` helper used at all 3 call sites.

All High items now complete. Phase 7 continues with Medium priority items.

## 2026-04-04 — Phase 7 High: Reuse reqwest::Client in api.rs

Replaced per-call `reqwest::Client::new()` with a module-level `LazyLock<reqwest::Client>` static. The client is initialized once on first use and reused for all subsequent `fetch_usage` calls, enabling connection pooling and TLS session reuse. One file changed (`tauri-app/src-tauri/src/api.rs`), 3 lines modified.

## 2026-04-01 — Phase 7 Step 1: Fix Critical Polling Leak + GraphQL Injection

Fixed the 2 Critical severity bugs from expert review #2:

1. **Polling handle leak (Tauri)** — `start_polling()` in `state.rs` now captures the `JoinHandle` from `spawn()`, calls `stop_polling()` to abort any existing task, and stores the new handle. All 3 callers in `commands.rs` (`remove_account`, `set_active_account`, `save_credentials`) simplified to `drop(s); start_polling(app, state.inner().clone())` — redundant `stop_polling()` calls removed since `start_polling` handles it internally.

2. **GraphQL injection (macOS)** — `GitHubService.swift` now uses GraphQL variables (`$login: String!`) instead of interpolating `username` directly into the query string. Prevents injection from usernames containing special characters.

Note: `cargo check` cannot run in this WSL environment (missing OpenSSL/pkg-config system deps) — code changes verified by manual review.

## 2026-04-01 — Expert Code Review #2 (Full Project)

Second comprehensive review across both Swift (macOS) and Tauri (Rust + TypeScript) codebases. Found 2 Critical (polling handle leak causing duplicate API calls after account switches, GraphQL injection via username), 5 High (reqwest::Client reuse, silent GitHub errors, eval() for opacity, blocking_lock in setup, repeated restart-polling pattern), 5 Medium (KeychainService thread safety, test coverage, magic thresholds, silent config corruption, unescaped HTML), 5 Low (tokio features, delete confirmation, field naming, text spacing, service name mismatch), 2 Spec conformance (auto-prompt re-auth, network error backoff). Cross-referenced against prior review and project docs. Added Phase 7 to roadmap with all findings prioritized.

## 2026-03-18 — README Update (macOS)

Updated README.md to reflect all current features. Replaced outdated arrow-based pace indicator docs with emoji-based system (3 themes, 6 pace states). Added sections for hover tooltip, usage history sparklines, GitHub heatmap, and comprehensive settings list. Updated feature comparison table with 6 new entries. Fixed menu bar format example and expanded Notes section.

## 2026-03-18 — Pace-Aware Weekly Bar Colors (macOS)

Aligned weekly bar color logic with menu bar pace emoji so both show the same status.

- Added `WeeklyColorMode` enum (`.paceAware` default, `.rawPercentage`) with UserDefaults persistence
- In pace-aware mode: weekly bar/ring color derives from `PaceStatus` (green=onTrack, yellow=warning, red=critical/limitHit)
- Raw percentage mode preserves original behavior (high=green, low=red)
- Added "Weekly Bar Color" picker in Settings
- Threaded `paceStatus` + `weeklyColorMode` through `UsageBar` and `CircleProgress`
- `UsageViewModel` loads/watches `weeklyColorMode` from UserDefaults like other preferences
- Build verified via xcodebuild

## 2026-03-18 — Auto-Refresh on Session Reset + Live Countdown (macOS)

Added auto-fetch at session reset time with macOS notification, plus a live h:mm:ss countdown timer in the menu bar.

- `resetTask` sleeps until `fiveHour.resetsAt`, then fetches immediately and posts a `UNUserNotification` ("Session Reset")
- 1-second `tickTimer` drives `@Published tick` — `remainingTimeString` now shows `h:mm:ss` format updating every second
- `_ = tick` pattern in computed properties triggers SwiftUI re-evaluation for menu bar label
- Notification permission requested on init via `UNUserNotificationCenter`
- Reset task cancelled on deinit and account switch
- Default time display changed from "Reset Time" to "Time Until Reset" (countdown)
- Deployed via `./claudeusage.sh deploy`

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

## 2026-03-18 — Windows Build Script Improvements (Tauri)

Replaced Start-Job heartbeat (output invisible) with Start-Process + log file tailing approach. Build output now streams to console in real-time with 30s heartbeat during quiet periods. Added todo item for PowerShell NativeCommandError (stderr treated as error).

## 2026-03-18 — Windows Build Script Fix (Tauri)

Fixed `setup-windows.ps1` to work when run from WSL filesystem paths (`\\wsl$\...`). Windows npm/cargo can't handle WSL symlinks, causing EISDIR errors.

- Added robocopy step to sync project to `%USERPROFILE%\tauri-build\claude-usage` (excluding node_modules, target, .git)
- npm install and tauri build now run on Windows-native path
- Built MSI is copied back to WSL source directory
- Added build progress output: estimated time warning, 30-second heartbeat timer, total build time report
- Prevents "frozen" appearance during long Rust compilation

## 2026-03-20 — DPI-Aware Popover Positioning (Tauri)

Implemented DPI-aware popover positioning in `lib.rs` so the popover anchors to the tray icon on Windows at any display scaling.

- `toggle_popover` now accepts `tray_rect: tauri::Rect` from the tray click event
- Converts physical→logical pixels via `to_logical(scale_factor)` using `primary_monitor().scale_factor()`
- Centers popover horizontally on tray icon, positions above (flips below if near screen top)
- Clamps to screen bounds with 8px margin to prevent clipping
- Added `.position(x, y)` to `WebviewWindowBuilder` chain

## 2026-03-20 — Autostart Toggle in Settings UI (Tauri)

Added "Launch at login" checkbox to the Settings Preferences section, wired to `@tauri-apps/plugin-autostart` JS API.

- Imported `enable`, `disable`, `isEnabled` from `@tauri-apps/plugin-autostart` in `settings.ts`
- Added checkbox in Preferences section (reuses existing `.checkbox-group` CSS)
- Checkbox state initialized from `isEnabled()` after render
- Change listener calls `enable()` or `disable()` — manages Windows Registry entry directly
- No Rust changes needed — plugin was already initialized with capabilities granted
- TypeScript build verified (`npm run build` passes)

## 2026-03-20 — Error Handling Edge Cases (Tauri)

Added try/catch error resilience to all three frontend files (main.ts, settings.ts, overlay.ts).

- Popover `init()` catches backend failures and shows "Failed to load — click to retry" banner
- Event listener callbacks wrapped in try/catch to prevent render crashes from killing the event loop
- Fixed perpetual "Loading..." state: distinguishes "no data yet" vs "fetch returned empty" using `last_updated`
- Network error banner now clickable with retry action
- Settings: save/test/rename/delete operations all have error feedback (testResult banner or alert)
- Settings: overlay/config/autostart toggle handlers wrapped to prevent UI crashes
- Overlay: init failure and render errors show "--" fallback instead of blank widget
- No Rust changes — backend already handles all error states correctly

## 2026-03-20 — PowerShell NativeCommandError Fix (Tauri)

Fixed `setup-windows.ps1` to prevent PowerShell NativeCommandError from killing the build script.

- Wrapped `npm install` with `$ErrorActionPreference = "Continue"` + explicit `$LASTEXITCODE` check — npm stderr warnings no longer terminate the script
- Added `$ErrorActionPreference = "Continue"` around the build log tailing loop — prevents `Get-Content` errors on locked log files from crashing the script
- Restored `$ErrorActionPreference = "Stop"` after the tailing loop
- Build failure now calls `exit 1` immediately instead of falling through to the MSI copy step

## 2026-03-20 — Brainstorm: New Ideas

Generated 11 new feature ideas across quick wins, medium efforts, and larger initiatives. Key themes: feature parity (sparklines, pace indicators for Tauri), UX polish (clipboard copy, keyboard shortcuts, light theme, offline mode), and new product directions (browser extension, CLI tool, unified Rust core library). Appended to `tasks/ideas.md`.

## 2026-03-25 — Pace-Aware Session Emoji (macOS)

Made session emoji pace-aware using time-based ratio (actual vs expected usage within 5-hour window) instead of raw utilization thresholds. Reuses same pace thresholds as weekly (1.15/1.4 ahead, 0.85/0.6 behind). Added `sessionPaceRatio()` with shorter stability guards (15 min elapsed, 5 min remaining vs 6 hours for weekly). Falls back to raw thresholds before stability window.

## 2026-03-25 — Separate Session & Weekly Pace Emojis + Menu Bar Improvements (macOS)

Split the menu bar emoji into two independent indicators: session emoji (based on 5-hour utilization thresholds) and weekly emoji (based on pace ratio). Previously both used the weekly pace status, so session always showed the same emoji regardless of session utilization.

- Added `sessionPaceStatus` computed property: >=100% limitHit, >=80% critical, >=60% warning, else onTrack
- Added `targetEmoji` and `weeklyEmoji` properties to `PaceTheme`
- Added `todayUsagePercent` — delta in weekly utilization since midnight via history snapshots
- Simplified `dailyBudgetPercent` — removed 6-hour warm-up guard, shows budget from the start
- Updated menu bar format: `{sessionEmoji} {session}% · {target} {today}%/{budget}%/day · {weeklyEmoji} {weekly}%/w · {time}`
- Updated `weeklyPaceDetail` popover text to include today% and weekly% with themed emojis

## 2026-03-31 — Expert Code Review

Conducted full expert code review across both Swift (macOS) and Tauri (Rust + TypeScript) codebases. Reviewed all 20 Swift files, 9 Rust files, 8 TypeScript files, and configuration. Verified findings against actual source to filter false positives (dropped 5). Final findings added to `tasks/todo.md`: 3 High (DateFormatter perf, reqwest::Client reuse, silent GitHub errors), 3 Medium (GraphQL escaping, test coverage, code duplication), 5 Low (caching, migration, thread safety, tokio features, delete confirmation), 1 spec conformance note.

## 2026-03-18 — Behind-Pace Status + Hover Tooltip (macOS)

Added underutilization detection and a hover tooltip on the menu bar item.

**Behind-pace status:**
- Added `behindPace` and `wayBehind` cases to `PaceStatus` enum
- All 3 pace themes now have emoji for behind-pace states (Running: 🦥/🛌, Racecar: 🚗/🅿️, F1: 🔵/⚪)
- `paceStatus` checks ratio < 0.85 (behindPace) and < 0.6 (wayBehind) in pace-aware mode
- `UsageBar.paceColor` maps new statuses to yellow/red
- Menu bar daily budget now shows pace emoji prefix

**Hover tooltip:**
- `AppDelegate` finds `NSStatusBarButton` via `NSStatusBarWindow` view hierarchy walk
- Custom borderless floating `NSWindow` tooltip — native `toolTip` is suppressed on status bar buttons by macOS
- Global `NSEvent.addGlobalMonitorForEvents` tracks mouse position over the status item
- `paceGuidance` computed property provides just the status message (e.g. "Behind pace — pick it up")
- Tooltip updates live via Combine subscription on `$usageData`

## 2026-04-02 — Fix API Response Parse Error + Error Diagnostics (macOS)

Fixed broken usage display caused by Claude API changing the `extra_usage` response format from `UsageLimit` shape to a new object with `is_enabled`, `monthly_limit`, `used_credits`, `utilization`. The JSON decoder failed but the error was silently classified as "Network error" with no diagnostic detail, and with no cached data the app showed an infinite spinner.

- Added `ExtraUsage` struct for new API shape, with `asUsageLimit` bridge for display compatibility
- `ErrorState.networkError` now carries `detail: String` (HTTP status, "Parse error", "Connection failed")
- Added `os.log` logging (`com.claudeusage` subsystem) in ViewModel error handlers
- New error UI in ContentView: "Request Failed" + detail + Retry button when no cached data (was infinite spinner)
- Added `NSSupportsAutomaticTermination=false` / `NSSupportsSuddenTermination=false` to Info.plist
- Added `ProcessInfo.disableAutomaticTermination` in AppDelegate
