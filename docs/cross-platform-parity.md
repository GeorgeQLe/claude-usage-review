# Cross-Platform Parity: macOS ↔ Tauri

Last updated: 2026-04-11 (after Step 7.4)

Status key: **Ported** = feature-complete in Tauri | **Gap** = macOS-only, not yet in Tauri | **Deferred** = types exist but adapter/logic not implemented | **N/A** = platform-specific, no equivalent needed

---

## Feature Matrix

### Auth

| Feature | macOS | Tauri | Status | Notes |
|---------|-------|-------|--------|-------|
| Keychain/keyring storage | ✅ | ✅ | Ported | macOS Keychain → `keytar` via Tauri plugin |
| Session key rotation | ✅ | ✅ | Ported | |
| Multi-account | ✅ | ✅ | Ported | |
| Test connection | ✅ | ✅ | Ported | |

### Polling

| Feature | macOS | Tauri | Status | Notes |
|---------|-------|-------|--------|-------|
| 5-min interval + backoff | ✅ | ✅ | Ported | |
| Auto-fetch at reset time | ✅ | ❌ | Gap | macOS schedules a fetch when the usage window resets |

### Usage Display

| Feature | macOS | Tauri | Status | Notes |
|---------|-------|-------|--------|-------|
| Session/Weekly limits | ✅ | ✅ | Ported | |
| Optional limits (Sonnet/Opus/etc) | ✅ | ✅ | Ported | |
| Pace indicators (▲/▼) | ✅ | ✅ | Ported | |
| Budget per day | ✅ | ✅ | Ported | |
| Reset time + remaining time | ✅ | ✅ | Ported | |
| Live countdown timer (1s tick) | ✅ | ❌ | Gap | macOS has `h:mm:ss` live tick via Timer |
| Usage history snapshots | ✅ | ❌ | Gap | macOS persists periodic snapshots for trend view |
| 24h sparklines | ✅ | ❌ | Gap | macOS renders inline sparkline charts |

### Menu Bar / Tray

| Feature | macOS | Tauri | Status | Notes |
|---------|-------|-------|--------|-------|
| Tray icon 3-color | ✅ | ✅ | Ported | Green/yellow/red based on usage % |
| Dynamic tooltip text | ✅ | ✅ | Ported | |
| Popover on click | ✅ | ✅ | Ported | |
| Context menu (Refresh/Settings/Overlay/Quit) | ✅ | ✅ | Ported | |
| Circular progress ring | ✅ | ❌ | Gap | macOS-only SwiftUI ring in popover |
| Pace emoji themes (Running/Racecar/F1) | ✅ | ❌ | Gap | macOS-only theme picker |
| Hover tooltip (floating) | ✅ | ❌ | Gap | macOS-only NSWindow floating tooltip |

### Overlay

| Feature | macOS | Tauri | Status | Notes |
|---------|-------|-------|--------|-------|
| 3 layouts (Compact/Minimal/Sidebar) | ✅ | ✅ | Ported | |
| Always-on-top, drag-to-move | ✅ | ✅ | Ported | |
| Position persistence | ✅ | ✅ | Ported | |
| Opacity control | ✅ | ✅ | Ported | |
| Double-click → popover | ✅ | ✅ | Ported | |

### Settings

| Feature | macOS | Tauri | Status | Notes |
|---------|-------|-------|--------|-------|
| Account management | ✅ | ✅ | Ported | |
| Time display format | ✅ | ✅ | Ported | |
| Launch at login | ✅ | ✅ | Ported | |
| Overlay config | ✅ | ✅ | Ported | |
| Pace theme picker | ✅ | ❌ | Gap | macOS-only preference |
| Weekly bar color mode | ✅ | ❌ | Gap | macOS-only preference |
| GitHub integration (PAT + heatmap) | ✅ | ❌ | Gap | macOS-only feature |

### Multi-Provider

| Feature | macOS | Tauri | Status | Notes |
|---------|-------|-------|--------|-------|
| Provider types + cards | ✅ | ✅ | Ported | TypeScript types + React card rendering |
| Codex CLI adapter (history.jsonl) | ✅ | ❌ | Deferred | Types defined, adapter logic not implemented |
| Gemini CLI adapter (session files) | ✅ | ❌ | Deferred | Types defined, adapter logic not implemented |
| Accuracy Mode wrapper | ✅ | ❌ | Deferred | |
| Plan profiles | ✅ | ❌ | Deferred | |
| Provider toggles in Settings | ✅ | ❌ | Deferred | |
| Tray rotation policy | ✅ | ❌ | Deferred | |

### Notifications

| Feature | macOS | Tauri | Status | Notes |
|---------|-------|-------|--------|-------|
| Session reset notification | ✅ | ❌ | Gap | macOS uses `UNUserNotificationCenter` |

### Platform-Specific

| Feature | macOS | Tauri | Status | Notes |
|---------|-------|-------|--------|-------|
| No dock icon (LSUIElement) | ✅ | — | N/A | Tauri handles via window config |
| Windows fallback dialog | — | ✅ | Tauri-only | Auth dialog for platforms without keyring |
| DPI-aware positioning | ✅ | ✅ | Ported | |

---

## Summary

- **Ported**: 25 features fully working in both platforms
- **Gap**: 11 features present in macOS but missing from Tauri
- **Deferred**: 6 multi-provider features with types only (no adapter logic)
- **Tauri-only**: 1 (Windows fallback dialog)
- **N/A**: 1 (LSUIElement — platform-specific)

## Priority Gaps for Future Work

1. **Live countdown timer** — high-visibility UX feature
2. **Session reset notification** — important for power users
3. **Auto-fetch at reset time** — ensures fresh data at the right moment
4. **Usage history / sparklines** — trend visibility
5. **Multi-provider adapters** — Codex + Gemini adapter logic
