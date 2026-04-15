# Electron Cross-Platform AI Usage Monitor Interview Log

## Initial Prompt

The user asked to create a spec that will build the existing Tauri app in Electron.

## Context Gathered

- The repository contains a Swift macOS app, a Tauri app, roadmap/task documents, and an existing multi-provider spec.
- The Swift app is the richest implementation and includes Claude exact usage, Codex/Gemini adapters, wrappers, history, GitHub heatmap, pace themes, live countdown, reset notifications, and provider rotation.
- The Tauri app is a partial cross-platform prototype with Claude live, provider-card types, overlay/settings/tray basics, and known remediation items.
- The existing Tauri frontend is vanilla TypeScript/Vite despite one README describing React.
- Existing uncommitted Swift changes were present before spec creation and were not touched.

## Questions and Decisions

### 1. Electron parity scope

Question: Should Electron target current Tauri parity, a sibling implementation, and a TypeScript main-process backend?

Recommendation presented:

- Target Tauri parity plus known fixes at first.
- Create a sibling `electron-app/`.
- Port backend behavior to TypeScript in the Electron main process.

User response: Agreed.

Decision: Initial Electron implementation was scoped as a sibling app using TypeScript main-process services.

### 2. Platform, migration, and frontend baseline

Question: Should Electron v1 target macOS plus Windows, import non-secret Tauri config while requiring session-key re-entry, and reuse the vanilla Vite frontend?

Recommendation presented:

- macOS + Windows v1.
- Import non-secret metadata, require session-key re-entry.
- Reuse vanilla TypeScript/Vite multi-page shape.

User response: Agreed.

Decision: These were temporarily accepted, then later revised when the user clarified the app should be a perfected product, not a parity clone.

### 3. Product ambition correction

User clarified: "I mean we should build it correctly, so create a full specced out perfected product."

Recommendation presented:

- Define a full Electron product rather than a Tauri parity clone.
- Treat Swift as the richest feature reference.
- Ship Claude, Codex, and Gemini as first-class providers.
- Add Gemini `/stats` support where available.
- Keep Codex confidence honest because local Codex usage has no official exact Compliance API source.

User response: Agreed with the recommendations for including all Swift-only features and adding Gemini/Codex improvements, but chose the alternate platform/product strategy.

Decision: Electron becomes the full cross-platform product, but not the replacement for Swift macOS.

### 4. Swift app role

Question: The user asked whether the Swift app is mostly the top menu item.

Answer provided: No. The Swift app is the complete premium macOS implementation: menu bar, popover, settings, credentials, history, GitHub heatmap, notifications, provider rotation, and Codex/Gemini adapters.

User response: This distinction is important and should be documented.

Decision: The spec explicitly documents that Swift remains the premium canonical macOS app and is not merely a menu-label prototype.

### 5. Electron platform target, frontend, and packaging

Question: Should Electron target Windows/Linux publicly, use React, and package unsigned Windows/Linux artifacts?

Recommendation presented:

- Windows + Linux primary; macOS supported for development/parity only.
- React + TypeScript + Vite renderer.
- Windows NSIS + portable, Linux AppImage + deb, optional unsigned macOS dev builds.
- Signing/notarization/auto-update post-v1.

User response: "y"

Decision: Accepted.

### 6. Migration, wrappers, and telemetry

Question: How should migration, Accuracy Mode setup, and telemetry/privacy work?

Recommendation presented:

- Import non-secret metadata only; require secrets to be re-entered.
- Accuracy Mode wrappers are off by default, explicit setup, and do not mutate shell profiles or PATH automatically.
- Local-only product telemetry; no remote analytics in v1.
- Persist only derived wrapper metadata, never raw prompts or stdout.

User response: Agreed.

Decision: Accepted.

### 7. Storage, tests, and implementation phasing

Question: Should the app use SQLite plus `safeStorage`, unit/integration/smoke tests, and a phased build plan?

Recommendation presented:

- SQLite for structured app data.
- Electron `safeStorage` for encrypted secret blobs with Linux backend warnings.
- Vitest unit tests, Electron main-process integration tests, Playwright/Electron smoke tests, fixture-based provider tests, packaging checks.
- Five phases: foundation/Claude, Swift feature parity UI, provider adapters, Accuracy Mode, migration/diagnostics/packaging.

User response: "yes looks good"

Decision: Accepted.

## Significant Deviations from the Initial Draft

- The request started as "build our Tauri app but in Electron."
- The final direction is broader: Electron should be a full cross-platform product for Windows/Linux, not a mechanical Tauri port.
- The Swift app was elevated from background context to the primary product reference because it contains the fuller product surface.
- Electron no longer replaces Swift on macOS; Swift remains the premium public macOS app.
- The frontend recommendation changed from reusing vanilla TypeScript to React + TypeScript + Vite because the perfected product has enough stateful UI to justify a component framework.
- Codex/Gemini are no longer deferred parity items; they are first-class provider requirements for the finished Electron product.

## Closing Coverage Summary

Covered:

- Product goals and non-goals.
- Platform strategy.
- Swift/Tauri/Electron roles.
- User profile.
- Tray, popover, settings, onboarding, overlay, and notification UX.
- Claude, Codex, Gemini, and GitHub data flows.
- Confidence model and provider-specific constraints.
- Storage, migration, security, privacy, wrappers, diagnostics, packaging.
- Testing and implementation phasing.

Open assumptions:

- The user has not provided code-signing certificates or release-channel infrastructure, so signing and auto-update remain post-v1.
- Upstream provider file formats and CLI output formats may change; parser implementations must be fixture-driven and diagnostics-heavy.
- Linux desktop tray support varies, so a fallback window/app indicator path is required.
