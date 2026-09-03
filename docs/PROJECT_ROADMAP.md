# Arbiter Project Roadmap

> **Status:** Canonical v1 roadmap  
> **Last updated:** 2026-09-02  
> **Repository:** `GodFossil/arbiter`  
> **Default branch:** `master`

## 1. Version-one mission

Arbiter is an always-online, publicly usable, rate-limited Discord chatbot for The Debate Server. It provides neutral conversational assistance and structured debate utilities, beginning with interactive discussion support and `/arbiter summarize`.

Arbiter supports discussion; it does not replace human judgment, moderator authority, or participant agency. It must not declare debate winners, advocate for a participant by default, make autonomous moderation decisions, or present uncertain claims as established fact.

The legacy Arbiter repository and prior Render deployment are historical reference material only. They may inform useful product concepts, but their code, dependencies, architecture, credentials, and deployment choices are not requirements for this clean-slate implementation.

## 2. Governing principles

- **Public utility first.** Initial public functionality must solve a defined debate/discussion need while remaining predictable, understandable, and abuse-resistant.
- **Strict neutrality.** Arbiter maps positions, reasons, evidence, ambiguity, agreement, and unresolved issues. It does not become an advocate or judge by default.
- **Explicit invocation.** In v1, Arbiter responds conversationally only when mentioned, directly replied to, or invoked through a command or interactive component. It does not autonomously interject into ordinary chat.
- **Explicit data boundaries.** Public debate data, sensitive staff records, provider secrets, and operational controls are different classes of information with different access/use policies.
- **Purpose-bound structured memory.** Long-term memory consists primarily of defined summaries, precedents, approved references, server configuration, and automatic member dossiers. Raw message retention is bounded and authorized by channel policy; it is not the default durable-memory layer.
- **One capability at a time.** Establish reliable interactive chat and summarization before broad web research, MCP tools, autonomous agents, moderation automation, or legacy feature parity.
- **Provider independence.** Application services depend on an internal LLM client interface; gateway/model/provider details are configuration, not command logic.
- **Operational discipline.** Use least privilege, private internal services, quotas, structured logging, tested failure modes, backups, and deliberate rollout.
- **Decision transparency.** Significant choices belong here and in `docs/DECISIONS.md`; a candidate technology is not a commitment until selected for a defined need.

## 3. Established decisions

| Area | Decision | Status |
| --- | --- | --- |
| Repository | Clean implementation: `GodFossil/arbiter`; legacy project is historical reference only. | Established |
| Repository visibility | Private until a separate security, privacy, licensing, and contributor-readiness review. | Established |
| Default/integration branch | `master`. | Established |
| Documentation | Canonical project documentation lives in version-controlled `docs/`, not a separate wiki. | Established |
| Workflow | Issues track work; pull requests integrate meaningful changes; a Project may visualize work state. | Established |
| Merge policy | Squash merge is the sole integration strategy. | Established |
| Language/runtime | TypeScript on Node.js. | Established |
| Discord library | Plain `discord.js`, without a decorator framework. | Established |
| Package manager | pnpm, with a committed `pnpm-lock.yaml` and a pinned `packageManager` field. | Established |
| Module system | ES Modules: `"type": "module"`, TypeScript `module` and `moduleResolution` set to `NodeNext`. | Established |
| Local development | `tsx` runs and watches TypeScript source. | Established |
| Production runtime | Compile TypeScript into `dist/`; run compiled JavaScript with Node. | Established |
| Testing | Vitest. | Established |
| Formatting/linting | Biome. | Established |
| Database | PostgreSQL in a private Docker Compose service. | Established |
| Database access | Drizzle ORM; schema defined in TypeScript. | Established |
| Schema migrations | Reviewed, generated SQL migrations in Git; a separate migration job runs before an updated bot starts. | Established |
| Database backups | Scheduled encrypted PostgreSQL backups to private OCI Object Storage, with retention and restore tests. | Established |
| Background work | PostgreSQL-backed summary-job tracking; begin with one worker and no Redis/BullMQ. | Established |
| Runtime validation | Zod at untrusted input/output boundaries. | Established |
| Public availability | Members may use enabled public features, subject to channel policy, cooldowns, quotas, and limits. | Established |
| V1 chatbot activation | Mention Arbiter, reply directly to Arbiter, or use slash/context-menu commands and components. | Established |
| Passive participation | Arbiter does not autonomously reply to ordinary messages in v1. | Deferred |
| Message Content intent | Enabled because approved message history is required for contextual chat and summaries. | Established |
| History-use policy | Message-content technical access never by itself authorizes retention, summarization, or AI-context use; a channel policy does. | Established |
| V1 debate utility | Neutral thread/discussion summarization. | Established |
| Initial specialized command | `/arbiter summarize`. | Established |
| Conversation/debate voice | Neutral, analytical, concise, referential, and non-advocacy. | Established |
| Context scope | Server-wide institutional/debate context is permitted only for defined categories and approved channels. | Established |
| Deployment scope | Arbiter is exclusive to The Debate Server production guild and a separate private test guild. Production and test data remain logically separated by guild ID. | Established |
| Memory architecture | Structured-memory-first: durable memory consists primarily of summaries, precedents, approved references, server configuration, and member dossiers. Raw messages are retained only in bounded, channel-policy-authorized windows for live context and eligible processing. | Established |
| Member dossiers | Automatic dossiers may retain structured, source-linked debate records plus observed interaction style. They do not automatically include participant staff notes. | Established |
| Core Arbiter identity | Preserve the legacy Arbiter persona faithfully as the v1 core identity: calm, direct, bold, stoic, wise, humble, concise, truth-oriented, intellectually honest, and non-placatory. | Established |
| Sensitive functions | Dedicated Discord role: `Arbiter Staff`. | Established |
| Staff notes | Staff-only; never automatically included in ordinary v1 chatbot or summary prompts. | Established |
| Initial gateway | FreeLLMAPI as an internal self-hosted gateway. | Established |
| Model experience | One selected general-purpose default model; no public model picker. | Established |
| Provider routing | One personally controlled primary provider/key, one personally controlled fallback, optional disabled managed emergency route. | Established |
| Gateway client package | Official OpenAI JavaScript/TypeScript SDK behind a minimal Arbiter-owned adapter; application services do not depend directly on the SDK. SDK-level blind retries are disabled by default. | Established |
| Gateway exposure | Bot reaches gateway only through the private Docker network; gateway API/dashboard is not public. | Established |
| Initial hosting | Oracle Cloud Always Free VM, subject to actual tenancy capacity/limits, using Docker Compose. | Established |
| External tools | Broad web research, MCP, public APIs, and write-capable tools are deferred until core chat/summarization is stable. | Deferred |

## 4. Data and authorization model

### 4.1 Data classes

| Data class | Purpose | Who may create/edit | Who may read | Automatically used in ordinary v1 chatbot/summaries? |
| --- | --- | --- | --- | ---: |
| Server configuration | Approved channels, feature flags, quota values, operational settings, server policy | Arbiter Staff | Arbiter Staff | Yes, where needed |
| Published rules and approved references | Server rules, approved references, curated guidance | Arbiter Staff | Public if source is public; otherwise Arbiter Staff | Yes, where relevant |
| Debate summaries and precedents | Durable summaries, source metadata, and reusable precedents | Arbiter; Arbiter Staff may correct/manage | Public or staff according to source-channel policy | Yes, where relevant |
| Member dossiers | Structured, source-linked debate records and observed interaction style | Arbiter according to channel policy; Arbiter Staff may manage | Retrieval audience remains a separate policy decision | Only when a later authorized retrieval policy permits it |
| Participant staff notes | Sensitive internal staff recordkeeping | Arbiter Staff | Arbiter Staff | **No** |
| Summary jobs/rate-limit state | Job lifecycle, quotas, cooldowns, minimal operations metadata | Arbiter and Arbiter Staff as needed | Arbiter Staff where operational visibility is needed | No, except required controls |

### 4.2 Arbiter Staff role

Create and document a dedicated Discord role called `Arbiter Staff`. It is the v1 permission boundary for:

- approved-channel configuration and feature enablement;
- quota adjustment and temporary public-command disablement;
- approved rules/reference and precedent management;
- protected participant-note CRUD;
- operational job/failure visibility; and
- sensitive audit access.

Do not assume every moderator or administrator needs staff-note access. Normal public chatbot use does not require the role.

### 4.3 Staff notes and audit events

Staff notes are protected records, not a hidden source of AI judgment. Ordinary public chatbot and summary prompts must not retrieve, append, summarize, or otherwise use them.

Every sensitive-note action must create an append-only audit event containing:

```text
timestamp
acting staff member Discord user ID
action: created / edited / deleted
target Discord user ID
reason or note category
```

Audit events should not duplicate sensitive note text unless a separately approved policy requires it. Define retention, correction, deletion, and access-review procedures before real staff notes are stored.

### 4.4 Approved-channel policy

Message Content intent enables the technical ability to receive ordinary message content; it does not grant unlimited product permission to use that content. Arbiter must maintain a database-backed policy per channel/thread category.

| Channel policy | Mention/reply chatbot | History collection for `/arbiter summarize` | Retain summaries/precedents | Ordinary AI context |
| --- | ---: | ---: | ---: | ---: |
| Approved debate/discussion channel | Yes | Yes | Yes | Approved public/server context only |
| General channel | Optional, explicit mention/reply only | No by default | No by default | No general-history retrieval |
| Staff/private channel | Disabled unless explicitly staff-enabled | Only by explicit staff policy | Staff-only if enabled | Never include participant staff notes |

Arbiter uses a structured-memory-first model. Long-term memory consists primarily of summaries, precedents, approved references, server configuration, and automatic member dossiers. Raw messages may be retained only in bounded, channel-policy-authorized windows for live context and eligible summary processing, rather than as the default durable-memory layer.

Eligible raw-message records are retained for 30 days from their original Discord timestamp, then automatically deleted. Invoked chatbot context is capped at 30 eligible messages and 40,000 characters. Summary source material is capped at 250 eligible messages and 150,000 characters.

Context selection preserves author attribution and chronological ordering, excludes disallowed, bot/system, and irrelevant material, and must disclose bounded coverage when a summary cannot cover all eligible source material. Dossier extraction triggers, dossier retrieval audience, and profile-operation controls remain open decisions.

### 4.5 Secrets

Discord tokens, gateway credentials, upstream provider keys, database URLs, encryption keys, SSH keys, webhook signing secrets, and production exports are not application data. Never commit, log, paste into issues/PRs, or include them in `.env.example`.

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
    | mention / direct reply / slash command / context-menu command / component
    v
Arbiter Discord bot
    |
    +--> Interaction and channel policy
    |     - explicit invocation checks
    |     - Arbiter Staff authorization
    |     - approved-channel policy
    |     - per-user/per-channel cooldowns
    |     - server budget and input limits
    |
    +--> Application services
    |     - conversational response workflow
    |     - selected discussion collection
    |     - neutral summarization
    |     - approved rule/precedent retrieval
    |     - structured member-dossier creation and authorized retrieval
    |     - job lifecycle and audit events
    |
    +--> PostgreSQL
    |     - configuration/policies
    |     - approved context
    |     - summaries/precedents
    |     - member dossiers
    |     - staff notes
    |     - audit metadata
    |     - job/cooldown/budget state
    |
    +--> Provider-neutral LLM client (package choice pending)
              |
              v
          FreeLLMAPI: private internal gateway
              |
              +--> one default primary model/provider
              +--> normal fallback provider/model
              +--> optional disabled emergency route
```

### 5.1 Discord layer

The Discord layer handles Gateway connection, commands, interactions, direct mentions/replies, permission/channel checks, acknowledgement/defer behavior, and Discord-ready response formatting. It must contain no provider-specific model logic and as little business/debate logic as practical.

### 5.2 Application services

Application services own conversation context selection, summary collection/cleanup, prompt construction, Zod validation, budget enforcement, job handling, persistence, and output shaping. They operate through interfaces for database, time, and LLM access so behavior can be tested without Discord, PostgreSQL, or a live provider.

### 5.3 Database/job boundary

PostgreSQL is the durable source of truth for persistent Arbiter state. Summary jobs use explicit states:

```text
queued -> running -> completed
                 -> failed
                 -> cancelled
```

A uniqueness/active-job rule prevents duplicate work for the same guild/channel/thread/context window. Workers claim jobs through PostgreSQL locking; begin with one worker and only increase concurrency after measured need and testing.

### 5.4 Future tool boundary

External retrieval, public APIs, and MCP tools are outside v1's ordinary chatbot/summarizer path. Any later tool needs an allowlist, defined command scope, authorization, input/output validation, timeouts, limits, audit visibility, and source attribution where appropriate. Start with read-only capabilities.

## 6. Hosting, deployment, and recovery

### 6.1 Initial topology

```text
Oracle Cloud Always Free VM
    |
    +--> Docker Compose
           |
           +--> arbiter-bot
           |     - discord.js gateway connection
           |     - public chatbot / summary services
           |
           +--> arbiter-database
           |     - PostgreSQL
           |     - persistent volume
           |
           +--> arbiter-migrate
           |     - one-time migration job before updated bot startup
           |
           +--> ai-gateway
                 - FreeLLMAPI
                 - internal-only API/dashboard
```

Oracle Always Free availability is subject to home-region capacity and tenancy service limits. Confirm actual available VM shape before provisioning; do not make roadmap capacity figures a guarantee.

### 6.2 Network and secrets policy

- Arbiter reaches Discord and approved providers/gateway routes outbound as required.
- The bot reaches PostgreSQL and FreeLLMAPI only over the internal Docker network.
- PostgreSQL has no public port.
- FreeLLMAPI's API and dashboard have no public port.
- Use Docker Compose secrets where supported. Where a dependency requires environment variables, use protected server-side configuration that is not Git-tracked.
- Do not bake secrets into images or Dockerfiles.

### 6.3 Migration policy

1. Modify Drizzle TypeScript schema.
2. Generate SQL migrations with Drizzle Kit.
3. Review the migration SQL in the pull request.
4. Test against a non-production/disposable database.
5. Take the required pre-migration backup.
6. Deploy and run `arbiter-migrate` once.
7. Start/update the bot only after migration success.

The bot itself must not apply production migrations during a normal restart.

### 6.4 Backup policy

- Use scheduled PostgreSQL custom-format logical backups via `pg_dump -Fc`.
- Encrypt backups before off-VM upload.
- Upload to a private OCI Object Storage bucket.
- Keep multiple restore points under a documented retention policy.
- Take an additional backup before a production migration.
- Test restoration into an isolated PostgreSQL environment before public rollout and periodically afterward.
- Do not commit backup files, backup credentials, or encryption keys to Git.

## 7. Chat and summarizer behavior

### 7.1 V1 chatbot behavior

Arbiter is primarily a user-interactive chatbot. In v1, a member starts an ordinary conversation by mentioning Arbiter, replying to an Arbiter response, or using an explicit Discord interaction. Arbiter preserves the legacy Arbiter persona as its core identity: calm, direct, bold, stoic, wise, humble, concise, truth-oriented, intellectually honest, and non-placatory.

Task-specific instruction modules must preserve that identity while enforcing Arbiter's established authority boundaries: it does not declare debate winners, advocate for a participant by default, replace moderator judgment, autonomously moderate, or autonomously interject into ordinary discussion. The exact raw-message context-window limits remain open.

Arbiter does not decide to join ordinary conversation on its own in v1, even in channels where Message Content intent gives it visibility.

### 7.2 First specialized command

```text
/arbiter summarize
```

This command runs only in an approved discussion channel/thread. It validates invocation, channel policy, cooldown/budget status, minimum discussion threshold, active-job state, and bounded input before creating a `summarize_thread` job.

### 7.3 Summary output contract

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

The result is a record, not a verdict. Arbiter may describe a thread claim as unsupported, unclear, internally inconsistent, or unanswered only when grounded in the selected material. It must not declare that a participant won.

### 7.4 Public protections

| Protection | V1 behavior |
| --- | --- |
| Channel policy | Chat history and summaries only in configured/approved spaces |
| Per-user cooldown | Limit repeated expensive requests by one member |
| Per-channel cooldown | Prevent overlapping/repetitive requests in the same discussion |
| Per-server budget | Cap AI work to protect free-tier capacity and fairness |
| Input cap | Bound messages and total character/token volume |
| Minimum threshold | Decline tiny discussions unsuitable for summary |
| Active-job lock | One active summary job per matching context |
| Output validation | Zod validates model output before Discord posting |
| Failure behavior | Clear busy/unavailable/out-of-quota response; no duplicate replies |
| Staff control | Arbiter Staff can adjust limits or disable public features |

Exact numerical limits are an open decision to be calibrated before the public rollout.

### 7.5 Model-route evaluation policy

Select the primary and fallback FreeLLMAPI routes through a strict, repeatable evaluation process before public AI rollout. The corpus contains 50 fixtures: 35 synthetic fixtures and 15 authorized, non-sensitive Debate Server excerpts stored as curated private Git fixtures with minimal provenance metadata.

Evaluation uses hybrid scoring: automated gates and measurements plus an Arbiter Staff review rubric. Route selection weights analytical quality and behavior at 80% and operational performance at 20%. Candidates must pass mandatory automated gates, meet critical human-review floors, and then rank by weighted score.

A primary route requires at least 85/100 overall, at least 4.0/5 for grounded reasoning, instruction fidelity, and uncertainty/anti-fabrication behavior, and at least 3.5/5 for legacy Arbiter persona fidelity. A fallback requires at least 78/100 and the same critical floors; use an independent provider route where practical. If no candidate qualifies, public AI rollout does not proceed.

## 8. Implementation sequence

### Phase 0 — Product, privacy, and context contract

**Goal:** Complete the remaining high-impact policy decisions before coding user-facing behavior.

Deliverables:

- Message-history retention/context-window policy.
- Legacy-persona instruction audit and task-specific response-policy modules.
- Exact initial public channel policy.
- Initial primary/fallback provider/model evaluation criteria.
- Exact quota/cooldown proposal.
- Server-facing privacy/retention disclosure.
- `/arbiter summarize` user story, input scope, refusal/failure rules, and output contract.

**Exit criterion:** We can state what Arbiter responds to, which history it can use/retain, what it never uses, and what an ordinary member sees when it succeeds, refuses, or fails.

### Phase 1 — TypeScript bot foundation

**Goal:** Build the local application skeleton.

Deliverables:

- ESM/NodeNext TypeScript pnpm project.
- Plain discord.js application bootstrap.
- `tsx` local development and compiled `dist/` production scripts.
- Biome, Vitest, Zod, and initial CI workflow.
- Configuration loader/startup validation.
- Basic role/channel policy abstractions and a harmless diagnostic command.
- Arbiter-owned LLM adapter using the official OpenAI JavaScript/TypeScript SDK, with provider-specific details confined to infrastructure.

**Exit criterion:** The bot starts safely in a private test server/channel and fails safely with invalid configuration.

### Phase 2 — Deployment baseline

**Goal:** Run the minimal bot continuously on the intended Oracle VM.

Deliverables:

- OCI VM provisioned/hardened for Arbiter.
- Docker Compose production configuration.
- Bot container, private networking, restart policy, basic health/log behavior.
- Verified reconnection after container and VM restart.

**Exit criterion:** The bot runs continuously without publicly exposing internal service ports.

### Phase 3 — Data, permissions, and recovery

**Goal:** Implement durable state and sensitive boundaries.

Deliverables:

- PostgreSQL/Drizzle schema, migration tooling, and `arbiter-migrate` job.
- Persistent volume and database role policy.
- Channel-policy/configuration storage.
- Summary/precedent storage with source visibility classification.
- Member-dossier storage with source linkage and channel-policy boundaries.
- Arbiter Staff role checks, staff-note CRUD, and append-only audit events.
- PostgreSQL-backed job state.
- Scheduled encrypted OCI backup and tested restore procedure.
- Tests proving staff notes cannot enter ordinary prompts.

**Exit criterion:** Data classes are separated, recovery is tested, and unauthorized access/prompt inclusion is rejected by design and test.

### Phase 4 — Gateway and model pilot

**Goal:** Validate the chosen client implementation and a small FreeLLMAPI route.

Deliverables:

- FreeLLMAPI privately deployed beside Arbiter.
- Official OpenAI JavaScript/TypeScript SDK adapter configured for FreeLLMAPI's internal endpoint, explicit timeout, and no SDK-level blind retries.
- One primary and one fallback personally controlled provider route.
- One default model selected using representative, non-sensitive evaluation material.
- Timeout, quota, malformed-output, provider-failure, and fallback tests.
- Provider/model metadata linked to generated results without storing secrets.

**Exit criterion:** A repeatable internal chat/summary request works, errors are classified, and no credentials are in Git/history/logs.

### Phase 5 — Chatbot and summarizer pilot

**Goal:** Deliver interactive chat plus the first specialized debate utility in approved test spaces.

Deliverables:

- Mention/reply chatbot workflow using the established cap of 30 eligible messages and 40,000 characters.
- `/arbiter summarize` job workflow.
- Bounded message collection/cleanup.
- Fixed neutral summary prompt and Zod structured-output validation.
- Approved-context retrieval only.
- Public protection enforcement and Discord-safe response/defer handling.
- Manual evaluation with representative non-sensitive discussions.

**Exit criterion:** Responses and summaries are useful, neutral, accurate to input, cost-bounded, and safe under ordinary failure conditions.

### Phase 6 — Guarded public rollout

**Goal:** Enable chosen public functionality for members in approved server spaces.

Deliverables:

- Public mention/reply and command enablement according to channel policy.
- Final quota/cooldown/budget values.
- Arbiter Staff operational controls.
- Monitoring for errors, latency, quota usage, model fallback, and misuse.
- Concise server-facing privacy/retention notice.
- Incident, pause, and rollback procedure.

**Exit criterion:** Arbiter is reliable enough for real use and can be paused/recovered safely.

### Phase 7 — Deliberate expansion

Consider one capability at a time only after stable v1 use:

1. Rule and precedent lookup.
2. Argument mapping and clarification.
3. Socratic question generation.
4. Steelman-both-sides assistance.
5. Staff-only debate-case/moderation-support utilities.
6. Read-only external research/public API/MCP tools.

Every new capability needs a defined user benefit, privacy/context review, permissions, limits, tests, and acceptance criteria.

## 9. Deferred work

These are not v1 requirements:

- Passive autonomous participation in ordinary chat.
- Public multi-model selection.
- Multiple production gateways.
- Redis/BullMQ or multi-worker queue infrastructure.
- Autonomous agent behavior.
- Publicly prompted MCP execution.
- Unrestricted scraping or live-web research.
- Automatic staff-note inclusion in any model prompts.
- AI punishments or autonomous moderation/staff actions.
- Vector/semantic database before relational retrieval proves inadequate.
- Legacy feature parity.
- Public open-source release before readiness review.

## 10. Repository and security baseline

- Protect `master` with an active ruleset requiring PRs, resolved conversations, linear history, and blocked deletions/force pushes.
- Use zero required approvals while there is one maintainer; require CI checks after the test workflow exists.
- Enable Issues and Projects; keep Wiki and Discussions off initially.
- Allow only GitHub-owned and verified-creator Actions; default workflow-token permission is read-only contents.
- Enable dependency graph, automatic dependency submission, Dependabot alerts/security updates, secret scanning, push protection, and private vulnerability reporting where available.
- Keep webhooks, deploy keys, Pages, Codespaces, environments, and autonomous repository-level Copilot workflows unconfigured until there is a reviewed need.
- Create `development` and `production` environments only when deployment automation starts. Scope secrets to environments and require manual approval for production deployment from `master`.

## 11. Open v1 decisions

| Decision | Why it remains open | Resolve by |
| --- | --- | --- |
| Dossier operation policy | Extraction triggers, retrieval audience, source/provenance requirements, retention, and staff/member controls need explicit definition. | Phase 0/3 |
| Primary/fallback provider and model | Named FreeLLMAPI routes must be evaluated privately against the established mixed corpus before selection. | Phase 4 |
| Exact numerical limits | Cooldown, input cap, daily server budget, retry count, and stuck-job timeout need calibration. | Phase 0/5 |
| Initial database schema detail | Tables, indexes, constraints, and visibility model must follow the context/retention policy. | Phase 3 |
| OCI provisioning details | VM shape, OS, firewall/SSH hardening, DNS/admin access, and backup credentials depend on actual account capacity. | Phase 2 |
| Public data/privacy notice | Exact server-facing disclosure must match final retention and channel policy. | Before Phase 6 |

## 12. Primary references

- [Discord Developer Documentation](https://docs.discord.com/developers/intro)
- [Discord Gateway intents and privileged-intent guidance](https://docs.discord.com/developers/gateway/you-might-not-need-a-privileged-intent)
- [Discord interactions and commands](https://docs.discord.com/developers/interactions/overview)
- [Discord API rate limits](https://docs.discord.com/developers/topics/rate-limits)
- [Discord Gateway](https://docs.discord.com/developers/events/gateway)
- [Oracle Cloud Always Free resources](https://docs.oracle.com/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm)
- [Oracle Cloud service limits](https://docs.oracle.com/iaas/Content/General/service-limits/default.htm)
- [Docker Compose secrets](https://docs.docker.com/compose/how-tos/use-secrets/)
- [Docker Compose production guidance](https://docs.docker.com/compose/how-tos/production/)
- [PostgreSQL documentation](https://www.postgresql.org/docs/)
- [PostgreSQL `pg_dump`](https://www.postgresql.org/docs/current/app-pgdump.html)
- [Drizzle ORM migrations](https://orm.drizzle.team/docs/migrations)
- [FreeLLMAPI](https://github.com/tashfeenahmed/freellmapi)
- [OmniRoute](https://github.com/diegosouzapw/OmniRoute)

### Candidate resources for later decisions

- Public API catalogs: `public-apis/public-apis`, `public-api-lists/public-api-lists`, and `JuanPabloDiaz/freeForGeeks`.
- Memory/agent references: `akitaonrails/ai-memory`, Upstash Context7, LangChain, `gfernandf/agent-skills`, and `volcengine/OpenViking`.
- Future read-only tool candidates: Firecrawl MCP Server, Bright Data MCP Server, Hugging Face MCP Server, Tavily, and ScrapeGraphAI.

These resources are inputs for later specific decisions, not default runtime dependencies.
