## Documentation Records

- [ ] Create customer feedback research when real feedback is available
  - Source: `$customer-feedback`
  - Condition: User interviews, support messages, reviews, surveys, sales notes, or release feedback are available to ingest.
  - Non-blocking reason: No customer-feedback source files or aggregates were present in the 2026-04-19 documentation scan, so this cannot be completed from repo context alone.
  - Required data/access: Feedback exports, interview notes, support inbox excerpts, store reviews, survey results, or user-provided feedback summaries.
  - Measurement/query: Run `$customer-feedback` against the supplied feedback corpus and categorize findings against ICP, journey stage, pain point, and requested outcome.
  - Target/acceptance note: Produce `research/customer-feedback.md` with source coverage, recurring themes, severity, representative paraphrases, and implications for ICP, journey, monetization, and landing copy.
  - Revisit: After beta, release, user interview batch, or support-feedback export.
  - Completion evidence: `research/customer-feedback.md` plus a `tasks/history.md` entry summarizing the source set used.
  - Promotion rule: Move to `tasks/todo.md` when at least one concrete feedback corpus is available in the repo or provided by the user.

- [ ] Create burn-rate research when cost data is available
  - Source: `$burn-rate`
  - Condition: Hosting, signing, distribution, CI, support, subscription, or labor-cost inputs are available.
  - Non-blocking reason: The 2026-04-19 documentation scan found product and implementation docs, but no financial or infrastructure cost source suitable for a burn-rate estimate.
  - Required data/access: Monthly infrastructure bills, app distribution costs, paid tooling subscriptions, CI usage, contractor/staffing assumptions, and revenue or pricing assumptions if available.
  - Measurement/query: Run `$burn-rate` using monthly fixed and variable costs, then calculate payback period against monetization assumptions.
  - Target/acceptance note: Produce `research/burn-rate.md` with monthly burn, cost drivers, sensitivity notes, and confidence level.
  - Revisit: Monthly, or when hosting/distribution/tooling cost structure changes.
  - Completion evidence: `research/burn-rate.md` plus cited source data or user-provided assumptions.
  - Promotion rule: Move to `tasks/todo.md` when cost inputs are available and current monetization research exists.

- [ ] Create runway model when revenue and burn assumptions are available
  - Source: `$runway-model`
  - Condition: `research/monetization.md`, `research/burn-rate.md`, and revenue, cash, or funding assumptions exist.
  - Non-blocking reason: Runway cannot be modeled from the current repository alone because burn, cash balance, and revenue trajectory inputs are absent.
  - Required data/access: Current cash or budget limit, revenue targets, subscription conversion assumptions, support costs, and the completed burn-rate model.
  - Measurement/query: Run `$runway-model` with base, conservative, and upside scenarios.
  - Target/acceptance note: Produce `research/runway-model.md` with runway months, break-even assumptions, scenario table, and update triggers.
  - Revisit: Monthly after burn-rate updates or when pricing/revenue assumptions change.
  - Completion evidence: `research/runway-model.md` plus a history entry noting the assumptions used.
  - Promotion rule: Move to `tasks/todo.md` after monetization and burn-rate research are current and financial inputs are available.
