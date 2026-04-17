# Phase 4: Provider Shell and Passive Adapters

> Project: ClaudeUsage Electron cross-platform app
> Source: `tasks/roadmap.md`
> Scope: Add the shared provider shell plus Codex/Gemini passive monitoring, Gemini `/stats`, confidence labels, stale/degraded handling, and provider settings wiring.
> Test strategy: tdd
> Status: complete on 2026-04-17

## Tests First
- [x] Step 4.1: [automated] Add failing tests for shared provider normalization, tray rotation/manual override/pinning, stale/degraded card mapping, Codex detection and parsing, Codex bookmarks, Gemini detection and parsing, Gemini `/stats` summary parsing, confidence engines, and provider settings persistence.

## Implementation
- [x] Step 4.2: [automated] Implement shared provider models and coordinator logic under `electron-app/src/shared/types/provider.ts`, `electron-app/src/shared/schemas/provider.ts`, `electron-app/src/shared/confidence/`, and `electron-app/src/main/providers/providerCoordinator.ts`.
- [x] Step 4.3: [automated] Implement Codex passive adapter under `electron-app/src/main/providers/codex/`: `CODEX_HOME` resolution, install/auth presence detection, `history.jsonl` incremental bookmarks, recursive `sessions/YYYY/MM/DD/rollout-*.jsonl` parsing, local log limit-hit detection, cooldown state, and privacy-safe derived events.
- [x] Step 4.4: [automated] Implement Gemini passive adapter under `electron-app/src/main/providers/gemini/`: `GEMINI_HOME`/`~/.gemini` resolution, settings/auth-mode detection, `oauth_creds.json` presence, `tmp/**/chats/session-*.json` parsing, token/model extraction, rate pressure, and local request windows.
- [x] Step 4.5: [automated] Implement Gemini `/stats` support under `electron-app/src/main/providers/gemini/stats.ts`, using a deliberate helper path and confidence labeling based on the reliability of command-derived summaries.
- [x] Step 4.6: [automated] Implement provider settings UI and IPC for Codex/Gemini enablement, plan/auth confirmation, confidence explanations, last refresh, stale/degraded diagnostics, and provider refresh actions.
- [x] Step 4.7: [automated] Wire provider state into tray rotation, popover provider cards, settings provider rows, overlay summaries, and diagnostics placeholders.

## Green
- [x] Step 4.8: [automated] Make all Phase 4 tests pass and add fixture coverage for malformed provider files, missing CLIs, unknown auth modes, stale refresh timestamps, degraded adapters, and confidence downgrade paths.
- [x] Step 4.9: [automated] Run Phase 4 verification: `npm run typecheck`, `npm test`, `npm run build`, and provider-card renderer smoke tests.

## Milestone
- [x] Claude, Codex, and Gemini are first-class provider cards in Electron.
- [x] Codex and Gemini passive monitoring is useful, confidence-labeled, stale-aware, and degraded-aware.
- [x] Gemini can incorporate `/stats` summaries where available.
- [x] Codex never claims exact remaining quota without a defensible source.
- [x] All phase tests pass.
- [x] No regressions.

## On Completion
- Deviations from plan: Provider-card smoke coverage was verified through the existing `npm run smoke:electron` route-level mocked harness rather than a provider-specific Playwright flow. The harness covered the shipped popover/settings/onboarding/overlay routes and local usage state.
- Tech debt / follow-ups: Vitest still discovers previously built `dist-electron` test files as well as `src` tests during full validation, so some suites run twice. This remains accepted from Phase 3 and should be cleaned up when test discovery is tightened.
- Ready for next phase: yes. Phase 5 starts with red tests for explicit opt-in Codex/Gemini Accuracy Mode wrappers, setup verification, wrapper event ledgers, confidence upgrades, and privacy guarantees.
