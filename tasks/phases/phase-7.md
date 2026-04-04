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
- [x] Thread-safe KeychainService cache
- [x] Add test coverage
- [x] Document stability thresholds (`state.rs`)
- [x] Log corrupted config (`config.rs`)
- [x] Escape HTML in usage-bar.ts

## Low
- [x] Slim tokio features
- [x] Account delete confirmation
- [x] Rename email → name in AccountMetadata
- [x] Fix menu bar text spacing
- [x] Align keyring service name

## Spec conformance
- [x] Auto-prompt re-auth on 401/403
- [x] Network error backoff
