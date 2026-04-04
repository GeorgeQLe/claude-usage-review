# Phase 7: Expert Review Fixes

## Critical
- [x] Fix polling handle leak (`state.rs`)
- [x] Fix GraphQL injection (`GitHubService.swift`)

## High
- [x] Reuse reqwest::Client (`api.rs`)
- [x] Surface GitHub errors (`GitHubViewModel.swift`)
- [x] Sanitize eval() opacity input (`commands.rs`)
- [x] Fix blocking_lock in setup (`lib.rs`)
- [x] Extract restart-polling helper (`commands.rs`)

## Medium
- [ ] Thread-safe KeychainService cache
- [ ] Add test coverage
- [ ] Document stability thresholds (`state.rs`)
- [ ] Log corrupted config (`config.rs`)
- [ ] Escape HTML in main.ts

## Low
- [ ] Slim tokio features
- [ ] Account delete confirmation
- [ ] Rename email → name in AccountMetadata
- [ ] Fix menu bar text spacing
- [ ] Align keyring service name

## Spec conformance
- [ ] Auto-prompt re-auth on 401/403
- [ ] Network error backoff

