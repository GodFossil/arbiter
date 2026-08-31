# Arbiter Project Roadmap

> **Status:** Canonical planning reference  
> **Last updated:** 2026-08-31  
> **Repository:** `GodFossil/arbiter`  
> **Default branch:** `master`

## 1. Purpose

Arbiter is a modern, AI-powered utility bot for The Debate Server. Its purpose is to provide structured, useful support for debate and discussion in Discord without replacing human judgment, moderator authority, or participant agency.

This is a clean-slate implementation. The legacy Arbiter repository and deployment are historical reference material: they may inform product intent and useful concepts, but their code, dependencies, architecture, credentials, and deployment configuration are not implementation requirements for this project.

## 2. Development principles

- Build incrementally: prove one useful capability at a time rather than designing an entire agent platform before real requirements exist.
- Prefer current, authoritative Discord and provider documentation over assumptions or legacy implementation details.
- Keep interfaces modular: Discord delivery, application logic, LLM access, storage, and external tools must be separable components.
- Centralize security-sensitive configuration. Secrets never belong in source code, examples, logs, issues, or pull-request text.
- Favor read-only and reversible capabilities before moderation, administrative, or other side-effecting actions.
- Make outputs concise, referential, and usable inside active Discord debate. Favor direct questions, quotations, explicit uncertainty, and clearly separated claims over unnecessary narration.
- Record significant technical choices and their reasons so decisions can be revisited deliberately rather than rediscovered.

## 3. Established decisions

| Area | Decision | Status |
| --- | --- | --- |
| Repository | The clean implementation lives in `GodFossil/arbiter`. | Established |
| Visibility | The repository begins private. Consider public release only after security, privacy, licensing, and contributor-readiness review. | Established |
| Integration branch | `master` is the canonical default and integration branch. | Established |
| Documentation | Canonical documentation is version-controlled under `docs/`, not a separate GitHub Wiki. | Established |
| Primary workflow | Issues track actionable work; pull requests integrate meaningful changes; Projects may visualize the work queue. | Established |
| Merge style | Squash merge is the only enabled merge strategy; merge commits and rebase merges are disabled. | Established |
| Initial runtime assumption | Start from the Node ecosystem using the Node `.gitignore` template; TypeScript/Discord library selection remains to be made deliberately. | Provisional |
| AI boundary | Arbiter code calls models only through a provider-neutral LLM client abstraction. | Established |
| Initial gateway | FreeLLMAPI is the provisional first gateway for local/self-hosted evaluation. | Provisional |
| Expansion gateway | OmniRoute is an evaluation candidate, not an adopted dependency. | Provisional |
| Developer proxy | Free Claude Code is a developer-workflow adjunct, not Arbiter's primary runtime gateway. | Established |
| External tools | MCP servers and public APIs are deferred until core LLM routes are stable, observable, and access-controlled. | Established |

## 4. Target architecture

```text
Discord interaction
        |
        v
Command / interaction handlers
        |
        v
Application services (debate utilities)
        |------------------------|
        v                        v
LLM client abstraction      Storage / scoped memory
        |
        v
AI gateway (initially evaluated via FreeLLMAPI)
        |
        v
Approved upstream model providers

Later, separately controlled:
Application services -> Tool boundary -> allowlisted MCP servers / public APIs
```

### 4.1 Discord interaction layer

This layer receives slash commands, component interactions, and approved message-context events; verifies Discord interaction requirements; applies permission/channel checks; and formats responses for Discord. It should contain as little debate logic as possible.

### 4.2 Application services

Application services define each Arbiter capability: for example, summarizing a selected discussion, extracting claims, identifying unresolved premises, or drafting Socratic follow-up questions. They own command-specific validation, context selection, prompt construction, structured-output validation, and response shaping.

### 4.3 LLM client abstraction

All model requests must pass through one internal client interface. The rest of Arbiter must not depend directly on a specific provider SDK, model name, gateway URL, or authentication scheme. Configuration selects the model, request limits, timeout, retry behavior, and route policy.

### 4.4 Gateway and provider boundary

The initial gateway investigation favors a self-hosted FreeLLMAPI evaluation because it provides a unified OpenAI-compatible interface while using operator-owned provider credentials and offering quota-aware routing/failover. The implementation must allow FreeLLMAPI to be replaced later without redesigning Discord commands.

OmniRoute remains a later comparison candidate if Arbiter benefits from a broader model catalog, richer routing, or its MCP-related features. Managed gateways or direct providers remain valid future options for reliable paid inference.

### 4.5 Storage and memory

Persistent state is deferred until a demonstrated feature needs it. When introduced, store only the minimum required data and separate:

- server configuration and authorization policy;
- short-lived command/debate context;
- explicit, scoped long-term memory;
- operational logs and evaluation records.

Never silently create server-wide psychological or ideological user profiles. Any retention, recall, deletion, and administrator controls must be explicit before memory becomes a production capability.

### 4.6 Tool boundary

External web, research, data, or MCP tools must be distinct from the LLM gateway. Tools need an allowlist, per-command authorization, input validation, timeouts, audit visibility, and clear user-facing sourcing where appropriate. Begin with read-only retrieval; defer side-effecting tools.

## 5. Security and operational baseline

### 5.1 Secret handling

- Real values belong only in local ignored `.env` files or an approved deployment secret store.
- Commit `.env.example` with variable names only and blank values.
- Never commit, paste, log, or expose Discord bot tokens, LLM/gateway API keys, database URLs, webhook secrets, private provider credentials, or production exports.
- Rotate a credential immediately when exposure is suspected.
- Use a new Discord application/token for the new Arbiter; do not inherit legacy deployment credentials.

Initial `.env.example` contract:

```dotenv
DISCORD_TOKEN=
DISCORD_APPLICATION_ID=
DISCORD_GUILD_ID=

LLM_BASE_URL=
LLM_API_KEY=
LLM_DEFAULT_MODEL=

DATABASE_URL=
LOG_LEVEL=info
```

### 5.2 Repository controls

- Keep `master` protected through an active ruleset.
- Require pull requests, resolved review conversations, linear history, and block force pushes and deletions.
- Begin with zero required approvals while there is one maintainer; introduce status checks after CI exists.
- Enable Issues and Projects; keep Wiki and Discussions off initially.
- Allow only GitHub-owned and verified-creator Actions; set default workflow permissions to read-only contents.
- Enable dependency graph and automatic dependency submission.
- Enable Dependabot alerts/security updates, secret scanning, push protection, and private vulnerability reporting wherever the account/plan makes them available.
- Leave webhooks, deploy keys, environments, Pages, Codespaces, and repository-level autonomous Copilot workflows unconfigured until an actual use case is approved.

### 5.3 Logging and privacy

Log operational metadata needed for diagnosis—route name, provider/model identifier, latency, token/cost estimates where available, error category, and fallback occurrence—without indiscriminately retaining raw Discord content. Do not log secrets. Define retention before production data collection begins.

## 6. Phased implementation plan

### Phase 0 — Scope and operating boundary

**Goal:** Define the smallest useful first release and what Arbiter is explicitly not allowed to do.

Deliverables:

- Initial command list and user stories.
- Permission/channel policy for each command.
- Definition of public, private, and sensitive input categories.
- Initial response-style guidelines for debate contexts.
- Initial success criteria and non-goals.

Exit criteria:

- We can name one or two initial commands, the expected user benefit, the input source, the output form, and what must never be sent to external services.

### Phase 1 — Gateway proof of concept

**Goal:** Validate one controlled model route outside the Discord bot.

Deliverables:

- Local/self-hosted FreeLLMAPI evaluation environment.
- A minimal, operator-owned provider-key set and a tested fallback policy.
- A small test client calling the unified API endpoint.
- Documented model/route settings, timeout behavior, and failure behavior.

Exit criteria:

- A repeatable test request succeeds through the gateway.
- At least one fallback/error case is understood.
- No credential is committed to the repository.
- The gateway can be replaced through configuration rather than command rewrites.

### Phase 2 — Discord bot foundation

**Goal:** Create a deployable but intentionally minimal Discord application skeleton.

Deliverables:

- Node/TypeScript runtime decision and package/tooling setup.
- Discord application bootstrap and interaction registration.
- Configuration loading and startup validation.
- Command handler structure and basic error handling.
- Provider-neutral LLM client interface.
- Linting, formatting, unit-test foundation, and GitHub Actions quality workflow.

Exit criteria:

- The bot starts with valid configuration, responds to a harmless diagnostic command in the intended test server/channel, and fails safely with missing/invalid configuration.
- CI runs successfully on pull requests.

### Phase 3 — First debate utilities

**Goal:** Deliver one or two valuable, low-risk debate-support commands.

Candidate initial capabilities—select only after Phase 0:

- Summarize a user-selected message range or pasted text, preserving positions and uncertainty.
- Extract claims, supporting reasons, and unresolved premises from a supplied passage.
- Draft concise Socratic follow-up questions that distinguish factual claims, definitions, values, and inferences.

Requirements:

- Explicit user invocation; no unsolicited analysis of server conversations.
- Clear scope indicator: what messages/text were analyzed.
- Output that is concise and usable in Discord.
- Model failures and quota exhaustion handled without duplicate Discord replies.

Exit criteria:

- At least one core command works end-to-end through the gateway with tests for validation and context limits.
- A small set of representative examples has been manually reviewed for usefulness, tone, and factual restraint.

### Phase 4 — Reliability, evaluation, and minimal persistence

**Goal:** Turn the working prototype into an understandable, diagnosable service.

Deliverables:

- Request correlation IDs, structured error logging, timeout/retry policy, and rate limits.
- Model/fallback performance observations for core commands.
- A small evaluation set of debate-style examples with expected qualities, not just expected wording.
- Minimal persistence only where a feature demonstrates need (for example, server configuration or explicitly saved outputs).
- Data retention and deletion behavior documented before storing user-derived content.

Exit criteria:

- We can diagnose failed requests without exposing secrets or unnecessary raw conversation data.
- We know which model routes are acceptable for the implemented commands.

### Phase 5 — Controlled external information and tools

**Goal:** Add one read-only external-information capability only if it meaningfully improves a defined command.

Approach:

- Evaluate one tool/data route at a time: web retrieval, authoritative documentation lookup, URL reputation, or a focused public API.
- Use allowlists, request timeouts, response-size limits, and source attribution.
- Treat Firecrawl, Bright Data, Hugging Face MCP, public API directories, Tavily, and ScrapeGraphAI as candidates/resources—not default dependencies.
- Do not grant write-capable MCP or operational tools to Arbiter without a separate decision record, authorization design, audit trail, and explicit user confirmation model.

Exit criteria:

- The selected tool demonstrably improves one command.
- Tool failure degrades safely.
- The feature has documented authorization, sourcing, privacy, and cost/quota behavior.

### Phase 6 — Deployment and controlled rollout

**Goal:** Run Arbiter reliably in the intended Discord environment.

Deliverables:

- Deliberate hosting decision; do not reuse the legacy Render deployment as the new architecture by default.
- `development` and `production` environment separation when deployment automation begins.
- Environment-scoped secrets and deployment controls.
- Health checks, restart behavior, basic monitoring, backups for any persistent store, and an incident/rollback procedure.
- A limited server rollout with feedback and error review before wider enablement.

Exit criteria:

- The production runtime uses fresh credentials, least privilege, protected configuration, and an observable rollback path.
- Core commands meet agreed reliability and response-quality expectations.

## 7. Initial backlog

The first work items should remain small and ordered:

1. Add this roadmap and a companion `docs/DECISIONS.md` decision log.
2. Define Phase 0 user stories, non-goals, and acceptance criteria.
3. Decide Node JavaScript versus TypeScript and select the Discord library.
4. Decide local development environment and hosting assumptions for the gateway proof of concept.
5. Add `.env.example`, secret-handling guidance, and an initial `SECURITY.md`.
6. Stand up the gateway proof of concept without committing credentials.
7. Create the minimal Discord application skeleton and diagnostic command.
8. Add linting, formatting, unit tests, and a read-only GitHub Actions CI workflow.
9. Implement and evaluate the first explicitly chosen debate utility.

## 8. Decisions still open

These are intentional open questions. Do not silently treat them as settled.

| Question | Current position | Decision trigger |
| --- | --- | --- |
| JavaScript or TypeScript? | Node is the initial assumption; TypeScript is likely but not adopted. | Before bot foundation implementation |
| Which Discord library/framework? | Unresolved; choose based on current documentation, interaction support, maintenance, and developer ergonomics. | Before bot foundation implementation |
| Local gateway hosting or remote VPS? | Begin with a controlled local proof of concept unless a deployment requirement emerges. | Phase 1 |
| Which providers/models form the initial fallback chain? | Unresolved; evaluate quality, latency, quotas, tool/structured-output support, privacy terms, and reliability. | Phase 1 |
| Which exact first command(s)? | Candidates identified; select by real server usefulness and manageable scope. | Phase 0 |
| What storage system is needed? | None until demonstrated; do not add a database only for anticipated future memory. | Phase 4 or earlier only if required |
| What conversation data, if any, may be retained? | Default to minimum retention; policy and controls required first. | Before persistence |
| When should external web/MCP tools be added? | Only after a core command demonstrates a clear need. | Phase 5 |
| Hosting and CI/CD provider? | Unresolved; evaluate after a working local bot exists. | Phase 6 |
| When should the repository become public? | After a deliberate open-source readiness review. | Post-v1 stability/security review |

## 9. Resource inventory

### Primary sources and references

- Discord Developer Documentation: primary source for interactions, permissions, gateway behavior, rate limits, and application policy.
- `GodFossil/arbiter-legacy`: historical reference only; examine concepts selectively and do not inherit its architecture automatically.
- GitHub documentation: repository controls, Actions, rulesets, environments, security scanning, and dependency management.

### AI gateway candidates

- FreeLLMAPI: provisional first self-hosted gateway evaluation.
- OmniRoute: broad-catalog/routing/MCP evaluation candidate.
- Free Claude Code: developer-environment proxy and coding-agent tool.
- OpenCode Zen/Go, OpenRouter, Vercel AI Gateway: possible upstream/managed alternatives when their tradeoffs fit a defined route.

### Memory and agent references

- `akitaonrails/ai-memory`
- Upstash Context7
- LangChain and its current documentation
- `gfernandf/agent-skills`
- `volcengine/OpenViking`

These are references for patterns and tradeoffs, not automatically selected dependencies.

### External retrieval/tool candidates

- Firecrawl MCP Server
- Bright Data MCP Server
- Hugging Face MCP Server
- Tavily
- ScrapeGraphAI
- Octopus Deploy MCP Server, as a reference for tool-server design and operational boundaries

### API and developer-resource catalogs

- `public-apis/public-apis`
- `public-api-lists/public-api-lists`
- `JuanPabloDiaz/freeForGeeks`
- `tldr-pages/tldr`

Use these catalogs only when a defined Arbiter capability needs a specific service. Avoid adding generic APIs because they are available.

### Developer workflow references

- Zed, Pulsar, Wave Terminal
- `commit-sage-cli`
- `i-have-adhd`
- Semaphore

These may improve contributor workflow but are not Arbiter runtime dependencies.

## 10. Change-control guidance

Update this roadmap when a significant decision becomes established, a phase’s exit criteria changes, or a newly discovered constraint affects the plan. For detailed decision history, create or update `docs/DECISIONS.md` rather than rewriting prior decisions without explanation.

A proposed technology, resource, or feature is not a project commitment until it has a defined use case, a recorded decision, and an implementation path that fits the current phase.
