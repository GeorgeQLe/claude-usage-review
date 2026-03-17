# ClaudeUsage (fork)

A macOS menu bar app that shows your Claude.ai subscription usage limits at a glance.

Forked from [linuxlewis/claude-usage](https://github.com/linuxlewis/claude-usage) with additional features.

![Screenshot](screenshot.png)

## What's different from the original

| Feature | Original | This fork |
|---------|----------|-----------|
| **Weekly pace indicator** | — | `▲`/`▼` arrow in menu bar when usage is ahead/behind linear pace |
| **Daily budget text** | — | `~12%/day remaining (4d left)` shown under the Weekly bar in the popover |
| **Time display toggle** | — | Choose between reset time ("3:45 PM") or remaining time ("2h 15m") in menu bar |
| **Multi-account support** | — | Add, switch, and rename multiple Claude accounts |

### Weekly pace indicator

The menu bar now shows: `69% · 34%W▲ · 3:00 PM`

- `▲` — burning ahead of pace (usage/expected ratio > 1.15)
- `▼` — under pace, room to use more (ratio < 0.85)
- *(nothing)* — on track (within 15% of linear usage)

The popover's Weekly bar also shows a daily budget: how much you can use per day for the rest of the window without hitting the cap.

Edge cases are handled — no indicator shown in the first 6 hours of a window or the last hour before reset.

## Getting Started

1. **Download** the latest release from [GitHub Releases](https://github.com/GeorgeQLe/claude-usage-review/releases/latest) — grab `ClaudeUsage.zip`
2. **Unzip** and drag `ClaudeUsage.app` to your Applications folder
3. **Open** the app (first time: right-click → Open to bypass Gatekeeper since it's not code-signed)
4. **Click the gear icon** in the menu bar popover to open Settings
5. **Paste your credentials** (see below) and **Save**
6. **Choose your time display preference** — show either reset time or remaining time
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

## Notes

- Uses an **unofficial, undocumented** Claude.ai API endpoint — may break at any time
- Credentials are stored per-account: session keys in the macOS Keychain, org IDs and account metadata in UserDefaults
- Usage refreshes every 5 minutes

## Disclaimer

This project is not affiliated with, endorsed by, or associated with Anthropic, PBC. "Claude" and "Anthropic" are trademarks of Anthropic, PBC. All trademarks belong to their respective owners. This is an independent, unofficial tool that uses undocumented APIs and may stop working at any time.
