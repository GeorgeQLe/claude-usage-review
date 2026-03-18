# ClaudeUsage Windows App (Tauri 2) — Plan

## Phase 1: Scaffolding ✅
- [x] Create `tauri-app/` directory structure
- [x] `package.json`, `tsconfig.json`, `vite.config.ts` (multi-page: index, settings, overlay)
- [x] `Cargo.toml` with all dependencies (tauri, reqwest, keyring, chrono, uuid, etc.)
- [x] `tauri.conf.json` — tray icon config, no default windows, MSI bundle target
- [x] Generate tray icon PNGs (green/yellow/red, 32x32 circles)
- [x] Rust compiles (`cargo check` passes)
- [x] TypeScript compiles (`tsc --noEmit` passes)
- [x] Vite builds all 3 HTML entry points

## Phase 2: Core Backend (Rust) ✅
- [x] `models.rs` — UsageLimit, UsageData, AccountMetadata, DisplayLimit, UsageState, enums
- [x] `api.rs` — fetch_usage with headers, Set-Cookie parsing, error mapping (401/403 → AuthError)
- [x] `credentials.rs` — keyring crate wrapping Windows Credential Manager
- [x] `config.rs` — JSON config at AppData/ClaudeUsage/config.json
- [x] `state.rs` — polling (300s), pace calculation (▲/▼, 1.15/0.85 thresholds), time formatting, tray updates
- [x] `commands.rs` — 16 IPC handlers (usage, accounts CRUD, credentials, config, overlay)
- [x] `overlay.rs` — overlay window management (3 layouts, frameless/always-on-top)
- [x] `lib.rs` — Tauri setup with tray icon, context menu, popover toggle, autostart plugin

## Phase 3: Popover UI (Frontend) ✅
- [x] `types.ts` — TypeScript interfaces matching Rust structs
- [x] `components/circle-progress.ts` — SVG progress ring, color thresholds
- [x] `components/usage-bar.ts` — bar component with ring, percentage, reset time, pace detail
- [x] `components/account-picker.ts` — account switcher for 2+ accounts
- [x] `main.ts` — popover: usage-updated event listener, error states, add account, toolbar

## Phase 4: Settings Window ✅
- [x] `settings.ts` — editable name, auth status dot, credentials inputs, save/test, time format, overlay config, account list

## Phase 5: Overlay Widget ✅
- [x] `overlay.ts` — 3 layouts (compact bar, minimal text, vertical sidebar), draggable, opacity, double-click/right-click

## Phase 6: Polish
- [ ] Tauri capabilities/permissions for IPC commands
- [ ] Icon: proper .ico file for Windows (multi-resolution)
- [ ] DPI awareness: popover positioning relative to tray
- [ ] Autostart verification on Windows
- [ ] Error handling edge cases: empty states, Set-Cookie refresh in UI
- [ ] `cargo tauri build` producing working MSI installer
- [ ] End-to-end test on Windows

---

## Next Step Plan: Phase 6 — Polish (Tauri Capabilities)

### What needs to be done
Tauri 2 requires explicit capability declarations for IPC commands. Without these, the frontend `invoke()` calls will be blocked at runtime. We also need to add proper window permissions.

### Files to create/modify
- **`/tmp/claude-usage-review/tauri-app/src-tauri/capabilities/default.json`** — declare all 16 IPC commands + window + event permissions
- **`/tmp/claude-usage-review/tauri-app/src-tauri/tauri.conf.json`** — may need `capabilities` reference

### Technical details
Create `src-tauri/capabilities/default.json` with:
```json
{
  "identifier": "default",
  "windows": ["*"],
  "permissions": [
    "core:default",
    "core:event:default",
    "core:window:default",
    "core:window:allow-create",
    "core:window:allow-close",
    "core:window:allow-set-focus",
    "core:window:allow-set-position",
    "core:window:allow-outer-position",
    "autostart:default",
    // All 16 custom commands need allow entries
  ]
}
```

Each custom IPC command needs a permission entry. Check Tauri 2 docs for exact format — custom commands auto-generate permissions as `allow-{command-name}` (kebab-case).

### Acceptance criteria
- `cargo tauri dev` launches without IPC permission errors
- Frontend can call all 16 commands successfully
- Overlay window can be created/closed
- Settings window opens from tray menu
