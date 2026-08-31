# Arbiter Project Roadmap

> **Status:** Canonical v1 roadmap  
> **Last updated:** 2026-08-31  
> **Repository:** `GodFossil/arbiter`  
> **Default branch:** `master`

## 1. Version-one mission

Arbiter is a modern, AI-powered utility bot for The Debate Server. Version one is an always-online, publicly usable, rate-limited Discord debate summarizer: it creates neutral, structured records of selected discussions, can use approved server context, and preserves clear boundaries around sensitive staff data.

Arbiter supports discussion; it does not replace human judgment, moderator authority, or participant agency. It must not declare debate winners, advocate for a participant by default, make autonomous moderation decisions, or present uncertain claims as established fact.

The legacy Arbiter repository and prior Render deployment are historical reference material only. They may inform useful product concepts, but their code, dependencies, architecture, credentials, and deployment choices are not requirements for this clean-slate implementation.

## 2. Governing principles

- **Public utility first.** Initial public commands must solve a defined debate-support problem and remain understandable, predictable, and abuse-resistant.
- **Strict neutrality.** Arbiter maps positions, reasons, evidence, ambiguity, agreement, and unresolved issues. It does not become an advocate or judge by default.
- **Explicit permission boundaries.** Public debate information, sensitive staff records, provider secrets, and operational controls are distinct classes of data.
- **Minimal necessary data.** Retain only what a defined feature needs; do not build participant psychological or ideological profiles.
- **One capability at a time.** Prove the summarizer before adding agents, broad web research, MCP tools, moderation automation, or feature parity with the legacy bot.
- **Provider independence.** The application calls a provider-neutral LLM client; gateway/model/provider details remain configuration, not command logic.
- **Operational discipline.** Use least privilege, private internal services, rate limits, structured logging, tested failure modes, and deliberate rollout.
- **Decision transparency.** Significant choices are recorded in `docs/DECISIONS.md`; proposed technologies are not commitments until approved for a defined use case.

## 3. Established v1 decisions

| Area | Decision | Status |
| --- | --- | --- |
| Repository | The clean implementation lives in `GodFossil/arbiter`. The legacy repository is historical reference only. | Established |
| Visibility | The repository begins private. Public release requires a separate security, privacy, licensing, and contributor-readiness review. | Established |
| Integration branch | `master` is the canonical default and integration branch. | Established |
| Documentation | Canonical documentation lives in version-controlled `docs/`, not a separate wiki. | Established |
| Workflow | Issues track work; pull requests integrate meaningful changes; a Project may visualize work state. | Established |
| Merge policy | Squash merge is the sole enabled integration strategy. | Established |
| Runtime ecosystem | Begin in the Node ecosystem; JavaScript versus TypeScript remains a deliberate pre-foundation choice. | Provisional |
| Public availability | Any server member may use the initial public command, subject to channel policy and anti-abuse limits. | Established |
| V1 product | Debate assistance first, beginning with neutral thread summarization. | Established |
| First command | `/arbiter summarize` is the first AI workflow. | Established |
| Debate voice | Neutral, analytical, concise, referential, and non-advocacy. | Established |
| Context scope | Server-wide institutional/debate context is permitted for defined categories only. | Established |
| Sensitive data | A dedicated `Arbiter Staff` role controls sensitive functions and staff notes. | Established |
| Staff-note policy | Staff notes are never included automatically in ordinary v1 AI prompts. | Established |
| AI client | All model calls pass through an internal provider-neutral LLM client abstraction. | Established |
| Initial gateway | FreeLLMAPI is the initial internal gateway evaluation/launch candidate. | Established |
| Model experience | One carefully selected general-purpose default model; no public model selector. | Established |
| Provider routing | One personally controlled primary provider/key, one personally controlled fallback, and an optional disabled managed emergency route. | Established |
| Gateway exposure | Arbiter alone reaches the gateway over an internal Docker network. The gateway API/dashboard is never public-facing. | Established |
| Initial hosting | Oracle Cloud Always Free VM, subject to tenancy capacity/limits, using Docker Compose. | Established |
| External tools | Broad web research, MCP tools, and public API integrations are deferred until the summarizer is stable. | Established |

## 4. Data, privacy, and permission model

Arbiter stores four different information classes. Access control and prompt selection must respect these boundaries.

| Data class | Purpose | Who may create or edit | Who may read | Used automatically by ordinary v1 summaries? |
| --- | --- | --- | --- | ---: |
| Server configuration | Approved channels, command settings, quotas, feature toggles, and server policy | Arbiter Staff | Arbiter Staff | Yes, where relevant |
| Published rules and approved references | Server rules, curated reference documents, and approved guidance | Arbiter Staff | Public if the source is public; otherwise Arbiter Staff | Yes, where relevant |
| Debate summaries and precedents | Durable summaries, metadata, and established debate precedents | Arbiter; Arbiter Staff may correct/manage | Public or staff, according to channel/source policy | Yes, where relevant |
| Participant staff notes | Sensitive internal staff recordkeeping | Arbiter Staff | Arbiter Staff | **No** |

### 4.1 Arbiter Staff role

Create a dedicated Discord role named `Arbiter Staff`. It is the v1 permission boundary for:

- server configuration and command enablement;
- quota adjustment and temporary public-command disablement;
- approved rules/references and precedent management;
- protected participant-note CRUD;
- sensitive audit access.

Do not assume that every moderator or administrator needs access to staff notes. Normal public command use does not require this role.

### 4.2 Staff notes and audit trail

Staff notes are a protected record system, not a hidden source of AI judgment. In v1 they must not be automatically retrieved for, appended to, or summarized by normal public prompts.

Every sensitive note action creates an append-only audit event containing:

```text
timestamp
acting staff member Discord user ID
action: created / edited / deleted
target Discord user ID
reason or note category
```

The audit event should not duplicate the sensitive note text unless a separately approved policy requires it. Retention, correction, and deletion procedures must be documented before real staff data is collected.

### 4.3 Secrets

Provider secrets are not application data. Discord tokens, gateway credentials, upstream provider keys, database URLs, encryption keys, SSH keys, webhook signing secrets, and production exports must never be committed, logged, pasted into issues/PRs, or put in `.env.example`.

Initial configuration contract:

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

## 5. Target architecture

```text
Discord users
    |
    | Slash command or context-menu command
    v
Arbiter Discord bot
    |
    +--> Public-command protections
    |     - permission/channel policy
    |     - per-user and per-channel cooldowns
    |     - per-server AI budget
    |     - input/message-history limits
    |     - one active job per thread
    |
    +--> Application services
    |     - selected-thread collection and validation
    |     - neutral summarization workflow
    |     - public rule/precedent retrieval
    |     - authorization and audit events
    |
    +--> Arbiter database
    |     - server configuration
    |     - approved rules/references
    |     - summaries and precedents
    |     - protected staff notes
    |     - audit metadata
    |
    +--> Provider-neutral LLM client
              |
              v
          Internal AI gateway
              |
              +--> primary provider / one default model
              +--> normal fallback provider
              +--> optional disabled emergency route
```

### 5.1 Discord layer

The Discord layer handles command registration, interaction acknowledgement, permission and channel checks, Discord API constraints, and output formatting. It contains no provider-specific model logic and as little debate reasoning as possible.

### 5.2 Application services

Application services own command-specific behavior: collection/validation of the selected discussion, context selection, fixed prompt construction, structured output validation, budget enforcement, persistence, and Discord-ready response shaping.

### 5.3 Database

A small relational database is an early v1 requirement because durable server configuration, approved context, summaries, precedents, staff-note access control, and audit metadata are established needs. Do not add a vector database or broad semantic-memory stack unless relational retrieval demonstrably becomes inadequate.

### 5.4 Model boundary

The rest of Arbiter must call one internal LLM client interface. Model names, base URLs, keys, timeouts, request limits, retries, and fallback policy are configuration. This preserves the ability to change gateway or provider without rewriting command behavior.

### 5.5 Separate future tool boundary

Web retrieval, public data, and MCP tools are not part of the v1 summarizer path. If adopted later, every tool must have an allowlist, defined command scope, authorization check, validated inputs, timeouts, size limits, audit visibility, and source attribution where relevant. Begin only with read-only tools.

## 6. Hosting and deployment baseline

The initial deployment target is an Oracle Cloud Always Free VM in the tenancy home region, using Docker Compose. Always Free allocation and capacity are subject to Oracle tenancy limits and regional availability; confirm the actual available compute shape in the OCI console rather than hard-coding a capacity assumption.

```text
Oracle Cloud Always Free VM
    |
    +--> Docker Compose
           |
           +--> arbiter-bot
           |     - Discord connection
           |     - commands
           |     - summarization workflow
           |
           +--> arbiter-database
           |     - persistent state
           |     - approved context
           |     - summaries / precedents
           |     - protected staff notes
           |
           +--> ai-gateway
                 - internal-only API
                 - provider routing / fallback
                 - no public dashboard/API exposure
```

### 6.1 Network policy

- The bot reaches Discord outbound.
- The bot reaches the gateway only over the Docker internal network.
- The database accepts connections only from authorized internal containers.
- Do not publicly expose the gateway API or dashboard for convenience.
- Admin access to the VM and any gateway dashboard must be deliberate, authenticated, and restricted.

### 6.2 Secrets in deployment

Use Docker Compose secrets where supported so a service receives only secrets explicitly granted to it. Where a dependency only supports environment variables, use a locked-down server-side mechanism and ensure it is not tracked by Git. Never bake a secret into a Dockerfile or image.

### 6.3 Deployment readiness

Before production rollout, verify container restart behavior, bot reconnect behavior after VM restart, basic health checks, logging, persistent-volume behavior, backup/restore for the database, and a documented rollback procedure.

## 7. AI gateway and model policy

FreeLLMAPI is Arbiter's initial internal gateway because it offers a self-hosted, OpenAI-compatible integration surface, operator-controlled provider credentials, routing/fallback capabilities, and separation between command logic and upstream providers.

Initial configuration must stay intentionally small:

| Gateway element | V1 policy |
| --- | --- |
| Default model | One general-purpose, instruction-following model selected through a focused quality test |
| Primary provider | One personally controlled provider account/key |
| Normal fallback | One additional personally controlled provider account/key |
| Managed fallback | Optional; configured only if needed and disabled by default |
| Public model selection | None |
| Bot-to-gateway route | Internal Docker network only |
| Gateway application key | Separate Arbiter-specific key; never shared with Discord users |
| Upstream provider keys | Gateway-only secrets; absent from Discord command logic |

Do not add every supported provider at launch. A small routing configuration makes quality, latency, quota exhaustion, formatting errors, and provider failure diagnosable. Test normal operation, timeouts, quota exhaustion, malformed response handling, and fallback before public rollout.

OmniRoute remains a future evaluation/replacement candidate if FreeLLMAPI's quality, capacity, fallback controls, or provider mix proves inadequate. Do not run both gateways in production at v1 launch without a demonstrated need.

## 8. Public summarizer specification

### 8.1 Command

```text
/arbiter summarize
```

The command runs only through explicit user invocation in an approved channel or discussion thread. It collects a bounded window of relevant messages, removes irrelevant bot/system content, identifies participants only as necessary for a fair summary, retrieves only approved public/server context, and sends that bounded material to the fixed neutral summarization workflow.

### 8.2 Output contract

```text
Discussion question
- The central claim or issue under dispute.

Position A
- Main claims
- Reasons offered
- Evidence or examples cited

Position B
- Main claims
- Reasons offered
- Evidence or examples cited

Definitions and points of ambiguity
- Terms used differently or not defined.

Areas of agreement
- Claims both sides accepted or did not dispute.

Unresolved issues
- Questions, evidence gaps, or logical disagreements still requiring resolution.
```

The summary is a record, not a verdict. It may say a claim was unsupported, unclear, internally inconsistent, or unanswered only when that description is grounded in the selected discussion. It must not claim that a participant won.

### 8.3 Public-command protections

| Protection | Initial behavior |
| --- | --- |
| Channel/thread policy | Run only in approved discussion channels or threads |
| Per-user cooldown | Limit repeat requests by one member |
| Per-channel cooldown | Prevent overlapping or repetitive summaries in the same discussion |
| Per-server AI budget | Cap daily summarization work to protect free-tier capacity |
| Input cap | Limit collected message count and total characters/tokens |
| Minimum threshold | Decline tiny discussions lacking enough material for a useful summary |
| Active-job lock | Allow one active summary job per thread/context |
| Failure handling | State clearly when busy, temporarily unavailable, or out of quota |
| Staff controls | Arbiter Staff can adjust limits or temporarily disable the command |

Initial launch occurs in an approved test channel, despite the eventual public availability. Expand access only after review of quality, cost, failure behavior, and misuse patterns.

## 9. Implementation sequence

### Phase 0 — Product contract

**Goal:** Lock the operational boundaries of the first useful release.

Deliverables:

- `/arbiter summarize` user story, exact input scope, and output contract.
- Channel/thread policy and public-command protections.
- Privacy/data-class policy and staff-note exclusion rule.
- Arbiter Staff role definition and authority.
- Clear non-goals for v1.

**Exit criterion:** We can state what the bot does, what context it can use, what it never uses, who controls sensitive operations, and how a normal member experiences a refusal/failure.

### Phase 1 — Bot foundation

**Goal:** Create a minimal, safe Discord application foundation.

Deliverables:

- Final JavaScript-versus-TypeScript decision and current Discord-library selection.
- Discord application and bot bootstrap.
- Configuration loading and startup validation.
- Command handler structure, role checks, and diagnostic command.
- LLM client interface with no live provider dependency yet.
- Formatting, linting, unit-test foundation, and a read-only GitHub Actions quality workflow.

**Exit criterion:** The bot starts with valid configuration, fails safely with invalid configuration, and responds to a harmless diagnostic command in the private test environment.

### Phase 2 — Deployment baseline

**Goal:** Make the minimal bot continuously runnable on the intended infrastructure.

Deliverables:

- Oracle Always Free VM provisioned and hardened for the project.
- Docker and Docker Compose installation.
- `arbiter-bot` container deployed without gateway/database dependencies initially.
- Private network policy, restart behavior, health check, and basic structured logs.

**Exit criterion:** The bot reconnects cleanly after a container or VM restart and no internal-only service is publicly exposed.

### Phase 3 — Persistent data and authorization

**Goal:** Implement the established data classes and staff boundary before handling sensitive records.

Deliverables:

- Database container and persistent volume.
- Server configuration and approved-reference storage.
- Summary/precedent storage and access policy.
- Arbiter Staff authorization checks.
- Protected staff-note CRUD and append-only audit metadata.
- Tests proving staff notes cannot enter ordinary public summarization prompts.

**Exit criterion:** Ordinary members cannot access sensitive records; staff notes are excluded from normal model context by design and test.

### Phase 4 — AI gateway pilot

**Goal:** Validate a controlled internal model route.

Deliverables:

- FreeLLMAPI running privately alongside Arbiter.
- One primary and one fallback personally controlled provider key.
- One default model chosen from a focused evaluation set of representative, non-sensitive debate material.
- Tests for normal response, timeout, rate/quota exhaustion, provider failure, and fallback.
- Per-summary provider/model metadata for troubleshooting.

**Exit criterion:** The bot can make a repeatable internal request through the gateway, failure is diagnosable, and credentials are absent from Git/history/logs.

### Phase 5 — Neutral summarizer

**Goal:** Deliver the first user-facing debate utility in an approved test channel.

Deliverables:

- `/arbiter summarize` command.
- Bounded message collection, cleanup, validation, and active-job lock.
- Fixed neutral prompt and structured output validation.
- Context retrieval limited to approved public/server sources.
- Rate-limit enforcement and Discord-safe error responses.
- Manual evaluation against representative non-sensitive discussions.

**Exit criterion:** Summaries are concise, accurate to the supplied material, non-advocacy, understandable in Discord, and safe under normal failure conditions.

### Phase 6 — Public rollout and governance

**Goal:** Enable the summarizer for all members within guarded limits.

Deliverables:

- Public command enablement in approved server discussion spaces.
- Per-user/channel/server budgets and staff controls.
- Operational monitoring of error, quota, latency, and fallback patterns.
- Concise server-facing disclosure of what Arbiter analyzes/stores and who can access staff-only records.
- Feedback and incident handling process.

**Exit criterion:** The tool meets its reliability and quality expectations under real use and can be paused/rolled back safely.

### Phase 7 — Deliberate expansion

After the summarizer is stable, add one capability at a time, in this tentative order:

1. Debate precedent and rule lookup.
2. Argument mapping and clarification.
3. Socratic question generator.
4. Steelman-both-sides tool.
5. Staff-only debate-case and moderation-support utilities.
6. Read-only external research tools or MCP integrations.

Each addition requires a defined use case, privacy review, authorization policy, operational limits, and acceptance criteria.

## 10. Explicitly deferred

These are not v1 requirements:

- Public multi-model selection.
- Multiple gateways running concurrently in production.
- Autonomous agent behavior.
- Publicly prompted MCP-tool execution.
- Unrestricted web scraping or live-web research.
- Automatic use of staff notes in model prompts.
- AI-based punishments or autonomous moderation/staff actions.
- A vector/semantic database before relational retrieval proves inadequate.
- Feature parity with legacy Arbiter.
- A public open-source release before readiness review.

## 11. Repository and security controls

- Keep `master` protected with an active ruleset requiring pull requests, resolved conversations, linear history, and blocking deletions/force pushes.
- Use zero required approvals while there is one maintainer; require CI checks after the test workflow exists.
- Enable Issues and Projects; keep Wikis and Discussions off initially.
- Permit only GitHub-owned and verified-creator Actions; default workflow token permission is read-only contents.
- Enable dependency graph and automatic dependency submission.
- Enable Dependabot alerts/security updates, secret scanning, push protection, and private vulnerability reporting where available.
- Keep webhooks, deploy keys, GitHub Pages, Codespaces, environments, and autonomous repository-level Copilot workflows unconfigured until they have approved use cases.
- When deployment automation begins, create `development` and `production` environments, scope secrets to them, and restrict production deployments to `master` with manual approval.

## 12. Decision and reference practice

Update this roadmap when an established commitment, phase gate, or operational constraint changes. Use `docs/DECISIONS.md` for individual architecture decision records: context, considered options, decision, rationale, status, date, consequences, and conditions for revisit.

### Primary references

- [Discord Developer Documentation](https://docs.discord.com/developers/intro) — Discord interactions, permissions, API constraints, and policy.
- [Discord rate limits](https://docs.discord.com/developers/topics/rate-limits) and [Gateway documentation](https://docs.discord.com/developers/events/gateway) — transport limits; Arbiter's AI-workload limits must be more conservative and cost-aware.
- [Oracle Cloud Always Free resources](https://docs.oracle.com/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm) and [service limits](https://docs.oracle.com/iaas/Content/General/service-limits/default.htm) — initial infrastructure assumptions and limits.
- [Docker Compose secrets](https://docs.docker.com/compose/how-tos/use-secrets/) and [Compose production guidance](https://docs.docker.com/compose/how-tos/production/) — deployment secret and production practices.
- [FreeLLMAPI](https://github.com/tashfeenahmed/freellmapi) — initial internal gateway candidate.
- [OmniRoute](https://github.com/diegosouzapw/OmniRoute) — future gateway evaluation candidate.
- `GodFossil/arbiter-legacy` — historical product reference only.

### Candidate catalogs and future references

- Public API catalogs: `public-apis/public-apis`, `public-api-lists/public-api-lists`, and `JuanPabloDiaz/freeForGeeks`.
- Memory/agent references: `akitaonrails/ai-memory`, Upstash Context7, LangChain, `gfernandf/agent-skills`, and `volcengine/OpenViking`.
- Future read-only tool candidates: Firecrawl MCP Server, Bright Data MCP Server, Hugging Face MCP Server, Tavily, and ScrapeGraphAI.

These are inputs for later, specific decisions—not default runtime dependencies.
