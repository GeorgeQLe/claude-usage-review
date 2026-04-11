# Claude Usage — Tauri App

Cross-platform version of the Claude Usage menu bar app, built with Tauri 2 + React + TypeScript.

## Development

```bash
npm install          # Install frontend dependencies
npm run tauri dev    # Run in development mode
npm run tauri build  # Build for production
```

## Architecture

- **Frontend**: React + TypeScript + Vite
- **Backend**: Rust (Tauri commands for keychain, polling, system tray)
- **State**: Tauri AppState with event-based frontend updates

## Multi-Provider Status

The app supports a multi-provider architecture for tracking usage across AI services:

- **Provider card types** and frontend rendering are fully wired up (Step 7.1–7.4)
- **Claude provider** is live — fetches exact usage data from the Claude API
- **Codex CLI** and **Gemini CLI** adapters are type-defined but adapter logic is deferred
- Provider cards are rendered in the popover via `ProviderCard` components and updated on each poll cycle

See [`docs/cross-platform-parity.md`](../docs/cross-platform-parity.md) for the full macOS ↔ Tauri feature matrix.
