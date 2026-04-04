# Claude Usage Menu Bar App — Spec

## Overview

A cross-platform menu bar / system tray app that displays Claude.ai subscription usage limits (session + weekly) at a glance. Polls the unofficial `claude.ai/api/organizations/{orgId}/usage` endpoint.

**Platforms:**
- **macOS** — native Swift + SwiftUI (`MenuBarExtra`)
- **Windows / Linux** — Tauri 2 (Rust + TypeScript + Vite)

## Data Source

**Endpoint:** `GET https://claude.ai/api/organizations/{orgId}/usage`  
**Auth:** `sessionKey` cookie (30-day TTL, echoed back in Set-Cookie but not rotated)  
**Headers:** `anthropic-client-platform: web_claude_ai`  
**Response:**
```json
{
  "five_hour": { "utilization": 17.0, "resets_at": "2026-02-08T18:59:59Z" },
  "seven_day": { "utilization": 11.0, "resets_at": "2026-02-14T16:59:59Z" },
  "seven_day_sonnet": { "utilization": 0.0, "resets_at": null },
  "seven_day_opus": { "utilization": 5.0, "resets_at": "..." },
  "seven_day_oauth_apps": null,
  "seven_day_cowork": null,
  "iguana_necktie": { "utilization": 0.0, "resets_at": null },
  "extra_usage": { "is_enabled": true, "monthly_limit": 100.0, "used_credits": 12.5, "utilization": 12.5 }
}
```

## Menu Bar Icon

A **circular progress ring** showing the highest current utilization, with pace emoji indicators:

- Ring fills proportionally (e.g. 40% used = ring 40% filled)
- Color coded by pace status (pace-aware mode) or raw percentage
- **Pace emoji indicators** — separate session and weekly emojis from selectable theme
- **Daily budget** — today's usage vs budget per day
- **Live countdown timer** — h:mm:ss updating every second (or reset time display)

**Format:** `{sessionEmoji} {session}% · {target} {today}%/{budget}%/day · {weeklyEmoji} {weekly}%/w · {time}`

**Pace themes** (3 selectable):
| Status | Running 🚶 | Racecar 🏎️ | F1 Quali 🟣 |
|--------|-----------|------------|-------------|
| On Track | 🚶 | 🏎️ | 🟣 |
| Behind Pace | 🦥 | 🚗 | 🔵 |
| Way Behind | 🛌 | 🅿️ | ⚪ |
| Warning | 🏃 | 🟡 | 🟢 |
| Critical | 🔥 | 🚨 | 🟡 |
| Limit Hit | 💀 | 🔴 | 🔴 |

**Hover tooltip** (macOS): Custom floating `NSWindow` tooltip showing pace guidance text (e.g. "Behind pace — pick it up"). Updates live via Combine subscription.

## Click-to-Expand Popover

```
┌─────────────────────────────────┐
│  ◀ account@email.com ▶         │
│                                 │
│  Session         ◑    16%      │
│  ████░░░░░░░░░░░░░░░░          │
│  2:45:30 remaining              │
│                                 │
│  Weekly          ◔    11%      │
│  ██░░░░░░░░░░░░░░░░░░          │
│  🎯 5%/14%/day · 📊 11%/w     │
│  6d left · On pace — use more  │
│                                 │
│  Sonnet                 0%     │
│  ░░░░░░░░░░░░░░░░░░░░          │
│                                 │
│  ▶ History                      │
│    Session ────╱╲───            │
│    Weekly  ──────────           │
│                                 │
│  ▶ GitHub Contributions         │
│    ░▓█░▓░░█▓▓░█░ (12-week grid)│
│                                 │
│  Updated 2m ago     🔄  ⚙️     │
└─────────────────────────────────┘
```

Each usage limit shows:
- Name + circular progress ring + percentage
- Horizontal bar with pace-aware or raw-percentage color
- Reset time / countdown timer
- Only shown if the field is present in the response (some are null)

Additional popover features:
- **Account picker** — left/right arrows to switch between multiple accounts
- **Usage history** — collapsible sparkline charts (session + weekly, last 24h)
- **GitHub contribution heatmap** — last 12 weeks, 5pt cells, GitHub green color scale with tooltips
- **Pace guidance** — actionable text under weekly bar (today%/budget%/day, days left, status)
- **Today usage %** — delta in weekly utilization since midnight

## Features

- [x] Menu bar circular progress ring with color coding
- [x] Local timezone time display next to icon (user selectable: reset time or remaining time)
- [x] Click to expand popover with all usage bars
- [x] Poll every 5 minutes
- [x] Reset countdown timers in local timezone
- [x] Settings: enter session key + org ID + time display preference
- [x] Store session key in Keychain (macOS) / Windows Credential Manager (Tauri)
- [x] Handle session key refresh from Set-Cookie responses
- [x] Graceful error states (expired session, network error with detail)
- [x] Launch at login option
- [x] Multi-account support with account picker
- [x] Usage history with sparkline charts (24h, compacted storage)
- [x] GitHub contribution heatmap (GraphQL API, 12-week grid)
- [x] Pace indicators (3 themes, 6 states, separate session/weekly emojis)
- [x] Desktop overlay widget (Tauri: 3 layouts — compact/minimal/sidebar, draggable)
- [x] Behind-pace / way-behind detection (underutilization alerts)
- [x] Hover tooltip with pace guidance (macOS)
- [x] Daily budget & today tracking (today%/budget%/day)
- [x] Auto-refresh on session reset + desktop notification
- [x] Live countdown timer (h:mm:ss, 1-second tick)
- [x] Pace-aware color mode for weekly bar (vs raw percentage mode)
- [x] Extra usage handling (new API shape with is_enabled/monthly_limit/used_credits)
- [x] DPI-aware popover positioning (Tauri)
- [x] Autostart toggle in settings (Tauri, via plugin-autostart)
- [x] Error diagnostics with os.log logging (macOS)
- [x] Network error exponential backoff (300s base, 2^n multiplier, 3600s cap)

## Auth Flow

1. **First launch:** User pastes `sessionKey` cookie value from browser dev tools
2. **Storage:** Session key stored in macOS Keychain (Swift) or Windows Credential Manager via `keyring` crate (Tauri), encrypted at rest
3. **Refresh:** Every response checked for `Set-Cookie: sessionKey=...` — if new value, credential store updated automatically
4. **Expiry:** If 401/403 received, show error badge on icon + prompt to re-auth. Tauri auto-opens settings window on auth error; macOS shows banner with "Open Settings" button
5. **Org ID:** User provides manually (no discovery endpoint available)

## Polling Strategy

- Default: every 5 minutes (300s)
- Manual refresh button always available
- **Network error backoff:** Exponential backoff on consecutive network failures — `min(300 * 2^n, 3600)` where n = consecutive error count. Progression: 600s → 1200s → 2400s → 3600s cap. Success or auth error resets counter to 0
- Auto-refresh at session reset time (schedules fetch at `resetsAt` timestamp)

## Tech Stack

### macOS (Swift)
- **Language:** Swift
- **UI:** SwiftUI + `MenuBarExtra` (macOS 13+)
- **Networking:** URLSession (native, no deps)
- **Storage:** UserDefaults for settings, Keychain for session key
- **Min target:** macOS 13 Ventura
- **Bundle:** LSUIElement=true (no dock icon)

### Windows / Linux (Tauri)
- **Backend:** Rust (Tauri 2)
- **Frontend:** TypeScript + Vite (vanilla, no framework)
- **Storage:** JSON config file + `keyring` crate for credentials
- **Plugins:** autostart, shell
- **Build:** `cargo tauri build` → MSI installer (Windows)

## File Structure

### macOS (Swift)
```
ClaudeUsage/
├── ClaudeUsageApp.swift              # App entry, MenuBarExtra
├── AppDelegate.swift                 # NSStatusItem tooltip, process lifecycle
├── Views/
│   ├── ContentView.swift             # Main popover content
│   ├── UsageBar.swift                # Single usage bar component
│   ├── CircleProgress.swift          # Circular progress ring
│   ├── SparklineView.swift           # Usage history sparkline chart
│   ├── ContributionHeatmapView.swift # GitHub contribution grid
│   └── SettingsView.swift            # Settings sheet (credentials, preferences)
├── Models/
│   ├── UsageData.swift               # Codable model for API response
│   ├── UsageViewModel.swift          # Polling, fetch, pace logic, backoff
│   ├── UsageSnapshot.swift           # History snapshot model
│   ├── ContributionData.swift        # GitHub contribution models
│   ├── GitHubViewModel.swift         # GitHub data fetching
│   └── Account.swift                 # Account model
├── Services/
│   ├── UsageService.swift            # API client (URLSession)
│   ├── KeychainService.swift         # Keychain read/write (thread-safe cache)
│   ├── AccountStore.swift            # Multi-account management
│   ├── HistoryStore.swift            # Usage history persistence + compaction
│   └── GitHubService.swift           # GitHub GraphQL API client
└── Info.plist
```

### Windows / Linux (Tauri)
```
tauri-app/
├── src/
│   ├── main.ts                       # Popover UI entry
│   ├── settings.ts                   # Settings window entry
│   ├── overlay.ts                    # Desktop overlay widget
│   ├── types.ts                      # Shared TypeScript types
│   ├── components/
│   │   ├── usage-bar.ts              # Usage bar component
│   │   ├── circle-progress.ts        # Circular progress ring
│   │   └── account-picker.ts         # Account switcher
│   └── utils/
│       └── escape.ts                 # HTML escaping utility
├── src-tauri/
│   ├── src/
│   │   ├── main.rs                   # Tauri entry point
│   │   ├── lib.rs                    # App setup, window management
│   │   ├── api.rs                    # API client (reqwest, connection pooled)
│   │   ├── commands.rs               # IPC command handlers (16 commands)
│   │   ├── config.rs                 # JSON config persistence
│   │   ├── credentials.rs            # Windows Credential Manager (keyring)
│   │   ├── models.rs                 # Data models
│   │   ├── overlay.rs                # Overlay window management (3 layouts)
│   │   └── state.rs                  # Polling loop, pace calculation, backoff
│   ├── permissions/
│   │   └── default.toml              # IPC permission declarations
│   └── capabilities/
│       └── default.json              # ACL capability grants
└── vite.config.ts
```

## Open Questions

- **Rate limiting:** Does claude.ai rate-limit the usage endpoint? Monitoring via CLI watch
- **TOS:** This uses an unofficial internal API — could break or be blocked at any time
