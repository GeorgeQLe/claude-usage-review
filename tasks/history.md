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
