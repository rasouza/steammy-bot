> **Status: historical.** These notes record the research for the original harness-based design (src/dev scripts, dry-run API), which was superseded by the e2e-suite redesign on 2026-10-01 (see spec.md Clarifications). Kept for context; do not treat as current design guidance.
# Phase 0 Research: Dev/Test Environment (005-dev-test-environment)

**Date**: 2026-09-30 | **Spec**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md)

Every decision below resolves an unknown from the plan's Technical Context. No
`NEEDS CLARIFICATION` markers remain. Constitution = `.specify/memory/constitution.md`
v3.1.1.

---

## R1 — Shape of the "one command" stack

**Decision**: `npm run dev:up` runs a TypeScript orchestrator (`src/dev/stack.ts`
via `tsx`) that executes, in order: (1) env/scoping guard, (2) `docker compose
up -d --wait database` (explicit service target), (3) `npm run db:init`, (4)
`npm run migration:run`, (5) spawns `npm run start:dev` as a foreground child,
injecting dev-owned environment variables into the child's `process.env`.

**Rationale**: satisfies FR-001/FR-002 (single documented command, schema +
migrations applied before commands are handled) and FR-003 (guard fails fast
naming every missing item before anything starts). Running as Node (not bash)
honors the Windows + Linux constraint (spec Edge Cases); process-env injection
gives the child a guaranteed environment regardless of `.env` contents, because
`dotenv`/`@nestjs/config` never override variables already present in
`process.env`.

**Alternatives considered**:
- *Makefile / bash script* — rejected: Windows has no reliable make/bash baseline;
  the repo's bash requirement applies only to speckit scripts.
- *Compose profiles running the bot in a container too* — rejected: watch-mode
  iteration on the host is the documented dev loop (`npm run start:dev`), a dev
  Dockerfile target would be a second build path, and hot reload through a
  bind-mounted container adds Windows file-watching problems for no gain.
- *`npm-run-all`-style chained npm scripts* — rejected: no cross-step state
  (guard results, health waits, exit-code mapping), and it adds a dependency.

## R2 — Compose strategy: edit the existing `docker-compose.yml`

**Decision**: edit `docker-compose.yml` directly — the maintainer confirms it
is used nowhere ("we don't need a docker-compose.dev.yml; anything that is
needed can be edited in the docker-compose.yml file"; the feature request
likewise states the file is unused and may be altered as much as we want). Its
`database` service is reworked for development (healthcheck, pinned major,
named volume, loopback-only port, dev-default credentials — R3), while the
`app` service section is left as-is. `dev:up`/`dev:down` always name the
service explicitly (`docker compose up -d --wait database`) so the `app`
service (published prod image) is never started by the dev flow.

**Rationale**: one compose file, no second file to drift or forget — and the
file being genuinely unused makes editing it safe by the maintainer's own
statement. Explicit service targeting keeps the dev flow deterministic and
means the retained `app` section continues to document how the published image
is run, keeping the AGENTS.md/constitution deployment descriptions accurate
without changing any deploy workflow.

**Alternatives considered**:
- *Additive `docker-compose.dev.yml`* — rejected by explicit maintainer
  direction: the existing file is the one to edit; two compose definitions for
  one repo is exactly the drift this feature fights.
- *Host-installed Postgres* — rejected: defeats "fresh clone → running" (no
  install steps, deterministic version, portable data via named volume).
- *Deleting the unused `app` service while editing* — rejected: not needed by
  the dev flow (explicit service target) and its removal would falsify
  existing AGENTS/constitution statements about compose-based variable
  injection for the published image.

## R3 — Database container details

**Decision**: pin an explicit PostgreSQL major in the `database` service of
`docker-compose.yml` (implementation verifies the production server's version
with `SELECT version()` and matches that major); `pg_isready`-style healthcheck
with `--wait` so `db:init` never races an uninitialized server; named volume
keeps data across restarts; local-only credentials as compose variable
defaults (`${DATABASE_NAME:-steammy_dev}` etc.) so a fresh clone needs no
database entries in `.env`.

**Rationale**: unpinned `postgres` (as production uses) can jump a major under
us and make migrations behave differently locally than in prod — precisely the
class of "works locally, breaks in prod" drift this feature fights. Hardcoded
local credentials are not committed secrets (Constitution: *Secrets MUST NOT be
committed* refers to `.env`-style credentials); they are throwaway container
defaults, equivalent to the official image's sample values.

**Alternatives considered**:
- *Keep the `./data` bind mount as-is* — rejected: a bind mount of raw
  Postgres data owned by whichever major ran first invites permission and
  version-lock accidents; named volumes are the supported pattern (editing the
  `database` service is explicitly in scope).
- *Ephemeral volume (no persistence)* — rejected: `dev:down`/`up` cycles would
  force re-migration every time and slow the < 15 min path (SC-003).

## R4 — Isolation enforcement points (FR-003/FR-004/FR-005)

**Decision**: one pure, unit-testable guard (`src/dev/env-guard.ts`) evaluated
before anything starts, plus environment ownership by the orchestrator:

1. **Secrets**: `BOT_TOKEN`, `TEST_GUILD_ID`, `TEST_CHANNEL_ID` must be present
   (from `.env`/process) → otherwise exit 2 listing *every* missing item
   (FR-003).
2. **Scoping**: the flow sets `NODE_ENV=development` itself and refuses to
   proceed if `TEST_GUILD_ID` is absent → the existing Necord
   `development: [testGuildId]` registration path (bot.module.ts) is the only
   one reachable (FR-004).
3. **Database ownership**: `DATABASE_HOST/PORT/NAME/USER/PASSWORD` for the whole
   process tree are *set by the orchestrator* to the compose service's loopback
   address — children inherit them and `.env` cannot override
   (`dotenv`/`ConfigModule` never clobber existing `process.env`). If `.env` or
   the ambient environment nonetheless specifies a non-loopback `DATABASE_HOST`,
   the guard **refuses with exit 2 naming the setting** instead of silently
   overriding (FR-005's "refused with a message naming the conflicting setting").

**Rationale**: enforcement lives in the only entry point the docs will ever tell
people to use; a developer who bypasses it (`npm run start:dev` directly) still
cannot target production accidentally because nothing in that path points at
production either — but the documented path guarantees it (spec US2).

**Alternatives considered**:
- *Validation inside `envSchema` at app boot* — rejected as the *sole* mechanism:
  the app boot path is shared with production, where `TEST_CHANNEL_ID` and
  loopback-only hosts are legitimately absent/different; scoping is a property
  of the dev entry point, not of the application.
- *Silently overriding a conflicting `DATABASE_HOST`* — rejected: spec FR-005
  explicitly demands refusal with the conflicting setting named.

## R5 — Disabling scheduled passes locally (FR-017, clarification Q2)

**Decision**: add `SCHEDULE_ENABLED` to `envSchema`
(`booleanish('true')` — unset behaves as `true`) and guard **both**
`PlatformScheduler` crons (`syncAll`, `broadcastAll`) with an early return +
log line when it is `false`. The dev orchestrator always sets
`SCHEDULE_ENABLED=false` for the bot process. `BROADCAST_ENABLED` keeps its
exact current meaning (wholesale kill switch for the announce pass).

**Rationale**: FR-017 requires no background pass can consume fixture state;
disabling *both* crons is required for determinism — the hourly `syncAll` would
call real Xbox/Epic APIs from a dev machine (violating the spirit of
clarification Q1) and inject real pending rows, changing candidate counts
between check runs (breaking SC-007/SC-008). Default `true` mirrors the
`BROADCAST_ENABLED` research R4 reasoning already documented in the schema: a
missing variable must never mute production. The flag is separate from
`BROADCAST_ENABLED` so the kill switch stays a kill switch (spec FR-012
preserved) and on-demand `/sync` + `/broadcast` remain usable manually.

**Alternatives considered**:
- *Reuse `BROADCAST_ENABLED=false` for dev* — rejected: it does not stop
  `syncAll`, and it would make local runs unable to exercise the real
  on-demand broadcast pass without flipping the kill switch mid-session.
- *Gate on `NODE_ENV === 'development'`* — rejected: hidden coupling of
  scheduling to an environment name; an explicit default-on flag is
  unit-testable and self-documents in `.env.example`.
- *Unregister crons conditionally via ScheduleModule options* — rejected:
  coarser than an in-method guard, and the guard is trivially spec-testable in
  the existing `platform.scheduler.spec.ts` style.

## R6 — Fixture strategy (FR-006/FR-007/FR-008)

**Decision**: fixtures are deterministic rows in the four **existing** tables,
defined as pure data in `src/dev/fixtures.ts` and applied by upsert:

- `guild` row for `TEST_GUILD_ID` (`deleted = false`, `prefix = null`).
- Stale guild row with a fixed synthetic id
  (`dev-stale-guild`, `deleted = true`) + one `subscription` pointing at it
  (FR-008).
- `subscription` rows `(TEST_CHANNEL_ID, platform, TEST_GUILD_ID)` for **every**
  platform in the central `gameSources` list — enumerated from
  `gameSourceNames`/`gameSources`, never hardcoded (Constitution I).
- `catalog_xbox` fixture rows: fixed ids `dev-fixture-xbox-*`,
  `broadcasted = false`.
- `catalog_epic` fixture rows: fixed ids `dev-fixture-epic-*`,
  `broadcasted = false`, and `offer_start_at ≤ now ≤ offer_end_at`
  (computed relative to seed time) so `epicPendingCriteria` accepts them.

Idempotency = upsert by primary key + **reset `broadcasted = false` on fixture
ids** on every run: re-seeding after a real broadcast restores the baseline
(FR-007), row counts are stable (US3.2), and no row is ever duplicated (the
tables' primary keys make duplicates impossible by construction).

**Rationale**: primary-key upserts give idempotency for free; resetting only
*fixture* ids leaves any real catalog rows a developer synced manually untouched.
Epic's time-window eligibility is the one platform-specific rule fixtures must
satisfy — read from the platform's own pending criteria, not reconstructed
(generic code must never reconstruct eligibility).

**Alternatives considered**:
- *`TRUNCATE` + reload* — rejected: destroys real rows a developer synced and
  breaks the "seed twice ⇒ identical counts, nothing lost" expectation.
- *SQL seed files* — rejected: bypass entity types, drift from schema changes,
  and are untestable by the colocated unit-spec pattern.
- *Sync from real APIs as "seed"* — rejected by clarification Q1 (answer A).

## R7 — Guild/channel validation at seed time (US3.3)

**Decision**: `dev:seed` validates *reality* through the Discord **REST** API
with the bot token before writing anything: `GET /guilds/{TEST_GUILD_ID}` (bot
must be a member) and `GET /channels/{TEST_CHANNEL_ID}` (must exist and be a
text channel in that guild). Mismatch → exit 3 naming the exact mismatch,
writing no rows.

**Rationale**: satisfies US3.3 ("fails naming the mismatch instead of writing
unusable state") without a gateway connection; cheap (two REST calls) and
runnable while the watch process holds the gateway.

**Alternatives considered**:
- *Validate only after the broadcast attempt* — rejected: writes unusable state
  first, exactly what the spec forbids.
- *Full gateway login to "really" verify* — rejected: a second gateway session
  on the same bot token destabilizes the running watch process (see R9); REST
  answers both questions authoritatively.

## R8 — Dry-run trigger surface (FR-009)

**Decision**: dry-run is triggered from the dev CLI (`npm run dev:dry-run`, and
programmatally inside `dev:verify`). The `/broadcast` slash command is left
unchanged.

**Rationale**: the scripted checks need a programmatic trigger with a machine
report; a slash command replies inside Discord (2000-char limits, ephemeral
report truncation, requires a human clicking — forbidden by SC-004). One
trigger surface keeps the scope tight; an interactive slash option can be added
later without rework because the underlying `preview()` seam is trigger-agnostic.

**Alternatives considered**:
- *`/broadcast dry-run:true` option* — rejected for v1: cannot serve the checks,
  and its report would be truncated by Discord message limits.
- *Env-var mode on the running bot (`DRY_RUN=true`)* — rejected: requires
  restarting the watch process per mode flip and still needs an external
  trigger for the check to know when a run finished.

## R9 — Dry-run execution context (no second gateway session)

**Decision**: `dev:dry-run` / `dev:verify` bootstrap a **gateway-less Nest
application context**: `NestFactory.createApplicationContext` over a small
`DevBroadcastModule` = `ConfigModule` + `TypeOrmModule` (shared
`buildDataSourceOptions`) + `BroadcastModule` + `platformProviders` +
`platformRegistryProvider` (reused verbatim from `platform.registry.ts`) + a
`Client` provided by `src/dev/dev-client.provider.ts`: `new Client({ intents: [] })`
with the token applied to `client.rest` — **never `client.login()`**. All
Discord interaction (`channels.fetch`, message create/delete) flows over REST.

**Rationale**: reusing the exported provider arrays means the dry-run builds the
*identical* `GenericPlatform`/`BroadcastService` graph the bot uses — the spec's
US4.5 "same selection path, not a parallel simulator" holds by construction, and
no platform registry drift is possible (Constitution I). Two open questions were
resolved here:

- *Can two processes share one bot token's gateway?* No, safely: a second
  gateway `Identify` with the same token destabilizes the running session
  (invalid-session flapping). The watch process keeps the gateway; tooling
  stays on REST.
- *Does `channels.fetch`/`send` work without `login()`?* Yes — discord.js
  delegates channel fetch, message create, and message delete to its REST
  instance; the gateway is only needed for events and slash commands. Verified
  against discord.js 14 behavior; the quickstart's first dry-run is the
  executable proof.

**Alternatives considered**:
- *Boot the full `AppModule`* — rejected: pulls in Necord → gateway login →
  conflict with the watch process, plus scheduler/cron side effects.
- *Direct construction (spec style: `new GenericPlatform(...)` in the script)* —
  rejected: re-implements composition and can drift from the real wiring.
- *Stop the watch process during checks* — rejected: breaks the documented dev
  loop and still needs a gateway for nothing (checks are REST-only).
- *Raw `@discordjs/rest` client* — rejected: `BroadcastService` takes a
  discord.js `Client`; providing the real class keeps production code untouched.

## R10 — The `preview()` seam (FR-009/FR-010/FR-011)

**Decision**: extend the generic lifecycle with one method, platform-agnostic:

- `platform.types.ts`: `DryRunTargetDecision` (`deliver` | `skip` + reason +
  channel/guild ids), `DryRunGameReport` (game + decisions + counts),
  `DryRunReport` (platform → game reports); `PlatformRuntime.preview(): Promise<DryRunReport>`.
- `BroadcastService`: extract the existing target-resolution block
  (load subscriptions with `guild` relation → stale-guild skip → channel fetch)
  into a shared private step; `send()` keeps current behavior byte-for-byte,
  new `preview(message, game, platform)` reuses the step and records decisions
  — for `deliver` it validates the channel shape via the same fetch but **never
  calls `channel.send`**; a fetch failure records `skip` with the error reason.
- `GenericPlatform.preview()`: `findPending(new Date())` → per game
  `broadcast.preview(...)` → collect; **no `markBroadcasted` anywhere** (Constitution
  II), and unlike `broadcastPending` it does not swallow-and-warn — the report
  *is* the output.

**Rationale**: selection (`findPending`), eligibility (platform criteria), and
target resolution are literally the same code as production (US4.5); skipping
`deliver` targets' `send` makes FR-009/FR-011 structural, not a convention. A
`deliver` decision in dry-run means "would post", verified truthfully by
fetching the channel (so dead channels surface as `skip` with reason — the
production-bug class the spec cites).

**Alternatives considered**:
- *Dry-run by intercepting logs of a real run* — rejected: a real run posts.
- *Parallel "simulator" selection in the dev tooling* — rejected: drifts from
  production (US4.5 explicitly forbids it).
- *Dry-run flag threaded through `broadcastPending()`* — rejected: mixes
  report-building into the mark/no-mark decision path where Constitution II is
  enforced; a sibling method keeps that path untouched and testable.

## R11 — Check orchestration and exit codes (FR-013/FR-014, edge cases)

**Decision**: `dev:verify` runs ordered steps, each mapped to a layer:

| # | Step | Failure exit | Covers |
|---|------|--------------|--------|
| 1 | Env/scoping guard (same as `dev:up`) | 2 | FR-003/004/005 |
| 2 | Database reachable + **no pending migrations** (TypeORM `showMigrations()`-style check) | 3 | FR-013 schema currency |
| 3 | Seed (idempotent reset + Discord REST guild/channel validation) | 3 | FR-006/007, US3.3 |
| 4 | `SCHEDULE_ENABLED` asserted `false` in the run environment | 2 | FR-017 |
| 5 | Dry-run all platforms; assert: ≥1 candidate per platform, ≥1 `deliver` decision, stale subscription present as `skip` with "no longer served" reason, report complete (SC-005) | 1 | US5.1/5.2, US3.4, FR-010 |
| 6 | Assert `broadcasted` unchanged on fixture ids after step 5 | 1 | FR-011 |
| 7 | Optional `--live`: post exactly one marker message to `TEST_CHANNEL_ID` via REST, fetch it back, then delete (delete failure ⇒ warning only) | 1 | FR-015 |
| 8 | Emit human summary + JSON verdict (`check-result.schema.json`) | 0 pass / 1 / 2 / 3 | FR-013 |

Exit-code layering implements the spec edge case *"environment reported
unhealthy distinctly from a pipeline failure, so the check's failure points at
the right layer"*. Determinism (FR-014): step 3 always restores the baseline
regardless of prior consumption (SC-008); steps 5–6 read only; no step mutates
state after step 6 except the opt-in `--live` message (which deletes itself).

**Rationale**: layering beats a single `1` because a failing check must say
*which* layer broke (spec edge cases); ordered restore-then-assert is the only
order that is both deterministic and honest about pipeline behavior.

**Alternatives considered**:
- *Single boolean exit* — rejected: cannot distinguish infrastructure from
  regression; recreates the spec's "pasted production log" diagnosis problem.
- *Keeping state between runs to "save time"* — rejected: SC-007/008 demand
  identical verdicts; restore-every-time makes prior runs irrelevant.

## R12 — Fault injection (SC-007 second half)

**Decision**: no shipped fault-injection mode (clarification Q4, answer B). The
deliberate-fault half of SC-007 is a **one-time acceptance activity**: temporarily
break candidate selection (e.g., invert a fixture id in `findPending`'s path) or
the delivery-state ordering during acceptance, run `dev:verify`, observe exit 1,
revert. The check suite itself only observes.

**Rationale**: keeps the shipped tooling free of self-sabotage machinery that
could be triggered accidentally (a `--break` flag left in a wrapper script would
make every run meaningless).

**Alternatives considered**: built-in `--inject-fault` mode — rejected per
clarification Q4; dropping the SC-007 half — rejected: still verifiable by hand.

## R13 — Where the tooling lives (plan structure decision)

**Decision**: `src/dev/**`, run through `tsx` (same pattern as the TypeORM CLI
`node --import tsx`), and **excluded from `tsconfig.build.json`** so it never
ships in `dist/`/the production image.

**Rationale**: files under `src/` are automatically covered by all four relevant
gates (`prettier --check "src/**/*.ts"`, `type:check` via `tsconfig.json` include,
`oxlint src/`, `vitest` include `src/**/*.spec.ts`) with zero config changes —
Constitution IV/V satisfied by construction. `type:check` still typechecks the
tooling because it uses `tsconfig.json` (include `src/**/*`), not the build
config — mirroring how specs are typechecked but not built.

**Alternatives considered**:
- *Top-level `scripts/*.ts`* — rejected: outside every gate's glob; widening
  four configs for one feature is churn that future contributors can forget.
- *Leaving it in the build* — rejected: dev tooling in the production image is
  dead weight and an unnecessary attack/debugging surface.
- *Plain `.mjs` JavaScript* — rejected: no typecheck, no unit specs, drifts from
  the repo's TypeScript-only rule.

## R14 — Test strategy for the new code

**Decision**: colocated unit specs only (no DB, no Discord — Constitution V):

- `env-guard.spec.ts` — every refusal path (missing secrets listed together,
  non-loopback host named, unset scoping) and the happy path.
- `fixtures.spec.ts` — fixture invariants: ids unique & prefixed `dev-fixture-`,
  one subscription per platform from `gameSources`, stale subscription targets
  the stale guild, Epic window spans `now`, all catalog rows `broadcasted: false`.
- `checks.spec.ts` — assertions against synthetic `DryRunReport` objects
  (empty candidates ⇒ fail; stale skip missing ⇒ fail; complete report ⇒ pass).
- `broadcast.service.spec.ts` (extend) — `preview()` never calls `send`/`channel.send`,
  records stale-guild skip **without** fetching, records fetch failures as
  `skip` with reason, returns `deliver` for live channels.
- `generic-platform.spec.ts` (extend) — `preview()` never calls
  `markBroadcasted` and does not log the delivery-failed warning.
- `platform.scheduler.spec.ts` (extend) — both crons return early (0) when
  `SCHEDULE_ENABLED=false`, run normally when unset.
- `seed.ts`/`verify.ts`/`stack.ts` stay thin: orchestration shells whose logic
  lives in the pure modules above; `test:e2e` covers at most arg/verdict
  plumbing without I/O.

**Rationale**: matches the repo's established spec style (direct construction,
fakes local to the file) and keeps CI green without Docker/Discord in either
suite. The *integration* truth (REST-only client, compose wait, end-to-end
verdicts) is proven by `quickstart.md` scenarios, not by CI — per the spec's
assumption that checks run on demand on a developer machine.

**Alternatives considered**: e2e specs with a real Postgres — rejected: AGENTS
states e2e needs neither database nor token, and adding infra to CI expands
scope beyond the spec (CI wiring explicitly out of scope).

## R15 — Documentation surface (FR-016)

**Decision**: README § Development is rewritten around the five-command flow
(`dev:up` → `dev:seed` → `dev:verify` → optional `dev:verify --live` →
`dev:down`), listing prerequisites (Node floor matching `.nvmrc`/`engines`,
Docker, a Discord application token, a test guild + channel id) and pointing at
[quickstart.md](./quickstart.md) for the validated walkthrough;
`.env.example` gains `TEST_CHANNEL_ID`, the `SCHEDULE_ENABLED` note, and a dev
database block explaining that `dev:up` owns `DATABASE_*`.

**Rationale**: FR-016 demands the documented path reproduce a passing check with
no undocumented step; README is the first thing a fresh clone opens, quickstart
is the executable version of the same content (single source: README links, it
does not duplicate the step list).

**Alternatives considered**: a standalone `docs/dev-environment.md` — rejected:
splits the "fresh clone" story across three files; README section is where
`npm run start:dev` is already documented.
