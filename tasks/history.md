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
