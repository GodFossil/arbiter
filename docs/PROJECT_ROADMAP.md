# Arbiter Project Roadmap

> **Status:** Canonical v1 roadmap
> **Last updated:** 2026-09-29
> **Repository:** `GodFossil/arbiter`
> **Default branch:** `master`

## 1. Version-one mission

Arbiter is a Discord utility bot for The Debate Server. Its first
user-facing capability is direct mention/reply conversation, followed by a
narrowly scoped, rate-limited, neutral discussion summarizer:

```text
@Arbiter <message>          — direct conversation via mention or reply
/arbiter summarize          — neutral thread/discussion summary
```

Arbiter must not:

- declare debate winners;
- advocate for a participant by default;
- make autonomous moderation decisions;
- replace moderator judgment;
- autonomously interject into ordinary discussion; or
- present uncertain claims as established fact.

The legacy Arbiter repository and prior Render deployment are historical
behavioral reference material only. They may inform useful product
concepts, interaction design, and persona tone, but their code,
dependencies, architecture, credentials, deployment choices, and feature
set are not requirements for this clean-slate implementation.

## 2. Governing principles

- **Public utility first.** Initial functionality must solve a defined
  debate-support need while remaining understandable, predictable, and
  abuse-resistant.
- **Strict neutrality.** Arbiter maps positions, reasons, evidence,
  ambiguity, agreement, and unresolved issues. It is not an advocate or
  judge by default.
- **Explicit invocation.** Arbiter acts only after a direct mention,
  reply, or slash command. It does not passively participate in ordinary
  chat during v1.
- **Preserve legacy persona precisely.** Arbiter's personality — calm,
  direct, bold, stoic, concise, philosophically informed, committed to
  truth over appeasement — is carried forward exactly from the legacy
  project. Any runtime deviation is a bug.
- **Explicit data boundaries.** Technical access to Discord content does
  not itself authorize collection, retention, summarization, or
  model-context use. A defined channel policy does.
- **Minimum necessary data.** Retain only data that a currently
  implemented feature requires. Do not create participant psychological or
  ideological profiles.
- **One capability at a time.** Establish working mention/reply
  conversation and then the summary pilot before passive monitoring,
  broad web research, MCP tools, autonomous agents, or moderation
  automation.
- **Provider independence.** Application services depend on an
  Arbiter-owned LLM interface; gateway, model, and provider details are
  configuration rather than command logic.
- **Operational discipline.** Use least privilege, quotas, bounded
  inputs, structured operational logs, tested failure modes, and
  deliberate rollout.
- **Decision transparency.** This roadmap records v1 commitments and
  phase gates. A candidate technology is not a commitment until selected
  for a defined need. Decisions are labelled **Established**, **Proposed**,
  or **Open**.

## 3. Established decisions

| Area | Decision | Status |
| --- | --- | --- |
| Repository | Clean implementation: `GodFossil/arbiter`; legacy project is historical behavioral reference only. | Established |
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
| First user-facing capability | **Mention/reply conversation.** This supersedes the earlier summary-first ordering. Summarization remains the second planned capability. | Established |
| Legacy persona | Arbiter's personality is preserved precisely from the legacy project. Exact-match persona verification is a Phase 1 acceptance gate. | Established |
| Summary voice | Neutral, analytical, concise, referential, and non-advocacy. | Established |
| Invocation | A summary requires explicit slash-command invocation. Conversation requires a direct mention or reply to Arbiter. | Established |
| Channel authorization | Channel policy, not Message Content access alone, authorizes collection and model-context use. | Established |
| Message Content intent | Enable only when approved-history collection is implemented in the private pilot. | Established |
| Pilot raw-source retention | Raw source messages are held in memory only for the accepted request and discarded when it completes or fails. | Established |
| Pilot summary persistence | The pilot creates no Arbiter-side durable summaries, precedents, or reusable AI context. The Discord response remains subject to its channel's normal Discord retention. | Established |
| Member dossiers | Not part of the initial pilot or v1 core path. Any future dossier capability requires a separate approved use case and policy. | Deferred |
| Sensitive functions | Dedicated Discord role: `Arbiter Staff`. | Established |
| Staff notes | Staff-only; never automatically included in ordinary summary or future chatbot prompts. | Established |
| LLM client | Official OpenAI JavaScript/TypeScript SDK behind a minimal Arbiter-owned adapter; application services do not depend directly on the SDK. SDK-level blind retries are disabled. Adapter currently uses placeholder environment variables (`AI_BASE_URL`, `AI_API_KEY`, `AI_MODEL`, optional `AI_FALLBACK_MODEL`) with explicit `timeout: 30_000` and `maxRetries: 0`. | Established |
| Initial gateway | FreeLLMAPI as the internal self-hosted gateway. | Established |
| FreeLLMAPI hosting | Render free Web Service in a separate Render account. | Established |
| Arbiter hosting plan | Render free Web Service in its own separate Render account, kept awake by scheduled UptimeRobot HTTP checks during the pilot. | Established |
| Service-to-service connection | Arbiter calls FreeLLMAPI over public HTTPS using the gateway's Render URL and a FreeLLMAPI-issued unified API key. The earlier private Docker-network assumption is superseded for the free Render deployment. | Established |
| FreeLLMAPI persistence | FreeLLMAPI's encrypted SQLite database is backed up through an authenticated Cloudflare Worker to a private Cloudflare R2 bucket and restored automatically on startup. Restart/restore testing passed with provider configuration and unified key preserved across redeploy. | Established |
| Model evaluation | One selected general-purpose default model; no public model picker. Primary and fallback routes evaluated against a 50-fixture corpus (35 synthetic + 15 authorized Debate Server excerpts). Analytical quality weighted 80%, operational performance 20%. Primary route must score ≥ 85/100 overall and ≥ 4.0/5 on reasoning, instruction fidelity, and anti-fabrication floors. | Established |
| External tools | Broad web research, MCP, public APIs, and write-capable tools are deferred until the summary pilot is stable. | Deferred |

## 3.1 Proposed decisions (not yet verified)

These represent the current intended direction but require implementation
and testing before they are treated as established.

| Area | Proposed direction | What must happen before it is established |
| --- | --- | --- |
| Arbiter Render uptime reliability | UptimeRobot keep-awake checks are expected to keep the free Arbiter web service responsive enough for pilot use. | Live service remains reliably reachable over time and the Discord bot stays acceptably available in practice. |
| Named primary/fallback model pair | A specific production model pair will be chosen after private evaluation. | End-to-end AI response verified; private corpus evaluation completed and scored. |

## 3.2 Current implementation status

**Status as of 2026-09-29.**

Completed:

- Created the Arbiter Discord application and bot identity.
- Configured and installed Arbiter into the separate private development
  guild.
- Established a TypeScript/Node.js/ES Modules project using plain
  `discord.js`, pnpm, and `tsx` local development.
- Local environment-based configuration; credentials in Git-ignored
  `.env`, with a `.env.example` template.
- Minimal Discord gateway client.
- Development-guild slash-command registration.
- `/ping` diagnostic command implemented, registered, and manually
  verified (44 ms gateway latency).
- pnpm migration with committed lockfile and pinned `packageManager`.
- Mention/reply conversation code implemented and committed.
- Official OpenAI JavaScript/TypeScript SDK added as a dependency
  (`openai`); Arbiter adapter implemented with placeholder env vars,
  explicit timeout, disabled SDK retries, and optional fallback model.
- `pnpm build` (`tsc`) passes with no errors.
- FreeLLMAPI deployed on Render in a separate account.
- FreeLLMAPI persistence configured via authenticated Cloudflare Worker
  and private Cloudflare R2 bucket.
- FreeLLMAPI restart/restore test passed; unified key and Groq provider
  configuration survived redeploy.
- Arbiter adapter deployment assumption updated: it will call the
  gateway's public HTTPS `/v1` endpoint rather than a private network
  address when using Render free services.

Not yet complete:

- Persona exact-match acceptance test (written and passing in Vitest).
- Vitest, Biome, Zod, CI, and configuration-schema validation.
- Live Arbiter-side environment configuration pointing at the real
  gateway URL and unified key.
- Successful first Discord conversation verified end-to-end through the
  deployed gateway.
- Named primary and fallback model route selection.
- Model route evaluation corpus and private scoring run.
- Any summarization, database, staff-note, passive detection, or
  production deployment behavior.
- No public functionality is enabled in The Debate Server.

## 4. Pilot data and authorization

### 4.1 Approved-space policy

The initial `/arbiter summarize` pilot is **default deny**. A source
space is eligible only if its exact Discord channel ID is configured as
an approved pilot discussion channel.

| Space | Pilot behavior |
| --- | --- |
| Explicitly approved discussion channel | Slash command and same-channel source collection permitted |
| Child thread of an explicitly approved discussion channel | Slash command and collection within that thread permitted; the thread inherits only its parent channel's approval |
| Unconfigured channel or thread | Command refused; no source collection |
| General channel | Command refused; no source collection |
| Staff/private channel | Command refused; no source collection |
| DM, group DM, or another guild | Command unavailable or refused; no source collection |
| Category membership alone | Does not grant approval |

The pilot does not support arbitrary channel selection, cross-channel
collection, cross-thread collection, message-link traversal,
category-wide authorization, or staff exceptions.

### 4.2 Summary source contract

An accepted invocation summarizes only the channel or thread in which
the command was invoked.

Collection must:

- preserve chronological ordering and Discord author attribution;
- include only eligible human-authored messages from the same authorized
  source space;
- exclude bot messages, system messages, unavailable or deleted messages,
  and material excluded by channel policy;
- apply simple mechanical filtering rather than an opaque pre-summary
  relevance judgment;
- select the most recent eligible window ending at invocation, subject
  to both caps below; and
- disclose that coverage was bounded when older otherwise eligible
  material was excluded by a cap.

Pilot source limits:

| Limit | Value |
| --- | ---: |
| Maximum eligible source messages | 250 |
| Maximum total source characters | 150,000 |
| Minimum eligible human messages | 8 |

The collector stops when either maximum cap is reached. A request with
fewer than the minimum eligible messages is refused rather than sent to
the model.

### 4.3 Retention and visibility

For the initial pilot:

- Source-message text and derived prompt material exist only in process
  memory for the accepted job.
- Arbiter discards source-message text when the job completes, fails, or
  is cancelled.
- Arbiter does not persist raw source messages, source excerpts, author
  profiles, member dossiers, durable summaries, precedents, embeddings,
  or reusable model context.
- The completed summary is posted only in the same approved channel or
  thread from which it was invoked.
- The posted Discord message remains governed by Discord and the source
  channel's ordinary retention and moderation practices.
- Staff notes are never collected, retrieved, or included in the summary
  prompt.

### 4.4 Staff boundary

`Arbiter Staff` is the v1 role for later configuration and sensitive
operations, including approved-channel configuration, public-feature
enablement, quota adjustment, temporary disablement, approved-reference
management, and operational visibility.

The role does not create a pilot exception for staff/private channels,
does not authorize staff-note use in summaries, and does not permit
private cross-channel source collection.

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
- Questions, evidence gaps, or logical disagreements still requiring
  resolution.
```

The result is a record, not a verdict. Arbiter may describe a claim as
unsupported, unclear, internally inconsistent, or unanswered only when
that description is grounded in the selected source material. It must not
state that a participant won.

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

Stable user-facing outcomes:

| Condition | Response intent |
| --- | --- |
| Unapproved space | State that summaries are not enabled in that channel |
| Insufficient eligible material | State that there is not enough eligible discussion for a useful summary |
| Active job | State that a summary is already in progress for this discussion |
| Cooldown | State that the user should wait before requesting another summary |
| Budget exhausted | State that the server's current summary capacity is exhausted |
| Temporary failure or timeout | State that the summary could not be completed and may be retried later |

Normal user-facing responses must not reveal raw source content, provider
names, route names, credentials, stack traces, or internal policy details.

## 6. Target architecture

```text
Discord gateway
    |
    v
Arbiter Discord bot
    |
    +--> mention/reply handler (Phase 1)
    +--> slash-command handler
    |       |
    |       +--> /ping  (implemented)
    |       +--> /arbiter summarize  (Phase 3)
    |
    +--> channel policy and source collector
    +--> pilot cooldown, budget, and active-job controls
    +--> Arbiter-owned LLM adapter
              |
              v
          FreeLLMAPI gateway  (Established: separate Render account, public HTTPS)
              |
              v
          Free LLM provider routes (primary + fallback)
```

Future persistent configuration, database-backed jobs, approved
references, staff records, and durable memory remain later phase work.

### 6.1 Discord layer

Handles Gateway connection, slash-command registration, interaction
acknowledgement and defer behavior, mention/reply detection, policy
checks, source retrieval, and Discord-ready output formatting. Contains
no provider-specific model logic.

### 6.2 Application services

Own source validation, bounded collection, prompt construction,
structured-output validation, pilot protection enforcement, failure
classification, and output shaping. Testable without Discord or a live
provider.

### 6.3 Future persistence boundary

If later features demonstrate a need for durable configuration, jobs,
approved references, summaries, or sensitive staff records, PostgreSQL
with Drizzle remains the planned relational option. No database schema is
authorized solely for anticipated future needs.

### 6.4 Future tool boundary

External retrieval, public APIs, web research, and MCP tools are outside
the current scope. A later tool requires a defined command scope,
allowlist, authorization, input/output validation, timeouts, limits,
audit visibility, and source attribution where appropriate.

## 7. Gateway and model policy

FreeLLMAPI is the selected gateway. Arbiter accesses it only through the
Arbiter-owned adapter built on the official OpenAI JavaScript/TypeScript
SDK. Provider-specific details remain outside command and summary workflow.

Current deployment/logistics facts:

- FreeLLMAPI runs in its own Render free account.
- Arbiter's Render-free deployment path uses the gateway's public HTTPS
  `/v1` endpoint, not a private Render network address.
- FreeLLMAPI persistence recovery has been tested successfully using an
  authenticated Cloudflare Worker and private Cloudflare R2 bucket.
- The gateway's unified API key and Groq provider configuration survived
  the restart/restore test.

Before any public AI rollout:

- Evaluate one primary and one fallback route against the 50-fixture
  corpus.
- Primary route requires ≥ 85/100 overall, ≥ 4.0/5 on grounded
  reasoning, instruction fidelity, and uncertainty/anti-fabrication, and
  ≥ 3.5/5 on persona fidelity.
- Fallback route requires ≥ 78/100 and the same critical floors; use an
  independent provider where practical.
- If no candidate qualifies, public AI rollout does not proceed.

The private conversation pilot (Phase 1) may not proceed to a live model
call until timeout, malformed-output, and failure-mode tests pass.
No credentials belong in Git, logs, issues, pull requests, or
documentation examples.

## 8. Implementation sequence

### Phase 0 — Product, privacy, and pilot contract ✓ Complete

Policy decisions for the summary pilot are complete and recorded in this
document.

### Phase 1 — Working mention/reply conversation (in progress)

**Goal:** Make a direct Discord conversation with Arbiter work
end-to-end in the private test guild, with the legacy persona intact and
verified.

Remaining deliverables:

- Persona exact-match acceptance test (Vitest, comparing runtime system
  prompt string to the canonical legacy text).
- Vitest, Biome, Zod, and a read-only CI workflow committed.
- Configuration-schema validation with Zod on startup.
- Arbiter-side Render environment configured with live `AI_BASE_URL`,
  `AI_API_KEY`, and `AI_MODEL` values.
- Successful first end-to-end mention/reply response in the private test
  guild with the real AI provider.
- Context bounding and channel authorization for conversation requests.
- Tests: persona fidelity, mention detection, reply-to-bot detection,
  channel allow-listing, provider timeout, malformed output, and fallback
  route.

**Exit criterion:** Arbiter responds to a direct mention in the private
test guild with correct identity and persona; persona exact-match test
passes; failure modes are handled cleanly.

### Phase 2 — Private model-route proof

**Goal:** Validate primary and fallback routes against the evaluation
corpus before any pilot use.

Deliverables:

- 50-fixture evaluation corpus assembled (35 synthetic + 15 authorized
  excerpts).
- Primary and fallback routes selected and scored.
- Operational metadata tested; raw content and credentials absent from
  logs.

**Exit criterion:** A repeatable internal request succeeds; failure is
classified and handled; both routes pass their score floors.

### Phase 3 — Summary-only private pilot

**Goal:** Implement `/arbiter summarize` in explicitly approved private
test spaces.

Deliverables:

- Message Content intent enabled for the private pilot.
- Default-deny channel-policy evaluation.
- Same-space bounded collection, mechanical filtering, chronological
  ordering, author attribution, and coverage disclosure.
- In-memory source lifecycle with no durable persistence.
- Fixed neutral summary prompt and structured-output validation.
- Pilot protection enforcement and Discord-safe defer/reply handling.
- Full pilot test suite (denied spaces, thread inheritance, source
  isolation, caps, threshold refusal, job lock, staff-note exclusion,
  no raw-source persistence).
- Manual evaluation using representative, non-sensitive discussions.

**Exit criterion:** Summaries are useful, neutral, accurate to bounded
input, non-persistent on the Arbiter side, and safe under refusal and
failure conditions.

### Phase 4 — Guarded public rollout

**Goal:** Decide whether to enable proven features for members in
explicitly approved production channels.

Deliverables:

- Review of pilot quality, cost, latency, failures, and misuse patterns.
- Final public cooldown, budget, threshold, and capacity values.
- `Arbiter Staff` operational controls and a concise public privacy/
  retention notice.
- Monitoring for errors, latency, quota use, fallback, and misuse.
- Incident, pause, and rollback procedure.

**Exit criterion:** Features meet agreed reliability, privacy, and
quality expectations and can be paused safely.

### Phase 5 — Deliberate expansion

After stable public use, consider one capability at a time:

1. Passive contradiction and misinformation detection (legacy behavior,
   redesigned with evidence integrity and quality gates).
2. Rule and precedent lookup with explicit retention and visibility rules.
3. Argument mapping and clarification.
4. Socratic question generation and steelman assistance.
5. Staff-only debate-case or moderation-support utilities.
6. Read-only external research, public API, or MCP tools.

Every addition requires a defined user benefit, privacy/context review,
permissions, limits, tests, acceptance criteria, and an explicit decision.

## 9. Deferred work

- Passive autonomous participation in ordinary chat (Phase 5 candidate).
- Contradiction and misinformation detection (Phase 5 candidate,
  requires separate redesign; see legacy audit for defects to address).
- Member dossiers, psychological profiles, or observed-style profiling.
- Durable raw-message retention.
- Durable summary/precedent storage or automatic reuse as AI context.
- Database schema, migrations, backups, or a queue system without a
  demonstrated persistence need.
- Public multi-model selection or multiple production gateways.
- Redis, BullMQ, or multi-worker queue infrastructure.
- Autonomous agent behavior or publicly prompted MCP execution.
- Unrestricted scraping or live-web research.
- Automatic staff-note inclusion in any model prompt.
- AI punishments or autonomous moderation/staff actions.
- Vector/semantic databases before a demonstrated relational limitation.
- Legacy feature parity as a requirement (legacy behavior as a reference
  only).
- Public open-source release before readiness review.

## 10. Repository and security baseline

- Protect `master` with an active ruleset requiring pull requests,
  resolved conversations, linear history, and blocked deletions/force
  pushes.
- Use zero required approvals while there is one maintainer; require CI
  checks after the test workflow exists.
- Enable Issues and Projects; keep Wiki and Discussions off initially.
- Allow only GitHub-owned and verified-creator Actions; default
  workflow-token permission is read-only contents.
- Enable dependency graph, automatic dependency submission, Dependabot
  alerts/security updates, secret scanning, push protection, and private
  vulnerability reporting where available.
- Keep webhooks, deploy keys, Pages, Codespaces, environments, and
  autonomous repository-level Copilot workflows unconfigured until there
  is a reviewed need.
- Create `development` and `production` environments only when deployment
  automation starts. Scope secrets to environments and require manual
  approval for production deployment from `master`.

## 11. Open decisions

| Decision | Why it remains open | Resolve by |
| --- | --- | --- |
| Arbiter free-tier uptime reliability | UptimeRobot-assisted keep-awake behavior is the deployment plan, but long-run practical reliability is still unproven. | During Phase 1 pilot hosting |
| Primary/fallback provider and model | Named routes require private evaluation against the corpus. | Phase 2 |
| Public rollout limits | Pilot values require quality, cost, latency, and misuse evidence before production adoption. | Phase 4 |
| Public data/privacy notice | Must match the final production retention and channel policy. | Before Phase 4 |
| Durable storage need | Deferred unless a proven feature requires persistent state. | On demonstrated need |
| Future member-dossier policy | Requires a separate use case, provenance, retention, correction/deletion controls, and privacy review. | Only if proposed after stable v1 |

## 12. Primary references

- [Discord Developer Documentation](https://docs.discord.com/developers/intro)
- [Discord Gateway intents](https://docs.discord.com/developers/gateway/you-might-not-need-a-privileged-intent)
- [Discord interactions and commands](https://docs.discord.com/developers/interactions/overview)
- [Discord API rate limits](https://docs.discord.com/developers/topics/rate-limits)
- [Discord Gateway](https://docs.discord.com/developers/events/gateway)
- [FreeLLMAPI](https://github.com/tashfeenahmed/freellmapi)
- [Render free-tier documentation](https://render.com/docs/free)
- [Render web services](https://render.com/docs/web-services)
- [Cloudflare R2 documentation](https://developers.cloudflare.com/r2/)
- [Cloudflare Workers documentation](https://developers.cloudflare.com/workers/)
- [UptimeRobot](https://uptimerobot.com/)
- [PostgreSQL documentation](https://www.postgresql.org/docs/)
- [Drizzle ORM migrations](https://orm.drizzle.team/docs/migrations)
