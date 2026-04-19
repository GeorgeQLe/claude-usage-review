# Manual Tasks — ClaudeUsage Electron Cross-Platform App

> Phase: 6 — Migration, Diagnostics, and Packaging
> These tasks require human action. Check them off as you complete them.

## Pre-Phase / Setup

No manual setup tasks.

## During Phase

No manual tasks during implementation.

## Post-Phase / Verification

- [ ] Run a live Claude credential smoke test with a real session key and org ID, then confirm the Electron app stores secrets only through the secret store and does not render them back in Settings. _(after: Step 6.7)_
- [ ] Validate the Windows NSIS installer and portable build on a real Windows machine, including tray behavior, launch at login, notifications, and packaged app startup. _(after: Step 6.7)_
- [ ] Validate the Linux AppImage and `deb` package on the selected target desktop environments, including tray fallback behavior, notifications, `safeStorage` backend warning, and packaged app startup. _(after: Step 6.7)_
