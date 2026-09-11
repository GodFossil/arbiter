# Arbiter Project Roadmap

> **Status:** Canonical v1 roadmap  
> **Last updated:** 2026-09-11  
> **Repository:** `GodFossil/arbiter`  
> **Default branch:** `master`

## 1. Version-one mission

Arbiter is a Discord utility bot for The Debate Server. Its first user-facing capability is a narrowly scoped, rate-limited, neutral discussion summarizer:

```text
/arbiter summarize
```

The initial pilot produces a structured record of an explicitly selected discussion. It maps positions, claims, reasons, evidence, ambiguity, agreement, and unresolved issues. It supports discussion; it does not replace human judgment, moderator authority, or participant agency.

Arbiter must not:

- declare debate winners;
- advocate for a participant by default;
- make autonomous moderation decisions;
- replace moderator judgment;
- autonomously interject into ordinary discussion; or
- present uncertain claims as established fact.

The legacy Arbiter repository and prior Render deployment are historical reference material only. They may inform useful product concepts and tone, but their code, dependencies, architecture, credentials, deployment choices, and feature set are not requirements for this clean-slate implementation.

## 2. Governing principles

- **Public utility first.** Initial functionality must solve a defined debate-support need while remaining understandable, predictable, and abuse-resistant.
- **Strict neutrality.** Arbiter maps positions, reasons, evidence, ambiguity, agreement, and unresolved issues. It is not an advocate or judge by default.
- **Explicit invocation.** Arbiter acts only after a direct command or later explicitly approved interaction. It does not passively participate in ordinary chat.
- **Explicit data boundaries.** Technical access to Discord content does not itself authorize collection, retention, summarization, or model-context use. A defined channel policy does.
- **Minimum necessary data.** Retain only data that a currently implemented feature requires. Do not create participant psychological or ideological profiles.
- **One capability at a time.** Establish the summary pilot before chatbot behavior, broad web research, MCP tools, autonomous agents, moderation automation, or legacy feature parity.
- **Provider independence.** Application services depend on an Arbiter-owned LLM interface; gateway, model, and provider details are configuration rather than command logic.
- **Operational discipline.** Use least privilege, quotas, bounded inputs, structured operational logs, tested failure modes, and deliberate rollout.
- **Decision transparency.** This roadmap records v1 commitments and phase gates. A candidate technology is not a commitment until selected for a defined need.

## 3. Established decisions

| Area | Decision | Status |
| --- | --- | --- |
| Repository | Clean implementation: `GodFossil/arbiter`; legacy project is historical reference only. | Established |
| Repository visibility | Private until a separate security, privacy, licensing, and contributor-readiness review. | Established |
| Default/integration branch | `master`. | Established |
| Documentation | Canonical project documentation lives in version-controlled `docs/`, not a separate wiki. | Established |
| Workflow | Issues track actionable work; pull requests integrate meaningful changes; a Project may visualize work state. | Established |
| Merge policy | Squash merge is the sole integration strategy. | Established |
| Language/runtime | TypeScript on Node.js. | Established |
| Discord library | Plain `discord.js`, without a decorator framework. | Established |
| Package manager | pnpm, with a committed `pnpm-lock.yaml` and a pinned `packageManager` field. | Established |
| Module system | ES Modules: `"type": "module"`, with TypeScript `module` and `moduleResolution` set to `NodeNext`. | Established |
| Local development | `tsx` runs and watches TypeScript source. | Established |
| Production runtime | Compile TypeScript into `dist/`; run compiled JavaScript with Node. | Established |
| Testing | Vitest. | Established |
| Formatting/linting | Biome. | Established |
| Runtime validation | Zod at untrusted input/output boundaries. | Established |
| Deployment scope | Arbiter is exclusive to The Debate Server production guild and a separate private test guild. Production and test data remain logically separated by guild ID. | Established |
| First user-facing capability | Neutral thread/discussion summarization through `/arbiter summarize`. | Established |
| Pilot interaction scope | The initial pilot is summary-only. Mention/reply chatbot behavior is deferred. | Established |
| Summary voice | Neutral, analytical, concise, referential, and non-advocacy. | Established |
| Invocation | A summary requires explicit slash-command invocation. | Established |
| Channel authorization | Channel policy, not Message Content access alone, authorizes collection and model-context use. | Established |
| Message Content intent | Enable only when approved-history collection is implemented in the private pilot. | Established |
| Pilot raw-source retention | Raw source messages are held in memory only for the accepted request and discarded when it completes or fails. | Established |
| Pilot summary persistence | The pilot creates no Arbiter-side durable summaries, precedents, or reusable AI context. The Discord response remains subject to its channel’s normal Discord retention. | Established |
| Member dossiers | Not part of the initial pilot or v1 core path. Any future dossier capability requires a separate approved use case and policy. | Deferred |
| Sensitive functions | Dedicated Discord role: `Arbiter Staff`. | Established |
| Staff notes | Staff-only; never automatically included in ordinary summary or future chatbot prompts. | Established |
| LLM client | Official OpenAI JavaScript/TypeScript SDK behind a minimal Arbiter-owned adapter; application services do not depend directly on the SDK. SDK-level blind retries are disabled by default. | Established |
| Initial gateway | FreeLLMAPI as an internal self-hosted gateway candidate. | Established |
| Model experience | One selected general-purpose default model; no public model picker. | Established |
| Provider routing | One personally controlled primary provider/key, one personally controlled fallback, and an optional disabled managed emergency route. | Established |
| Gateway exposure | Arbiter reaches the gateway only through a private Docker network; gateway API/dashboard is not public. | Established |
| Initial hosting | Oracle Cloud Always Free VM, subject to actual tenancy capacity and limits, using Docker Compose. | Established |
| External tools | Broad web research, MCP, public APIs, and write-capable tools are deferred until the summary pilot is stable. | Deferred |

## 3.1 Current implementation status

**Status as of 2026-09-03:** The initial Discord connectivity and interaction vertical slice is complete in the private development guild. This is partial Phase 1 progress, not completion of Phase 1 or authorization for public deployment.

Completed:

- Created the Arbiter Discord application and bot identity.
- Configured and installed Arbiter into the separate private development guild.
- Configured development installation with the `bot` and `applications.commands` scopes.
- Kept privileged gateway intents disabled during the bootstrap slice.
- Established a TypeScript/Node.js/ES Modules project using plain `discord.js`, pnpm, and `tsx` local development.
- Added local environment-based configuration; credentials remain in Git-ignored `.env`, with a safe `.env.example` template.
- Implemented a minimal Discord gateway client using only the `Guilds` intent.
- Implemented separate development-guild slash-command registration.
- Implemented, registered, routed, and manually verified the harmless `/ping` diagnostic command.
- Verified a successful `/ping` response with measured gateway latency of 44 ms.
- Migrated the project to pnpm with a committed `pnpm-lock.yaml`, `pnpm-workspace.yaml`, and pinned `packageManager` value.
- Corrected the application configuration contract to use `DISCORD_TOKEN`, `DISCORD_APPLICATION_ID`, and `DISCORD_GUILD_ID`.
- Committed and pushed the working bootstrap and package/configuration-alignment changes.

Not yet complete:

- Compiled `dist/` production scripts, Vitest, Biome, Zod, CI, configuration-schema validation, role/channel-policy abstractions, and the provider-neutral LLM adapter remain Phase 1 work.
- No database, AI gateway, message-history collection, summarization, staff-note, chatbot, or production deployment behavior has been implemented.
- No public functionality is enabled in The Debate Server.

## 4. Pilot data and authorization

### 4.1 Approved-space policy

The initial `/arbiter summarize` pilot is **default deny**. A source space is eligible only if its exact Discord channel ID is configured as an approved pilot discussion channel.

| Space | Pilot behavior |
| --- | --- |
| Explicitly approved discussion channel | Slash command and same-channel source collection permitted |
| Child thread of an explicitly approved discussion channel | Slash command and collection within that thread permitted; the thread inherits only its parent channel’s approval |
| Unconfigured channel or thread | Command refused; no source collection |
| General channel | Command refused; no source collection |
| Staff/private channel | Command refused; no source collection |
| DM, group DM, or another guild | Command unavailable or refused; no source collection |
| Category membership alone | Does not grant approval |

The pilot does not support arbitrary channel selection, cross-channel collection, cross-thread collection, message-link traversal, category-wide authorization, or staff exceptions. An approved parent allows collection only from that parent itself or from one of its child threads; it does not authorize collection across siblings.

### 4.2 Summary source contract

An accepted invocation summarizes only the channel or thread in which the command was invoked.

Collection must:

- preserve chronological ordering and Discord author attribution;
- include only eligible human-authored messages from the same authorized source space;
- exclude bot messages, system messages, unavailable or deleted messages, and material excluded by channel policy;
- apply simple mechanical filtering rather than an opaque pre-summary relevance judgment;
- select the most recent eligible window ending at invocation, subject to both caps below; and
- disclose that coverage was bounded when older otherwise eligible material was excluded by a cap.

Pilot source limits:

| Limit | Value |
| --- | ---: |
| Maximum eligible source messages | 250 |
| Maximum total source characters | 150,000 |
| Minimum eligible human messages | 8 |

The collector stops when either maximum cap is reached. A request with fewer than the minimum eligible messages is refused rather than sent to the model.

### 4.3 Retention and visibility

For the initial pilot:

- Source-message text and derived prompt material exist only in process memory for the accepted job.
- Arbiter discards source-message text when the job completes, fails, or is cancelled.
- Arbiter does not persist raw source messages, source excerpts, author profiles, member dossiers, durable summaries, precedents, embeddings, or reusable model context.
- The completed summary is posted only in the same approved channel or thread from which it was invoked.
- The posted Discord message remains governed by Discord and the source channel’s ordinary retention and moderation practices; Arbiter does not independently classify it as an institutional record.
- Staff notes are never collected, retrieved, or included in the summary prompt.

This pilot retention policy supersedes any earlier assumption that raw messages must be retained for a fixed period. Any later retention or summary/precedent feature requires a separate demonstrated use case, visibility classification, deletion/correction policy, and implementation decision.

### 4.4 Staff boundary

`Arbiter Staff` is the v1 role for later configuration and sensitive operations, including approved-channel configuration, public-feature enablement, quota adjustment, temporary disablement, approved-reference management, and operational visibility.

The role does not create a pilot exception for staff/private channels, does not authorize staff-note use in summaries, and does not permit private cross-channel source collection.

## 5. Summary behavior

### 5.1 Command

```text
/arbiter summarize
```

Before accepting a job, Arbiter validates:

1. Explicit invocation in an approved source space.
2. Exact source-space policy.
3. Per-user and per-source cooldown state.
4. Development-guild budget state.
5. Minimum eligible-message threshold.
6. Bounded source collection.
7. Active-job lock for the same source space.

The command has no free-form request that changes its source scope during the pilot.

### 5.2 Output contract

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

The result is a record, not a verdict. Arbiter may describe a claim as unsupported, unclear, internally inconsistent, or unanswered only when that description is grounded in the selected source material. It must not state that a participant won.

### 5.3 Pilot protections and outcomes

| Protection | Pilot behavior |
| --- | --- |
| Source policy | Default deny; exact configured channel or approved child thread only |
| Per-user cooldown | Pilot default: 15 minutes after an accepted job |
| Per-source cooldown | Pilot default: 10 minutes after an accepted job |
| Development-guild budget | Pilot default: 20 accepted summary jobs per UTC day |
| Minimum threshold | 8 eligible human messages |
| Input cap | 250 eligible messages and 150,000 characters |
| Active-job lock | One active job for the exact source channel/thread |
| Timeout | Pilot default: 45 seconds end-to-end after acceptance |
| Retry policy | No blind retry after an uncertain provider outcome |
| Output validation | Validate the model result before Discord posting |
| Staff control | Later authorized staff configuration may adjust limits or disable the feature |

These values are pilot defaults, not permanent public-rollout commitments. They must be reviewed against observed use, cost, quality, latency, and failure behavior before expansion.

Stable user-facing outcomes:

| Condition | Response intent |
| --- | --- |
| Unapproved space | State that summaries are not enabled in that channel |
| Insufficient eligible material | State that there is not enough eligible discussion for a useful summary |
| Active job | State that a summary is already in progress for this discussion |
| Cooldown | State that the user should wait before requesting another summary |
| Budget exhausted | State that the server’s current summary capacity is exhausted |
| Temporary failure or timeout | State that the summary could not be completed and may be retried later |

Normal user-facing responses must not reveal raw source content, provider names, route names, credentials, stack traces, or internal policy details. The workflow must not produce duplicate Discord replies.

## 6. Target architecture

The target architecture is intentionally descriptive rather than an instruction to implement every component now.

```text
Discord slash command
    |
    v
Arbiter Discord bot
    |
    +--> explicit invocation and approved-space policy
    +--> bounded source collector and summary workflow
    +--> pilot cooldown, budget, and active-job controls
    +--> Arbiter-owned LLM client interface
              |
              v
          private AI gateway
```

Future persistent configuration, database-backed jobs, deployment services, approved references, staff records, and any durable memory remain later phase work. They are not prerequisites for the in-memory private summary pilot unless a demonstrated requirement makes them necessary.

### 6.1 Discord layer

The Discord layer handles Gateway connection, slash-command registration, interaction acknowledgement and defer behavior, policy checks, source retrieval, and Discord-ready output formatting. It contains no provider-specific model logic and as little debate logic as practical.

### 6.2 Application services

Application services own source validation, bounded collection, prompt construction, structured-output validation, pilot protection enforcement, failure classification, and output shaping. They should be testable without Discord or a live provider.

### 6.3 Future persistence boundary

If later features demonstrate a need for durable configuration, jobs, approved references, summaries, or sensitive staff records, PostgreSQL with Drizzle remains the planned relational option. No vector database, semantic-memory stack, member dossier system, or database schema is authorized solely for anticipated future needs.

### 6.4 Future tool boundary

External retrieval, public APIs, web research, and MCP tools are outside the summary pilot. A later tool requires a defined command scope, allowlist, authorization, input/output validation, timeouts, limits, audit visibility, and source attribution where appropriate. Begin only with read-only capabilities.

## 7. Gateway and model policy

FreeLLMAPI remains the candidate internal gateway. Arbiter will access it only through an Arbiter-owned adapter built on the official OpenAI JavaScript/TypeScript SDK. Provider-specific details remain outside the command and summary workflow.

Before public AI rollout, evaluate one primary and one fallback route against a repeatable corpus of authorized, non-sensitive material. The existing evaluation policy remains:

- 50 fixtures: 35 synthetic fixtures and 15 authorized, non-sensitive Debate Server excerpts with minimal provenance metadata.
- Hybrid evaluation: automated gates and measurements plus an Arbiter Staff review rubric.
- Analytical quality and behavior weighted at 80%; operational performance weighted at 20%.
- Primary route requires at least 85/100 overall, 4.0/5 for grounded reasoning, instruction fidelity, and uncertainty/anti-fabrication behavior, and 3.5/5 for persona fidelity.
- Fallback route requires at least 78/100 and the same critical floors; use an independent provider where practical.
- If no candidate qualifies, public AI rollout does not proceed.

The private summary pilot may not proceed to a live model call until its own minimal route, timeout, malformed-output, and failure behavior have been tested. No credentials belong in Git, logs, issues, pull requests, or documentation examples.

## 8. Implementation sequence

### Phase 0 — Product, privacy, and pilot contract

**Goal:** Complete the policy decisions required to implement the narrow summary pilot safely.

Deliverables:

- Summary-only pilot scope.
- Default-deny approved-space policy and child-thread inheritance rule.
- Same-space source-collection contract and bounded-coverage disclosure rule.
- In-memory-only raw-source lifecycle and no-durable-output pilot policy.
- Staff-note exclusion rule.
- Pilot cooldown, threshold, budget, timeout, active-job, retry, refusal, and failure defaults.
- Server-facing disclosure draft for a later public rollout.

**Exit criterion:** We can state exactly where a summary can run, what it can collect, what is excluded, what Arbiter retains, what it never uses, and what a member sees on success, refusal, or failure.

### Phase 1 — TypeScript bot foundation

**Status:** In progress. The pnpm project setup, Discord gateway bootstrap, development-guild command registration, and `/ping` diagnostic slice are complete. The remaining deliverables and exit criterion still apply.

**Goal:** Complete the local application foundation needed for safe pilot development.

Deliverables:

- ESM/NodeNext TypeScript pnpm project.
- Plain discord.js application bootstrap.
- `tsx` local development and compiled `dist/` production scripts.
- Biome, Vitest, Zod, and an initial read-only CI workflow.
- Configuration loader and startup validation.
- Minimal approved-space policy abstraction and harmless diagnostic command.
- Arbiter-owned LLM adapter interface, without a live provider dependency in normal local development.

**Exit criterion:** The bot starts safely in the private test guild, responds to a harmless diagnostic command, and fails safely with invalid configuration.

### Phase 2 — Private model-route proof

**Goal:** Validate a small internal model route before any public or pilot summary use.

Deliverables:

- FreeLLMAPI privately accessible to Arbiter only.
- Official OpenAI SDK adapter configured with an explicit timeout and no SDK-level blind retries.
- One controlled primary route and one controlled fallback candidate.
- Tests for normal response, timeout, malformed output, known provider failure, and no duplicate Discord reply.
- Minimal operational metadata that does not retain raw Discord content or secrets.

**Exit criterion:** A repeatable internal summarization request succeeds; failure is classified; credentials and raw source content are absent from Git and normal logs.

### Phase 3 — Summary-only private pilot

**Goal:** Implement `/arbiter summarize` in explicitly approved private test spaces.

Deliverables:

- Message Content intent enabled only for the private pilot when required.
- Default-deny channel-policy evaluation.
- Same-space bounded collection, mechanical filtering, chronological ordering, author attribution, and coverage disclosure.
- In-memory source lifecycle with no durable source/output persistence.
- Fixed neutral summary prompt and structured-output validation.
- Pilot protection enforcement and Discord-safe defer/reply handling.
- Tests for denied spaces, thread inheritance, source isolation, caps, threshold refusal, job lock, staff-note exclusion, and no raw-source persistence.
- Manual evaluation using representative, non-sensitive discussions.

**Exit criterion:** Summaries are useful, neutral, accurate to the bounded input, non-persistent on the Arbiter side, and safe under ordinary refusal and failure conditions.

### Phase 4 — Guarded public rollout

**Goal:** Decide whether to enable the proven summary feature for members in explicitly approved production discussion spaces.

Deliverables:

- Review of private-pilot quality, cost, latency, failures, and misuse patterns.
- Final public cooldown, budget, threshold, and capacity values.
- Arbiter Staff operational controls and a concise public privacy/retention notice.
- Monitoring for errors, latency, quota use, fallback, and misuse.
- Incident, pause, and rollback procedure.

**Exit criterion:** The summary feature meets agreed reliability, privacy, and quality expectations and can be paused safely.

### Phase 5 — Deliberate expansion

After stable summary use, consider one capability at a time. Possible candidates include:

1. Mention/reply chatbot behavior with a separately approved context policy.
2. Rule and precedent lookup with explicit retention and visibility rules.
3. Argument mapping and clarification.
4. Socratic question generation.
5. Steelman-both-sides assistance.
6. Staff-only debate-case or moderation-support utilities.
7. Read-only external research, public API, or MCP tools.

Every addition requires a defined user benefit, privacy/context review, permissions, limits, tests, acceptance criteria, and an explicit decision to expand scope.

## 9. Deferred work

These are not requirements of the summary pilot:

- Mention/reply chatbot behavior.
- Passive autonomous participation in ordinary chat.
- Member dossiers, psychological profiles, ideological profiles, or observed-style profiling.
- Durable raw-message retention.
- Durable summary/precedent storage or automatic reuse as AI context.
- Database schema, migrations, backups, or a queue system without a demonstrated persistence need.
- Public multi-model selection or multiple production gateways.
- Redis, BullMQ, or multi-worker queue infrastructure.
- Autonomous agent behavior.
- Publicly prompted MCP execution.
- Unrestricted scraping or live-web research.
- Automatic staff-note inclusion in any model prompt.
- AI punishments or autonomous moderation/staff actions.
- Vector/semantic databases before a demonstrated relational-retrieval limitation.
- Legacy feature parity.
- Public open-source release before readiness review.

## 10. Repository and security baseline

- Protect `master` with an active ruleset requiring pull requests, resolved conversations, linear history, and blocked deletions/force pushes.
- Use zero required approvals while there is one maintainer; require CI checks after the test workflow exists.
- Enable Issues and Projects; keep Wiki and Discussions off initially.
- Allow only GitHub-owned and verified-creator Actions; default workflow-token permission is read-only contents.
- Enable dependency graph, automatic dependency submission, Dependabot alerts/security updates, secret scanning, push protection, and private vulnerability reporting where available.
- Keep webhooks, deploy keys, Pages, Codespaces, environments, and autonomous repository-level Copilot workflows unconfigured until there is a reviewed need.
- Create `development` and `production` environments only when deployment automation starts. Scope secrets to environments and require manual approval for production deployment from `master`.

## 11. Open decisions

| Decision | Why it remains open | Resolve by |
| --- | --- | --- |
| Primary/fallback provider and model | Named routes require private evaluation against the established corpus. | Phase 2 |
| Public rollout limits | Pilot values require quality, cost, latency, and misuse evidence before production adoption. | Phase 4 |
| Public data/privacy notice | The exact notice must match the final production retention and channel policy. | Before Phase 4 |
| Durable storage need | Storage is deferred unless a proven feature requires configuration, jobs, approved references, summaries, or other persistent state. | On demonstrated need |
| Chatbot context policy | Mention/reply behavior has a separate source-scope, retention, and safety policy from summary collection. | Before any chatbot implementation |
| OCI provisioning details | VM shape, OS, firewall/SSH hardening, DNS/admin access, and credentials depend on actual account capacity. | Before deployment |
| Future member-dossier policy | Any reconsideration needs a separate use case, provenance, retrieval audience, retention, correction/deletion controls, and privacy review. | Only if proposed after stable v1 |

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
- [Drizzle ORM migrations](https://orm.drizzle.team/docs/migrations)
- [FreeLLMAPI](https://github.com/tashfeenahmed/freellmapi)

Candidate catalogs and frameworks are inputs for later, specific decisions only; they are not default Arbiter dependencies.