# CLAUDE.md — Claude Usage Menu Bar App

## Project Overview
A native macOS menu bar app that displays Claude.ai subscription usage limits.
See SPEC.md for full specification and prd.json for user stories.

## Tech Stack
- Swift + SwiftUI
- macOS 13+ (MenuBarExtra)
- Xcode project (MenuBarExtra requires app bundle)
- URLSession for networking
- Keychain for secure storage

## Build & Test
```bash
xcodebuild -scheme ClaudeUsage -destination 'platform=macOS' build    # Build the app
xcodebuild test -scheme ClaudeUsage -destination 'platform=macOS'     # Run unit tests
```

## Key Architecture Decisions
- Xcode project with ClaudeUsage app target and ClaudeUsageTests test target
- MenuBarExtra with .menuBarExtraStyle(.window) for popover
- LSUIElement=true (no dock icon) — set via Info.plist in bundle
- Session key stored in macOS Keychain (Security framework)
- Polls https://claude.ai/api/organizations/{orgId}/usage every 5 min

## API Details
- **Endpoint:** GET https://claude.ai/api/organizations/{orgId}/usage
- **Auth:** Cookie header with sessionKey
- **Headers:** anthropic-client-platform: web_claude_ai
- **Session key TTL:** ~30 days, echoed in Set-Cookie but not rotated
- See prd.json US-002 notes for sample JSON response

## Conventions
- Keep files small and focused
- Models in ClaudeUsage/Models/
- Views in ClaudeUsage/Views/
- Services in ClaudeUsage/Services/
- Tests in ClaudeUsageTests/

## Workflow Orchestration

### 1. Plan Mode Default
- Enter plan mode for ANY non-trivial task (3+ steps or architectural decisions)
- If something goes sideways, STOP and re-plan immediately — don't keep pushing
- Use plan mode for verification steps, not just building
- Write detailed specs upfront to reduce ambiguity

### 2. Subagent Strategy
- Use subagents liberally to keep main context window clean
- Offload research, exploration, and parallel analysis to subagents
- For complex problems, throw more compute at it via subagents
- One task per subagent for focused execution

### 3. Self-Improvement Loop
- After ANY correction from the user: update `tasks/lessons.md` with the pattern
- Write rules for yourself that prevent the same mistake
- Ruthlessly iterate on these lessons until mistake rate drops
- Review lessons at session start for relevant project

### 4. Verification Before Done
- Never mark a task complete without proving it works
- Diff your behavior between main and your changes when relevant
- Ask yourself: "Would a staff engineer approve this?"
- Run tests, check logs, demonstrate correctness

### 5. Demand Elegance (Balanced)
- For non-trivial changes: pause and ask "is there a more elegant way?"
- If a fix feels hacky: "Knowing everything I know now, implement the elegant solution"
- Skip this for simple, obvious fixes — don't over-engineer
- Challenge your own work before presenting it

### 6. Autonomous Bug Fixing
- When given a bug report: just fix it. Don't ask for hand-holding
- Point at logs, errors, failing tests — then resolve them
- Zero context switching required from the user
- Go fix failing tests without being told how

## Task Management

1. **Plan First**: Write plan to `tasks/roadmap.md` (full plan) and `tasks/todo.md` (current phase) with checkable items
2. **Verify Plan**: Check in before starting implementation
3. **Track Progress**: Mark items complete as you go
4. **Explain Changes**: High-level summary at each step
5. **Document Results**: Add review section to `tasks/todo.md`
6. **Capture Lessons**: Update `tasks/lessons.md` after corrections

## Core Principles
- **Simplicity First**: Make every change as simple as possible. Impact minimal code.
- **No Laziness**: Find root causes. No temporary fixes. Senior developer standards.
- **Minimal Impact**: Changes should only touch what's necessary. Avoid introducing bugs.
- **No GitHub Actions**: Do not create, modify, or suggest GitHub Actions workflows. This project does not use GitHub Actions for CI/CD.
