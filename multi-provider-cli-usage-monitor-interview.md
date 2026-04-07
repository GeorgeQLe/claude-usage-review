# Multi-Provider CLI Usage Monitor Interview Log

## Initial Draft

User request:

- build the same tool not just for Claude, but for Codex and Gemini as well

Initial assumption:

- extend the current Claude usage monitor into a multi-provider subscription monitor

## Foundational Context

- `research/icp.md` was not present
- existing product context came from `SPEC.md` and the current codebase
- current implementation is Claude-specific and assumes a usage endpoint returning utilization plus reset windows

## Questions, Options, and Decisions

### 1. Primary usage domain

Question:

- Is the target chat-app caps or CLI tool usage?

User response:

- not chat-app caps, but the CLI tool usage: Claude Code and Codex, for power-user 10x agentic programmers maximizing subscriptions

Decision:

- scope changed from general subscription monitoring to CLI-specific monitoring

### 2. Product positioning

Question:

- should the product promise exact remaining subscription quota across providers?

Research presented:

- Claude already has a working path in this app
- Codex does not expose local usage in the Compliance API
- Gemini has some published quota information but not uniform parity with Claude

Recommendation:

- frame the product as a multi-provider CLI usage monitor with provider-specific confidence, not fake-unified precision

User response:

- user narrowed the goal to preserving Claude and adding Codex and Gemini

Decision:

- keep Claude as-is and design new provider adapters instead of rewriting the existing model

### 3. Claude path

Question:

- should Claude ingestion be generalized or replaced while adding providers?

Recommendation:

- no, do not touch the Claude data path because it already works

User response:

- We should not touch how Claude data is being received since it is already working

Decision:

- Claude adapter must remain unchanged

### 4. User and plan focus

Question:

- should v1 focus on subscription-backed CLI usage or API-key-backed usage?

Options:

- subscription-backed first
- API-first
- both equally in v1

Recommendation:

- subscription-backed first

User response:

- agreed

Decision:

- prioritize Claude Code subscription path, Codex with ChatGPT plan, and Gemini subscription-like sign-in modes first

### 5. Privacy boundary

Question:

- can the app read local session/history files if it stores derived metrics only and not raw prompt content?

Options:

- yes, derived metrics only
- no local file reading

Recommendation:

- yes, derived metrics only

User response:

- agreed

Decision:

- passive local reading is allowed, but raw prompt text must not become stored product telemetry

### 6. App shell

Question:

- should the new product remain the existing desktop tray/menu bar app?

Options:

- stay desktop and reuse this codebase
- build a dedicated CLI/TUI
- build a web dashboard

Recommendation:

- stay desktop and reuse this codebase

User response:

- I like the existing desktop tray/menu bar app

Decision:

- desktop tray/menu bar app retained

### 7. Tray behavior

Question:

- should the tray auto-rotate across the three providers?

Options:

- auto-rotate every 5-10 seconds with manual override
- fixed provider with manual switch only

Recommendation:

- auto-rotate with manual override

User response:

- agreed

Decision:

- tray headline rotates across providers

### 8. Popover layout

Question:

- should the popover show all providers or only the active one?

Options:

- stack all three
- show current only

Recommendation:

- stack all three

User response:

- agreed

Decision:

- popover shows all configured providers at once

### 9. Adapter mode

Question:

- should Codex and Gemini start with passive local detection and later offer a higher-accuracy wrapper mode?

Options:

- passive default, wrapper optional
- wrapper required
- passive only

Recommendation:

- passive default, wrapper optional

User response:

- agreed

Decision:

- Codex and Gemini get passive mode first and provider-specific Accuracy Mode later

### 10. Platform scope

Question:

- should v1 target macOS only or macOS plus Tauri parity immediately?

Options:

- macOS first
- macOS + Tauri parity

Recommendation:

- macOS first, Tauri design-ready

User response:

- agreed

Decision:

- macOS first for the multi-provider rollout

### 11. Tray ordering semantics

Question:

- should the rotating tray optimize for urgency or simple rotation?

Options:

- best remaining headroom
- round-robin
- custom order

Recommendation:

- round-robin with optional pinning

User response:

- agreed

Decision:

- round-robin default with optional pinning

### 12. Onboarding detection

Question:

- should first-run setup auto-detect local installs and state?

Options:

- yes, auto-detect
- manual setup only

Recommendation:

- yes, auto-detect

User response:

- agreed

Decision:

- onboarding starts with detection, then asks for plan/auth confirmation

### 13. Codex precision model

Question:

- should Codex show a plan-window estimate instead of a fake precise percentage?

Options:

- yes, estimate with confidence labels
- no, require exact percentage only

Recommendation:

- yes

User response:

- agreed

Decision:

- Codex uses estimate plus confidence labeling unless a stronger exact signal is discovered later

### 14. Plan/auth declaration

Question:

- should users manually confirm plan per provider when auto-detection cannot prove it?

Options:

- yes
- no

Recommendation:

- yes

User response:

- agreed

Decision:

- setup collects user-confirmed plan/auth mode for Codex and Gemini

### 15. Wrapper granularity

Question:

- should wrapper mode be provider-specific instead of all-or-nothing?

Options:

- provider-specific
- all-or-nothing

Recommendation:

- provider-specific

User response:

- agreed

Decision:

- Claude stays untouched; Codex and Gemini can independently opt into Accuracy Mode

## Research Findings Used

- Claude Code docs indicate `/cost` is not intended for Claude Max and Pro subscribers, which argues against replacing the current Claude subscription path.
- OpenAI help says local Codex usage is not available in the Compliance API and documents plan windows as rough ranges, not exact local remaining counters.
- Gemini CLI docs publish personal Google account limits and structured CLI output options, which make passive detection plus wrapper instrumentation viable.
- Local machine inspection showed usable Codex and Gemini state directories under `~/.codex` and `~/.gemini`.

## Significant Deviations From Initial Draft

- The initial idea sounded like "same exact tool for three providers."
- The validated spec changed that into provider-specific adapters with confidence levels because Codex and Gemini do not expose Claude-like parity today.
- The final direction keeps Claude exact-ish and stable, lets Gemini be stronger where published quotas exist, and treats Codex as estimation-first unless a better signal is discovered.

## Closing Summary

Final direction:

- keep the existing desktop tray/menu bar shell
- preserve Claude ingestion unchanged
- add Codex and Gemini via new adapters
- auto-rotate tray status across providers
- show all providers stacked in the popover
- use passive local detection first
- offer provider-specific Accuracy Mode wrappers
- store derived metrics only
- ship macOS first
- present Codex honestly as estimate-plus-confidence instead of fake precision
