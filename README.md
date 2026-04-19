# ClaudeUsage (fork)

A macOS menu bar app that monitors your AI usage across Claude, Codex CLI, and Gemini CLI — all in one place.

Forked from [linuxlewis/claude-usage](https://github.com/linuxlewis/claude-usage) with additional features.

![Screenshot](screenshot.png)

## Platform strategy

The Swift app in this repository remains the public premium macOS app. The Electron app in `electron-app/` is the Windows/Linux path for cross-platform ClaudeUsage packaging and parity work. Electron macOS builds are unsigned development/parity artifacts only unless a later release decision changes public distribution.

The older Tauri implementation in `tauri-app/` is kept as legacy context and as a non-secret migration source for Electron; it is not the current Windows/Linux app path.

## What's different from the original

| Feature | Original | This fork |
|---------|----------|-----------|
| **Pace emoji indicator** | — | Animated emoji in menu bar reflecting pace status (3 selectable themes) |
| **Daily budget text** | — | `12%/day · 4d left · On pace` shown under the Weekly bar |
| **Live countdown timer** | — | Menu bar updates every second with h:mm:ss remaining |
| **Time display toggle** | — | Choose between reset time ("3:45 PM") or countdown ("2:45:30") |
| **Multi-account support** | — | Add, switch, and rename multiple Claude accounts |
| **Hover tooltip** | — | Hover over menu bar item for pace guidance |
| **Usage history sparklines** | — | 24-hour session & weekly utilization graphs in popover |
| **GitHub contribution heatmap** | — | Optional 12-week contribution heatmap in popover |
| **Session reset notifications** | — | macOS notification when your session limit resets |
| **Pace-aware bar colors** | — | Weekly bar colored by pace status instead of raw percentage |
| **Multi-provider monitoring** | — | Monitor Claude, Codex CLI, and Gemini CLI usage in one place |

### Pace indicator

The menu bar shows your session percentage, daily budget, a pace emoji, and a countdown:

`69% · 12%/day 🏃 2:45:30`

The pace emoji reflects how your weekly usage compares to linear pace:

- **On track** (ratio 0.85–1.15) — 🏃 / 🚗 / ⚪ (depending on theme)
- **Behind pace** — 🦥 / 🅿️ / 🔵
- **Way behind** — 🛌 / (parked) / 🟣
- **Warning** — 🔥 / 🚨 / 🟡
- **Critical** — 💀 / 🔴 / 🔴
- **Limit hit** (≥100%) — shown at cap

Three emoji themes available in Settings: **Running**, **Racecar**, and **F1 Quali**.

Edge cases are handled — no indicator shown in the first 6 hours of a window or the last hour before reset.

The popover's Weekly bar shows actionable pace guidance: daily budget percentage, days remaining, and a recommendation (e.g., "On pace — use more", "Way ahead — slow down").

### Hover tooltip

Hover over the menu bar item to see a floating tooltip with pace guidance — no click needed.

### Multi-Provider Monitoring

ClaudeUsage monitors usage across three AI providers:

| Provider | Detection | Data Source |
|----------|-----------|-------------|
| **Claude** | Session key in Settings | Direct API (exact usage) |
| **Codex** | Auto-detected when Codex CLI is installed | Local activity logs |
| **Gemini** | Auto-detected when Gemini CLI is installed | Local session files |

**Confidence levels** — each provider card shows how confident the estimate is:

- **Exact** — direct API data (Claude only)
- **High Confidence** — limit detection patterns observed + plan profile configured
- **Estimated** — wrapper events or plan profile present, but incomplete data
- **Observed Only** — activity detected but no plan configured; add a plan in Settings for better accuracy

**Accuracy Mode** (Codex & Gemini) — an optional setting that wraps CLI invocations to capture start/end timestamps and limit-hit signals. No prompt content is captured. Enable in Settings → provider toggle → Accuracy Mode.

**Provider Telemetry** (Codex & Gemini) — an optional setting, off by default and separate from Accuracy Mode, that reads provider-supplied quota endpoints when your existing CLI auth supports them. Codex can show provider rate-limit snapshots; Gemini Code Assist can show quota buckets. Endpoint access is experimental and unofficial, uses injected HTTP clients in tests, and falls back to passive monitoring when auth or endpoint shape is unavailable.

### Usage history

The popover includes collapsible sparkline graphs showing session and weekly utilization over the last 24 hours. History is persisted per-account and compacted over time.

### GitHub heatmap

Optionally configure a GitHub username and personal access token (with `read:user` scope) in Settings to display a 12-week contribution heatmap in the popover.

## Getting Started

1. **Download** the latest release from [GitHub Releases](https://github.com/GeorgeQLe/claude-usage-review/releases/latest) — grab `ClaudeUsage.zip`
2. **Unzip** and drag `ClaudeUsage.app` to your Applications folder
3. **Open** the app (first time: right-click → Open to bypass Gatekeeper since it's not code-signed)
4. **Click the gear icon** in the menu bar popover to open Settings
5. **Paste your credentials** (see below) and **Save**
6. **Choose your preferences** — time display format, pace emoji theme, weekly bar color mode
7. **Add more accounts** (optional) — click the **+** button in the popover

### Getting Your Credentials

You need two things from claude.ai:

**Session Key:**
1. Go to [claude.ai](https://claude.ai) and sign in
2. Open Developer Tools (`⌘⌥I`)
3. Go to **Application** → **Cookies** → `https://claude.ai`
4. Copy the `sessionKey` value (starts with `sk-ant-sid`)

**Organization ID:**
1. In the same cookies list, find the `lastActiveOrg` cookie
2. Copy its value — that's your org ID

Paste both into the Settings panel and you're good to go.

## Settings

- **Time display format** — Reset time ("3:45 PM") or countdown ("2:45:30")
- **Pace emoji theme** — Running, Racecar, or F1 Quali
- **Weekly bar color mode** — Pace-aware (colored by pace status) or raw percentage (traditional)
- **Launch at login** — start automatically on macOS login
- **GitHub integration** — username + personal access token for contribution heatmap
- **Test connection** — validate credentials without waiting for the next poll
- **Account management** — add, rename, switch, and delete accounts
- **Provider toggles** — enable/disable Codex and Gemini monitoring
- **Provider plans** — configure plan profiles for better accuracy estimates
- **Accuracy Mode** — optional wrapper for Codex/Gemini (captures timing only, no prompt content)
- **Provider Telemetry** — optional Codex/Gemini provider quota reads, off by default and separate from Accuracy Mode

## Building from Source

Requires macOS 13+ and Xcode 15+.

```bash
git clone https://github.com/GeorgeQLe/claude-usage-review.git
cd claude-usage-review
xcodebuild -scheme ClaudeUsage -configuration Release -destination 'platform=macOS' build
```

The app will be at:
```
~/Library/Developer/Xcode/DerivedData/ClaudeUsage-*/Build/Products/Release/ClaudeUsage.app
```

### Electron Windows/Linux app

The Electron implementation lives in `electron-app/`.

Current automated status as of 2026-04-19: the Electron path has passed typecheck, full Vitest, production build, route-level smoke coverage, packaging config validation, and the host-available unsigned macOS directory package. Windows and Linux release readiness still requires the manual target-machine checks below.

```bash
cd electron-app
npm install
npm run typecheck
npm test -- --run
npm run build
npm run smoke:electron
```

Packaging commands:

```bash
npm run package:host
npm run package:win
npm run package:linux
```

See `electron-app/README.md` for development, packaging, migration, diagnostics, and privacy notes. Windows and Linux installer artifacts require manual validation on real target machines before release.

## Notes

- Uses an **unofficial, undocumented** Claude.ai API endpoint — may break at any time
- Credentials are stored per-account: session keys in the macOS Keychain, org IDs and account metadata in UserDefaults
- Usage refreshes every 5 minutes; GitHub contributions refresh every hour
- Session key is automatically updated if the API rotates it via `Set-Cookie`
- Usage history is stored in `~/Library/Application Support/ClaudeUsage/`
- Codex and Gemini monitoring is passive — reads local log/session files only, no network calls
- Provider Telemetry is opt-in per provider. When enabled, it reads existing Codex or Gemini Code Assist auth at request time, persists only normalized quota snapshots, and does not persist raw tokens, raw endpoint responses, prompts, or model responses
- Automated Provider Telemetry tests use fixtures and fake clients only; they do not call live Codex, ChatGPT, Gemini, Google, Cloud Code, or Vertex endpoints

## Disclaimer

This project is not affiliated with, endorsed by, or associated with Anthropic, PBC, OpenAI, or Google. "Claude" and "Anthropic" are trademarks of Anthropic, PBC. "Codex" is a trademark of OpenAI. "Gemini" is a trademark of Google. All trademarks belong to their respective owners. This is an independent, unofficial tool that uses undocumented APIs and may stop working at any time.
