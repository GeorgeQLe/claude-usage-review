# Cross-Platform Parity: Swift macOS and Electron

Last updated: 2026-04-19 (Phase 6 packaging documentation)

Status key: **Current** = intended supported path | **Development** = useful for local parity checks only | **Legacy** = retained for reference or migration | **Manual** = requires validation on real target machines

## Platform Ownership

| Platform | Current app path | Status | Notes |
|----------|------------------|--------|-------|
| macOS | Swift app in repository root | Current | Public premium app and canonical macOS menu-bar experience |
| Windows | `electron-app/` | Current | Electron Builder targets NSIS and portable artifacts |
| Linux | `electron-app/` | Current | Electron Builder targets AppImage and `deb` artifacts |
| macOS Electron | `electron-app/` | Development | Unsigned `dir` build for parity and local verification only |
| Tauri | `tauri-app/` | Legacy | Older cross-platform implementation, retained as migration source and historical reference |

## Electron Scope

Electron is intended to carry the Windows/Linux product path for:

- Claude exact usage, account management, polling, secure secret storage, and session-key rotation.
- Usage history, pace guidance, reset timing, provider rotation, Codex/Gemini monitoring, and Accuracy Mode wrappers where cross-platform APIs allow it.
- GitHub heatmap, overlay windows, local notifications, onboarding, settings, migration UI, diagnostics export, and packaged Windows/Linux artifacts.
- Non-secret migration from Swift and legacy Tauri sources. Session keys, GitHub tokens, provider auth tokens, cookies, API keys, prompts, and raw provider responses remain excluded and require re-entry.

## Packaging Contract

| Command | Purpose | Notes |
|---------|---------|-------|
| `npm run package:host` | Build the current host target with Electron Builder | Uses `electron-builder.yml` |
| `npm run package:mac:dir` | Create unsigned macOS Electron directory output | Development/parity only |
| `npm run package:win` | Build Windows NSIS and portable artifacts | Requires target-machine validation before release |
| `npm run package:linux` | Build Linux AppImage and `deb` artifacts | Requires target-desktop validation before release |
| `npm run package:config` | Validate packaging config expectations | Does not create installers |

Artifacts are written under `electron-app/release/`.

## Manual Validation Still Required

Automated and host-available package builds do not replace manual verification on the release platforms. Before treating Windows/Linux Electron packages as release-ready, validate:

- Windows NSIS install, portable launch, tray behavior, launch-at-login behavior, notifications, and packaged startup.
- Linux AppImage and `deb` launch, tray fallback behavior, notifications, `safeStorage` backend warning, and packaged startup on selected desktop environments.
- A live Claude credential smoke test that confirms secrets are stored only through the secret store and are never rendered back in Settings.

These manual items are tracked in `tasks/manual-todo.md` for Phase 6.

## Legacy Tauri Notes

The Tauri app is no longer the active Windows/Linux packaging path. It remains useful for comparing historical behavior and for importing non-secret metadata into Electron. New cross-platform packaging, diagnostics, migration UI, and regression-gate work should target `electron-app/`.
