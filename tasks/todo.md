# Phase 1: Electron Runtime Foundation

> Project: ClaudeUsage Electron cross-platform app
> Source: `specs/electron-cross-platform-ai-usage-monitor.md`
> Scope: Create the secure Electron/React runtime foundation for the Windows/Linux implementation while keeping Swift as the premium macOS app.
> Test strategy: tests-after

## Implementation
- [x] Step 1.1: [automated] Scaffold `electron-app/` with Electron, React, TypeScript, Vite, Electron Builder, Vitest, and project scripts in `electron-app/package.json`, `electron-app/vite.config.ts`, `electron-app/electron-builder.yml`, `electron-app/tsconfig*.json`, and `electron-app/src/`.
- [ ] Step 1.2: [automated] Add the initial folder/module structure from the spec: `electron-app/src/main/`, `electron-app/src/preload/`, `electron-app/src/renderer/`, and `electron-app/src/shared/`, including shared type/schema placeholders for accounts, usage state, provider cards, settings, and IPC payloads.
- [ ] Step 1.3: [automated] Implement the secure Electron main-process bootstrap in `electron-app/src/main/app.ts`, `electron-app/src/main/windows.ts`, and `electron-app/src/main/tray.ts`: single-instance lock, app lifecycle, tray creation, context menu skeleton, popover/settings/overlay/onboarding windows, CSP-ready local loading, and Linux tray fallback handling.
- [ ] Step 1.4: [automated] Add a narrow preload bridge in `electron-app/src/preload/index.ts` and `electron-app/src/preload/api.ts` using `contextBridge`, with Node integration disabled and context isolation/sandbox options set on all renderer windows.
- [ ] Step 1.5: [automated] Add IPC registration and validation skeletons in `electron-app/src/main/ipc.ts` plus shared schemas under `electron-app/src/shared/schemas/` for the commands listed in the spec.
- [ ] Step 1.6: [automated] Add storage primitives in `electron-app/src/main/storage/`: SQLite connection/migrations for structured app data, `safeStorage` secret wrapper, redaction helpers, and a Linux `basic_text` backend warning surfaced through derived app state.
- [ ] Step 1.7: [automated] Add minimal React renderer entries for popover, settings, onboarding, and overlay under `electron-app/src/renderer/`, with placeholder state loaded through the preload API and no direct filesystem or Node access.

## Green
- [ ] Step 1.8: [automated] Add regression coverage for the foundation: Vitest tests for schema validation/redaction/storage wrappers where possible, an Electron main-process smoke test for window/tray action routing, and a renderer smoke test proving placeholder windows mount without secret/Node access.
- [ ] Step 1.9: [automated] Run Phase 1 verification: `npm run typecheck`, `npm test`, `npm run build`, and an Electron dev launch smoke command from `electron-app/`.

## Milestone
- [ ] `electron-app/` exists and starts locally.
- [ ] Main/preload/renderer boundaries are in place and secure by default.
- [ ] Renderer windows mount through React and only use the typed preload API.
- [ ] SQLite and secret-storage abstractions exist, with Linux weak-backend warning plumbing.
- [ ] Tray, popover, settings, onboarding, and overlay window shells exist.
- [ ] All phase tests pass.
- [ ] No regressions.

## Next Step Plan: Step 1.2

Move the Step 1.1 flat scaffold entries into the spec-aligned module layout while preserving the working package scripts.

Files to modify or create:
- `electron-app/src/main/`: move the minimal Electron entry into `app.ts` and add placeholder module exports for `windows.ts`, `tray.ts`, and `ipc.ts` only as needed to keep imports typed.
- `electron-app/src/preload/`: move the preload entry into `index.ts` and add `api.ts` with the initial typed preload surface placeholder.
- `electron-app/src/renderer/`: move the React renderer into a spec-aligned entry and create placeholder directories for `app/`, `settings/`, `overlay/`, `onboarding/`, `components/`, and `styles/`.
- `electron-app/src/shared/`: add type/schema placeholder files for accounts, usage state, provider cards, settings, and IPC payloads under `types/` and `schemas/`.
- `electron-app/package.json`, `electron-app/tsconfig*.json`, and `electron-app/vite.config.ts`: update entry paths after the file moves.

Validation:
- Run `npm run typecheck`, `npm test -- --run`, and `npm run build` from `electron-app/`.
