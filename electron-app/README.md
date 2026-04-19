# ClaudeUsage Electron

Electron is the Windows and Linux path for ClaudeUsage. The Swift app remains the public premium macOS app; Electron macOS output is a development and parity artifact unless a later release decision changes that.

## Platform Split

| Platform | App path | Distribution status |
|----------|----------|---------------------|
| macOS | Swift app in the repository root | Public premium app |
| Windows | `electron-app/` | Cross-platform path |
| Linux | `electron-app/` | Cross-platform path |
| macOS Electron | `electron-app/` | Unsigned development/parity build only |
| Tauri | `tauri-app/` | Legacy implementation and migration source |

## Development

```bash
cd electron-app
npm install
npm run dev
```

The dev command starts Vite on `127.0.0.1`, builds the main process bundle, then launches Electron.

## Verification

```bash
npm run typecheck
npm test -- --run
npm run build
npm run smoke:electron
npm run package:config
```

`npm run build` includes typecheck, Vitest, main/preload builds, and renderer build. `npm run smoke:electron` launches the app in mocked smoke mode and verifies the main routes mount without preload or security warnings. `npm run package:config` validates the Electron Builder target contract without creating installer artifacts.

## Packaging

```bash
npm run package:host
npm run package:mac:dir
npm run package:win
npm run package:linux
```

`package:host` builds the current host platform using `electron-builder.yml`. `package:mac:dir` creates an unsigned macOS directory build for development parity only. `package:win` targets Windows NSIS and portable artifacts. `package:linux` targets AppImage and `deb` artifacts.

Windows and Linux packages still need manual validation on real target machines before release. Host cross-build output only proves the builder configuration and artifact generation path available on the current machine.

Artifacts are written to `electron-app/release/`.

## Privacy

Claude session keys, GitHub personal access tokens, provider auth tokens, cookies, API keys, raw prompts, and raw model responses must not be imported, rendered back to the UI, written to diagnostics, or stored in normal SQLite tables.

Secrets are stored through Electron `safeStorage`. On Linux, the app reports when `safeStorage` falls back to the `basic_text` backend so users know local secret protection is weaker for that desktop session.

Codex and Gemini monitoring reads local CLI activity data. Accuracy Mode captures timing and limit-hit signals only, not prompt content.

## Migration

The Electron app can import non-secret metadata from the Swift and legacy Tauri apps:

- account labels and organization IDs
- active account hints
- display, provider, and overlay settings
- compatible usage history snapshots
- migration records and skipped-secret categories

Users must re-enter Claude session keys, GitHub tokens, and any future provider secrets after migration.

## Diagnostics

Diagnostics exports are redacted JSON intended for support and local debugging. They may include platform, app version, storage backend, provider detection, refresh times, failure counts, parse bookmarks, wrapper status, migration summaries, and recent redacted diagnostics events.

Diagnostics exports must not include session keys, GitHub tokens, provider auth tokens, cookies, API keys, raw prompts, raw model responses, raw provider endpoint responses, or raw stderr containing secret material.
