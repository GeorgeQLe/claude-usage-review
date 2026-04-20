## Documentation Recurring Work

- [ ] Run cohort review after launch metrics are available
  - Cadence: Monthly after public launch or beta usage begins.
  - Owner/agent: `$cohort-review`
  - Scope: ClaudeUsage product usage, activation, retention, and provider-monitoring adoption.
  - Trigger: A month of production or beta aggregate usage data exists.
  - Last run: never
  - Next due: First month after aggregate launch or beta metrics are available.
  - Command/skill: `$cohort-review`
  - Evidence/output path: `research/cohort-review-YYYY-MM-DD.md`
  - Escalation conditions: Promote to `tasks/todo.md` if launch metrics exist and no cohort review has been created for the current month.

- [ ] Run strategic retrospective after major outcomes
  - Cadence: Quarterly or after a major release/launch decision.
  - Owner/agent: `$retro`
  - Scope: Research decisions, roadmap choices, launch outcomes, and validation results.
  - Trigger: Major release shipped, launch results known, or quarter closes with meaningful product data.
  - Last run: never
  - Next due: First quarter end or major release outcome after research baseline exists.
  - Command/skill: `$retro`
  - Evidence/output path: `research/retro-YYYY-MM-DD.md`
  - Escalation conditions: Promote to `tasks/todo.md` when outcome data contradicts current assumptions or a completed phase needs decision review.

- [ ] Prepare stakeholder update when reporting is needed
  - Cadence: Monthly when stakeholder or investor reporting is active.
  - Owner/agent: `$investor-update`
  - Scope: Product progress, metrics, roadmap, risks, finances, and asks.
  - Trigger: Stakeholder reporting cycle starts, fundraising prep begins, or the user requests a monthly update.
  - Last run: never
  - Next due: First active reporting month after metrics, roadmap, and financial inputs exist.
  - Command/skill: `$investor-update`
  - Evidence/output path: `research/investor-update-YYYY-MM.md`
  - Escalation conditions: Promote to `tasks/todo.md` when reporting is requested and metrics, roadmap, risk, and finance docs are current enough to summarize.

- [ ] Refresh documentation queue after major documentation or release changes
  - Cadence: On release, after phase completion, or monthly during active development.
  - Owner/agent: `$research-roadmap`
  - Scope: `research/`, `specs/`, and `tasks/` documentation contract.
  - Trigger: A phase completes, source code materially changes after specs, or new research/spec artifacts are added.
  - Last run: 2026-04-20
  - Next due: Next phase completion, release, or 2026-05-20, whichever comes first.
  - Command/skill: `$research-roadmap`
  - Evidence/output path: `tasks/todo.md`, `tasks/record-todo.md`, and `tasks/recurring-todo.md`
  - Escalation conditions: Promote stale or missing documentation findings into `tasks/todo.md` when they are immediately actionable.
