# Feature Specification: Dev/Test Environment — Local Database, E2E Suites (Broadcast + Sync), Documented Run

**Feature Branch**: `005-dev-test-environment`

**Created**: 2026-09-30

**Status**: Draft (revised 2026-10-01, see Clarifications — sync coverage added same day)

**Input**: User description: "Dev/test environment: one-command stack, fixtures, broadcast dry-run, smoke checks. Why: There is no documented path from a fresh clone to 'the bot did its job'. Exercising the broadcast pipeline today means hand-assembling Postgres + .env + a Discord token + real subscriptions, then clicking /sync and /broadcast in a live guild. Regressions in that pipeline — the product's core value — are only discovered in production. The broadcast-stale-subscriptions bug (.specify/bugs/) was diagnosed from a pasted production log because there was no local way to reproduce a broadcast run."

## Clarifications

### Session 2026-10-01 (scope revision — supersedes conflicting answers below)

- Q: The first implementation built a custom developer harness in `src/dev/`
  (`dev:up` / `dev:seed` / `dev:dry-run` / `dev:verify` scripts, exit-code
  layers, a JSON verdict runner). Keep it? → **A: No.** Rejected as
  over-engineered. Verification is a standard Nest/Vitest **e2e suite**; the
  local environment is the compose database plus documented commands. No
  `src/dev`, no custom check runner, no fixture framework in the application.
- Q: Dry-run as a production capability (old FR-009…FR-012)? → **A: Dropped.**
  Delivery is verified by mocking the Discord boundary inside the test —
  production keeps exactly one delivery path (`BroadcastService.send`), with
  no `preview()` API and no dry-run mode.
- Q: Startup enforcement refusing a non-loopback database or missing scoping
  (old US2 / FR-004 / FR-005)? → **A: Dropped to documentation.** The
  pre-existing guild scoping (`NODE_ENV=development` + `TEST_GUILD_ID` in
  `bot.module.ts`) remains the mechanism; `.env.example` and the README say
  how to use it. No new guard code.
- Q: A local `SCHEDULE_ENABLED` cron guard (old FR-017)? → **A: Dropped.**
  The pre-existing `BROADCAST_ENABLED` kill switch remains the only switch;
  a quiet local run sets it to `false`.
- Q: HTTP mocking (MSW) for the storefront APIs? → **A: Not needed — for the
  broadcast suite.** (Session 2026-09-30: never call platform APIs.) The
  broadcast pipeline reads the catalog from the database, so Xbox/Epic are
  never in its path.
- Q: (Later, 2026-10-01) Extend the suite to the sync pipeline — and how? →
  **A: Yes, same line of thought.** The sync path (`fetch → map → persist`)
  is covered end to end against the real database, with storefront HTTP
  mocked at the **transport** layer via MSW (axios intercepted in-process,
  `onUnhandledRequest: 'error'` enforcing offline). Only what is outside the
  process is faked — the Discord `Client` and the storefront wire — while the
  Epic/Xbox API adapters, mappers, and repositories run for real. This
  supersedes the "not needed" answer above, which was scoped to broadcast.
- Q: Keep the compose `app` service and the commented MySQL template? →
  **A: No.** The bot is never run from compose — it ships as an image and the
  release chain hands it to Coolify; compose exists only for the local
  database. Both were removed (2026-10-01).

### Session 2026-09-30 (still in force where not superseded)

- Q: Should any part of the local environment or its scripted checks call the
  real Xbox and Epic services? → A: Never — fixtures are injected locally;
  verification is offline with respect to Xbox/Epic.
- Q: Does the seeding step use the typeorm-fixtures library? → A: No —
  hand-written deterministic fixtures; faker-driven random data conflicts
  with the fixed-baseline requirement.
- Q: Does the check suite need built-in fault-injection mode? → A: One-time
  acceptance activity — introduce a fault by hand, observe the failure,
  revert; no shipped fault-injection feature.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Local database in one command (Priority: P1)

A contributor starts the local PostgreSQL with one documented command and it
matches production: the same major version, ready before anything connects,
never exposed beyond the local machine, and durable across restarts. Schema
preparation and migrations are automatic — no manual database assembly.

**Why this priority**: Every other capability (the e2e suite, running the bot
locally) presupposes a database. This is the foundation the rest stands on.

**Independent Test**: On a machine with Docker, run the documented database
command once from a fresh clone; verify a client can connect on loopback,
the server version matches production's major, and the e2e suite passes
against it.

**Acceptance Scenarios**:

1. **Given** a fresh clone with a container runtime, **When** the developer
   runs the documented database command, **Then** a healthy PostgreSQL is
   available on loopback with no further setup.
2. **Given** the database container was created by an older checkout, **When**
   the e2e suite or the app starts, **Then** the schema and all pending
   migrations are applied automatically.
3. **Given** the local database, **When** the developer inspects the published
   port, **Then** it listens on loopback only, never on the network.

---

### User Story 2 - Broadcast pipeline regression suite (Priority: P2)

A developer (or CI) runs one command and the whole broadcast contract is
exercised against a real database: candidates selected, targets resolved,
delivery attempted — without a bot token, without Discord, and without any
message ever posted. The stale-subscription production bug exists as an
executable regression test.

**Why this priority**: This is the payoff — the pipeline's core value is
protected by tests that reproduce the original production scenario locally.

**Independent Test**: Run the suite against a healthy database (expect pass);
remove the stale-guild skip from the pipeline by hand (expect the regression
test to fail); restore it and re-run (expect pass again), five times in a row.

**Acceptance Scenarios**:

1. **Given** a pending catalog entry and an active subscription, **When** the
   suite runs, **Then** exactly one delivery is made through the mocked
   Discord boundary and the entry is marked announced.
2. **Given** a subscription whose guild the bot has left, **When** the suite
   runs, **Then** that target is skipped before any channel fetch, and
   delivery to the active subscriber still succeeds.
3. **Given** Discord delivery fails, **When** the suite runs, **Then** the
   entry remains un-announced (delivery first, durable state second).
4. **Given** an already-announced entry, **When** the suite runs, **Then**
   nothing is fetched and nothing is sent.
5. **Given** any database-backed environment, **When** the suite is run five
   consecutive times, **Then** all five runs yield the same result with no
   manual cleanup between them.

---

### User Story 3 - Documented local run (Priority: P3)

A developer who wants to run the actual bot locally follows the README:
database up, `.env` prepared from the template, one schema step, watch mode.
The documentation states how registration stays scoped to the designated test
guild and how to keep a local run quiet.

**Why this priority**: Running the real bot is a manual, optional activity —
the automated suite (story 2) is the gate — but the path must be written down
so nobody has to reconstruct it from the code.

**Independent Test**: Follow the README verbatim from a fresh clone; verify
the documented commands are complete and that the scoping/quiet-run guidance
is present.

**Acceptance Scenarios**:

1. **Given** the README, **When** a developer follows it from a fresh clone,
   **Then** every prerequisite, secret, and command is named in order.
2. **Given** `NODE_ENV=development` and `TEST_GUILD_ID` are configured as
   documented, **When** the bot starts, **Then** command registration is
   scoped to that guild (pre-existing Necord development mode).
3. **Given** `BROADCAST_ENABLED=false` as documented, **When** the bot runs
   locally, **Then** no scheduled announcement pass fires.

---

### User Story 4 - Sync pipeline regression suite (Priority: P4)

A developer runs the same one-command suite and the fetch side of the
pipeline is exercised against a real database too: the real Epic and Xbox API
adapters hit a mocked storefront wire, the real mappers translate, the real
repositories upsert — and nothing ever leaves the machine. The contract that
re-syncs can never resurrect an already-announced offer is executable.

**Why this priority**: it extends the payoff of story 2 to the other half of
the lifecycle; it ranks last only because it builds on top of an already
working suite and environment, not because the coverage matters less.

**Independent Test**: Run the suite offline (expect pass); change a request
URL or parameter in an adapter (expect the matching test to fail because the
request no longer matches a handler); restore it and re-run (expect pass).

**Acceptance Scenarios**:

1. **Given** a mocked Epic response with one qualifying and one
   non-qualifying offer, **When** the suite runs, **Then** exactly the
   qualifying offer is persisted with its mapped values, and the other never
   reaches the catalog.
2. **Given** an already-synced row, **When** the suite re-syncs, **Then**
   there is still exactly one row and changed fields are updated (upsert
   semantics).
3. **Given** an announced row, **When** the suite re-syncs, **Then** it
   remains announced — `saveAll` never writes the `broadcasted` flag.
4. **Given** the mocked Xbox id list, **When** the suite syncs, **Then** the
   products request carries exactly those ids with the documented parameters
   and the mapped products persist; with an empty id list, the products
   endpoint is never called.
5. **Given** a request no registered handler matches, **When** the suite
   runs, **Then** it fails instead of reaching the network.

---

### Edge Cases

- The database container is not running → the suite fails immediately with a
  connection error; it never silently skips, because a skipped suite is a
  false green.
- A developer's `.env` points at another database → exported `DATABASE_*`
  variables win (test setup fills only what is missing), and fixtures are
  `dev-`-prefixed and purged around every test, so nothing foreign is touched.
- Multiple test files initializing the database concurrently → the e2e config
  disables file parallelism so migrations cannot race.
- The schema does not exist yet (brand-new database) → the suite creates it
  before the module boots (same prerequisite as `db:init`), then migrations
  run automatically.
- Windows and Linux → identical behavior; the suite is pure Node/Vitest with
  no platform-specific steps.
- The platform APIs are unreachable → irrelevant: the suite never contacts
  them — MSW answers axios in-process, and any URL without a registered
  handler fails the test (FR-009).
- Production code accidentally grows test-only paths (a dry-run flag, a dev
  script) → prevented by FR-008 and checked by inspection (SC-005).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The repository MUST provide the local database as one
  documented compose command: image pinned to the production PostgreSQL major,
  a healthcheck so `up --wait` blocks until ready, loopback-only port
  publication, a named volume, and defaults matching the test suite's
  connection defaults. The compose file MUST be database-only: the unused
  `app` service and the commented MySQL template are removed.
- **FR-002**: The e2e suite MUST run against a real PostgreSQL, booting the
  real `DatabaseModule` so the schema is created if absent and migrations run
  automatically, with deterministic connection defaults that `DATABASE_*`
  environment variables can override.
- **FR-003**: The suite MUST mock the outbound boundaries and nothing else —
  the Discord `Client`, provided in the same way production receives it (a
  global provider mirroring Necord), and the storefront HTTP transport (MSW
  answering axios in-process) — and MUST never require a bot token or make
  any network call to Discord, Epic, or Xbox.
- **FR-004**: Fixtures MUST be deterministic, prefixed so they are
  distinguishable from any other row, and purged around every test; neither
  the suite nor any fixture path may call the real Xbox or Epic services.
- **FR-005**: The suite MUST cover the broadcast contract end to end through
  the real platform and broadcast services: delivery to an active subscriber
  with the announced flag set; a departed guild's subscription skipped before
  any channel fetch while delivery to the active subscriber still succeeds;
  failed delivery leaving the entry pending; already-announced entries
  untouched.
- **FR-006**: CI MUST run the e2e suite against an ephemeral PostgreSQL
  service pinned to the same major version, as part of the unchanged
  six-step gate (prettier → type:check → lint → build → test:cov →
  test:e2e), with lint at zero errors.
- **FR-007**: Project documentation MUST describe: starting the local
  database, running the e2e suite (prerequisites, connection defaults,
  override), and running the bot locally — including the scoping mechanism
  (`NODE_ENV=development` + `TEST_GUILD_ID`) and the quiet-run switch
  (`BROADCAST_ENABLED=false`).
- **FR-008**: Production code MUST NOT gain test-only execution paths: no
  dry-run/preview API, no development scripts under `src/`, no new startup or
  scheduler guards beyond the pre-existing switches, and no test support in
  the compiled `dist/`.
- **FR-009**: The suite MUST cover the sync pipeline end to end through the
  real API adapters, mappers, and repositories against the real database,
  with storefront HTTP mocked at the transport layer: qualifying offers
  persisted with mapped values while non-qualifying ones are dropped;
  re-sync idempotent (one row, changed fields updated); an announced row
  still announced after re-sync; the Xbox two-call flow (id list forwarded
  to the products request, parameters and body pinned) and its empty-id
  short-circuit. Any request no registered handler matches MUST fail the
  test rather than reach the network.

### Key Entities *(include if feature involves data)*

- **Local database**: the compose-managed PostgreSQL — same major as
  production, loopback-only, durable named volume.
- **Fixture set (test-only)**: deterministic rows created around each test —
  an active guild and a departed (`deleted`) guild, one subscription each,
  and a pending catalog entry inside its offer window — plus HTTP response
  bodies shaped like the real storefront payloads; all row ids prefixed
  `dev-`, rows removed after the test.
- **Broadcast contract**: the four behaviors FR-005 enumerates; the suite is
  their executable definition.
- **Sync contract**: the behaviors FR-009 enumerates — the fetch → map →
  persist half of the lifecycle, likewise executable.
- **Discord boundary**: the `Client` seam production injects from Necord and
  tests replace with a recording fake.
- **Storefront boundary**: the axios HTTP transport the API adapters use;
  MSW replaces it with recorded fixture responses.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: From a fresh clone on a machine with Docker and Node, `docker
  compose up -d database && npm run test:e2e` reaches a green suite in under
  10 minutes, with no bot token and no network access to Discord.
- **SC-002**: Removing the stale-guild skip from the broadcast pipeline makes
  the suite fail in 100% of runs; restoring it makes it pass again. Performed
  once by hand during acceptance (no shipped fault-injection mode).
- **SC-003**: Five consecutive suite runs on the same database all pass with
  no manual cleanup between them.
- **SC-004**: Every pull request runs the suite in CI against an ephemeral
  PostgreSQL; the six-step gate is green with lint at zero errors.
- **SC-005**: Zero test-only code paths exist in production sources — no
  `src/dev`, no `preview()` API, no dev scripts in `package.json`.
- **SC-006**: Following the README verbatim from a fresh clone reproduces a
  green suite with no undocumented step.
- **SC-007**: The suite performs zero network requests — any URL without a
  registered MSW handler fails it — and a re-sync of an already-announced
  entry leaves it announced (the executable pin of `saveAll` never writing
  `broadcasted`).

## Assumptions

- A container runtime (Docker with Compose v2) is available on the developer
  machine for the default database; any reachable PostgreSQL of the same major
  can substitute via exported `DATABASE_*` variables.
- CI provides PostgreSQL as a workflow service container (FR-006); no
  third-party test infrastructure is required.
- Testing the guild-scoped command registration and slash-command visibility
  against the live Discord API remains a manual, out-of-band activity — the
  suite's boundary mock makes that unnecessary for pipeline verification.
- Fault injection for SC-002 is a one-time acceptance activity performed by
  hand, not a shipped capability.
- If the suite exposes a broadcast pipeline defect (as the
  stale-subscriptions bug did), fixing that defect is out of scope here: the
  test fails, and the defect is filed as a bug.
