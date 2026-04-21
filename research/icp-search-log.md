# Pitwall ICP Search Log

> Date: 2026-04-21
> Output: `research/icp.md`
> Scope: Pitwall, powered by calcLLM, as a rebranded multi-provider AI coding usage strategy product.

## Business Model Classification

Primary classification: B2C subscription / prosumer developer tool.

Evidence:

- The current product is a local desktop app with menu bar/tray usage monitoring, manual credential setup, and privacy-sensitive local provider detection.
- The most accessible users are individual AI coding power users who can install and pay without procurement.
- Searches and forum evidence show individual developers actively trying to understand Claude Code, Codex, and Gemini usage limits.

Secondary classification: B2B SaaS PLG, later sales-led.

Evidence:

- Uber's reported Claude Code budget overrun shows enterprise AI coding adoption can become a budget governance issue.
- Jellyfish reports AI coding tool adoption at large company scale, based on more than 700 companies, 200,000 engineers, and 20 million PRs.
- Team/enterprise needs require features beyond the current product: SSO, fleet deployment, policy, dashboards, and procurement.

## Query Log

### Query 1: Developer AI Coding Tool Adoption

Queries:

- `2025 Stack Overflow Developer Survey AI coding tools daily use Claude Code Cursor Codex Windsurf`
- `JetBrains AI Pulse 2026 developers AI coding tools Claude Code Codex Gemini`
- `GitHub Octoverse 2025 AI agents coding assistant adoption developers`
- `State of AI in Software Development 2025 AI coding assistants usage limits developers`

Findings:

- Stack Overflow's 2025 AI survey reports broad professional developer usage of AI tools, including daily usage among professional developers.
- JetBrains' January 2026 AI Pulse reports 90% of developers regularly used at least one AI tool at work, and 74% had adopted specialized AI developer tools. It explicitly discusses Claude Code, Codex, Gemini-related tools, Cursor, JetBrains AI Assistant, Junie, GitHub Copilot, and other specialized coding agents.
- These sources support the claim that AI coding tools are no longer niche and that multi-tool usage is a plausible workflow for serious developers.

Sources:

- Stack Overflow 2025 AI survey: https://survey.stackoverflow.co/2025/ai
- JetBrains AI Pulse 2026: https://blog.jetbrains.com/research/2026/04/which-ai-coding-tools-do-developers-actually-use-at-work/
- JetBrains Developer Ecosystem 2025: https://blog.jetbrains.com/research/2025/10/state-of-developer-ecosystem-2025
- GitHub Octoverse: https://github.blog/news-insights/octoverse/

### Query 2: Official Provider Limits And Quotas

Queries:

- `Anthropic Claude Code usage limits Pro Max plan official documentation 5-hour weekly`
- `OpenAI Codex ChatGPT plan usage limits official docs five hour weekly`
- `Google Gemini CLI quota limits official documentation requests per day Code Assist`
- `Gemini CLI /stats usage quota documentation official`

Findings:

- Anthropic documents Claude Code usage under Claude plans, including subscription-backed usage limits and plan-specific constraints.
- OpenAI documents Codex usage with ChatGPT plans and distinguishes plan-based local/cloud usage windows.
- Google documents Gemini Code Assist quotas, including request limits, which validates that quota state differs materially by provider.
- Official documentation supports Pitwall's confidence-label requirement: not all providers expose the same type or quality of usage signal.

Sources:

- Anthropic Claude Code with Max plan: https://support.anthropic.com/en/articles/11145838-using-claude-code-with-your-max-plan
- Anthropic Pro plan usage: https://support.anthropic.com/en/articles/8324991-about-claude-s-pro-plan-usage/
- OpenAI Codex with ChatGPT plan: https://help.openai.com/en/articles/11369540-using-codex-with-your-chatgpt-plan/
- Gemini Code Assist quotas: https://developers.google.com/gemini-code-assist/resources/quotas

### Query 3: Individual Pain Around Usage Limits

Queries:

- `"Claude Code" "usage limit" "Max" "Pro" reddit developers`
- `"Claude Code" "weekly limit" "5-hour" developers`
- `"Codex" "usage limit" "Plus" "Pro" "developer"`
- `"Gemini CLI" "quota" "1000 requests" developers`

Findings:

- Reddit threads and developer blogs show repeated individual pain around Claude Code limits, Pro versus Max choices, UI/design work burning through limits, and context-heavy workflows consuming more usage than expected.
- Business Insider reported that Claude limits are reshaping some users' workdays, with entrepreneurs and developers planning around reset windows and caps.
- Usagebar's blog is a competitor source, but it clearly validates search demand around Claude Code weekly limits, five-hour lockouts, and shared Claude/Claude Code usage.

Sources:

- Reddit Claude Code usage limit thread: https://www.reddit.com/r/ClaudeCode/comments/1s1jpvg/usage_limit_whats_up_anthropic/
- Reddit Claude Max coding discussion: https://www.reddit.com/r/ClaudeAI/comments/1sb9yq2/trying_to_understand_claudes_usage_limits_is_max/
- Reddit developers managing usage limits: https://www.reddit.com/r/ClaudeAI/comments/1r0y1ad/developers_how_do_you_manage_your_usage_limits/
- Business Insider on Claude limits reshaping workdays: https://www.businessinsider.com/ai-usage-limits-causing-some-to-restructure-their-workday-2026-4
- Usagebar on weekly versus five-hour Claude limits: https://usagebar.com/blog/claude-code-weekly-limit-vs-5-hour-lockout
- Usagebar on Claude Code affecting Pro limits: https://usagebar.com/blog/does-claude-code-usage-affect-pro-limits

### Query 4: Existing Usage Monitor Competitors

Queries:

- `"AI usage monitor" "Claude" "Codex" "Gemini" desktop app competitor`
- `"Claude usage" macOS menu bar app Usagebar ClaudeCounter ccusage`
- `"ccusage" Claude Code usage monitor npm GitHub`
- `"Claude Code usage analytics" desktop app "menu bar"`

Findings:

- ccusage validates strong demand for Claude Code usage analytics but is Claude-focused.
- ClaudeCounter and Claudacity validate the market for Claude-specific usage monitoring.
- Usagebar validates a macOS menu bar approach for Claude usage, including five-hour and weekly limit visibility.
- The competitor gap is multi-provider AI coding strategy, not basic Claude usage visibility.

Sources:

- ccusage: https://ccusage.com/
- ClaudeCounter: https://www.claudecounter.com/
- Claudacity: https://www.claudacity.app/
- Usagebar: https://usagebar.com/

### Query 5: Enterprise AI Coding Budget Signal

Queries:

- `Uber CTO Claude Code budget blown away engineers usage Anthropic AI coding budget`
- `"The budget I thought I would need is blown away already" Uber CTO Claude Code`
- `"Uber CTO" "Claude Code" "budget" "Codex"`
- `"AI coding" "budget" "Uber" "Claude Code" "Praveen"`

Findings:

- The Information reported that Uber's surging Claude Code usage maxed out its full-year AI budget just a few months into 2026, citing CTO Praveen Neppalli Naga.
- The Information's public page includes the key quote: "I'm back to the drawing board because the budget I thought I would need is blown away already."
- PYMNTS, Benzinga, Yahoo Finance, Techmeme, and other secondary outlets repeated the core report.
- Reports also indicate Uber encouraged AI coding usage with internal leaderboards, used both Claude Code and Cursor, saw Claude Code surge while Cursor plateaued, and planned to test OpenAI Codex.
- This is the strongest current enterprise signal that AI coding adoption creates a cost governance problem.

Sources:

- The Information: https://www.theinformation.com/articles/uber-cto-shows-claude-code-can-blow-ai-budgets
- PYMNTS: https://www.pymnts.com/artificial-intelligence-2/2026/rising-ai-adoption-is-driving-up-enterprise-costs/
- Benzinga: https://www.benzinga.com/markets/tech/26/04/51828848/ubers-anthropic-ai-push-hits-wall-cto-says-budget-struggles-despite-spend
- Yahoo Finance syndication: https://finance.yahoo.com/sectors/technology/articles/ubers-anthropic-ai-push-hits-223109852.html
- Techmeme aggregation: https://www.techmeme.com/260414/p35

### Query 6: Enterprise Adoption And Engineering Intelligence

Queries:

- `enterprise AI coding assistant adoption survey 2026 engineering leaders budget governance`
- `Jellyfish AI software development 63% companies use AI most software development 2026`
- `AI coding tools enterprise budget overruns Cursor Anthropic Claude Code cost 2026`
- `AI coding assistant enterprise spend budget governance CTO 2026`

Findings:

- Jellyfish's benchmark study covers more than 700 companies, 200,000 engineers, and 20 million pull requests.
- Jellyfish reports that more than half of companies in its study use AI coding tools consistently and that 64% generate a majority of code with AI assistance.
- This supports the claim that AI coding adoption has become an engineering-leadership issue, not only an individual productivity habit.
- The evidence does not prove direct demand for Pitwall Enterprise, but it supports the existence of a large enterprise pain surface.

Sources:

- Jellyfish AI engineering trends: https://jellyfish.co/newsroom/jellyfish-reveals-ais-real-impact-on-engineering-teams/

### Query 7: AI Coding Tool Cost And Plan Complexity

Queries:

- `AI coding tools pricing comparison 2026 Claude Code Cursor Codex Copilot`
- `Claude Code vs Cursor vs Windsurf real cost 2026`
- `AI coding agents hidden token usage subscription cost 2026`

Findings:

- Developer-facing comparison blogs repeatedly discuss plan tiers, hidden token usage, subscription versus API economics, and choosing between Claude Code, Cursor, Copilot, Windsurf, Codex, and Gemini.
- These are mostly secondary sources and should not be treated as authoritative for exact pricing, but they validate user search demand and confusion.
- This supports SEO acquisition around plan selection and "which tool gives me the most work per dollar?"

Sources:

- TokenTab AI coding tool cost comparison: https://tokentab.dev/blog/ai-coding-tools-cost-2026
- Developers Digest pricing comparison: https://www.developersdigest.tech/blog/ai-coding-tools-pricing-2026
- SitePoint AI coding tools comparison: https://www.sitepoint.com/ai-coding-tools-comparison-2026/

### Query 8: Local Product And Codebase Context

Local files reviewed:

- `README.md`
- `electron-app/README.md`
- `specs/electron-cross-platform-ai-usage-monitor.md`
- `specs/multi-provider-cli-usage-monitor.md`
- `specs/provider-telemetry-endpoints.md`
- `.agents/project.json`

Findings:

- The repository currently presents ClaudeUsage as a macOS menu bar app that has expanded to Claude, Codex CLI, and Gemini CLI.
- Electron is the Windows/Linux path; Swift remains the premium macOS app.
- Existing specs already define a multi-provider provider model, confidence labels, tray rotation, Accuracy Mode, Provider Telemetry, diagnostics, and privacy boundaries.
- The brand "ClaudeUsage" no longer matches the product direction; "Pitwall, powered by calcLLM" better matches pacing, strategy, provider switching, and cost intelligence expansion.

## ICP Candidate Evidence

### Candidate 1: Solo AI Coding Power Users

Evidence strength: high.

Signals:

- Strong local product fit.
- Frequent individual pain in forums and support/search content.
- Official provider docs confirm limits and quota differences.
- Existing competitors validate willingness to use narrow usage-monitoring utilities.

Risks:

- Individual willingness to pay may be moderate.
- Some users may prefer free CLI tools.
- Provider endpoint instability can hurt trust.

### Candidate 2: Professional Multi-Agent Developers At Work

Evidence strength: medium-high.

Signals:

- AI coding tool adoption at work is high according to JetBrains and Stack Overflow.
- These users likely feel the same workflow pain.
- They can become internal champions.

Risks:

- Employer policy may block unofficial tools.
- Credential handling and local file reads may need security review.

### Candidate 3: Small AI-Forward Teams

Evidence strength: medium.

Signals:

- Team members may individually adopt multiple tools.
- calcLLM provides a natural cost-intelligence parent product.
- A lightweight team tier could bridge individual and enterprise needs.

Risks:

- Team features do not exist yet.
- Value depends on safe redacted usage sharing.

### Candidate 4: Engineering And Platform Leaders

Evidence strength: high for pain, low-medium for Pitwall fit today.

Signals:

- Uber budget blowout is a strong flagship signal.
- Jellyfish shows AI coding adoption at company scale.
- Enterprise leaders need governance, forecasting, and budget control.

Risks:

- Current desktop product does not satisfy enterprise buying requirements.
- GTM is harder: security, procurement, SSO, policy, deployment, and ROI proof.

### Candidate 5: Claude-Only Limit Watchers

Evidence strength: high.

Signals:

- Multiple direct competitors exist.
- Searches and forums show repeated Claude-specific pain.

Risks:

- Too narrow for Pitwall's rebrand and calcLLM product-line strategy.
- Competes head-to-head with existing Claude-only tools.

## Scoring Rationale

Scale: 1-10 for value and accessibility.

| ICP | Value | Accessibility | Notes |
| --- | ---: | ---: | --- |
| Solo AI coding power users | 7 | 9 | Strong current product fit and easy PLG, moderate ARPU |
| Professional multi-agent developers at work | 7 | 6 | Strong pain, but employer policy can block adoption |
| Small AI-forward teams | 8 | 5 | Better ARPU, requires team features |
| Claude-only limit watchers | 5 | 8 | Easy acquisition, limited strategic scope |
| Engineering/platform leaders | 10 | 3 | Highest budget and urgency, hardest product and GTM |

Conclusion:

Use solo AI coding power users as the beachhead ICP, and maintain engineering/platform leaders as the strategic enterprise expansion path.
