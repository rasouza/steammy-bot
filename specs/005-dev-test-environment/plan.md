# Implementation Plan: Dev/Test Environment (revised 2026-10-01)

**Spec**: [spec.md](./spec.md) · **Tasks**: [tasks.md](./tasks.md) ·
**Quickstart**: [quickstart.md](./quickstart.md)

## Context

The first iteration of this feature built a bespoke developer harness
(`src/dev/*` with `dev:up`/`dev:seed`/`dev:dry-run`/`dev:verify` scripts, a
production `preview()` API, exit-code layers and a JSON verdict runner). It
was rejected as over-engineering (spec Clarifications 2026-10-01): the
repository already ships Nest testing utilities, Vitest, supertest and
Compose — the verification deliverable is an ordinary e2e suite, not an
execution framework. All of that harness was removed on this branch; what
remains is deliberately small.

## Structure

```
docker-compose.yml                 # one `database` service (postgres:18, 5432,
                                   # healthcheck, named volume) hosting two
                                   # logical databases: `steammy_dev` (POSTGRES_DB)
                                   # + `steammy_test` (created by db:e2e:setup);
                                   # app + mysql removed
test/
  fixtures/broadcast.fixture.ts    # fake text channel (the Discord boundary surface)
  fixtures/http/epic.fixtures.ts   # storefront responses typed against the DTOs
  fixtures/http/xbox.fixtures.ts
  factories/                       # Fishery entity factories (build() only, Epic + Xbox)
  scenarios/broadcast.scenario.ts  # createBroadcastScenario: compose business states
  helpers/testing-app.ts           # shared TestingModule + fake Client spies
  helpers/database.ts              # cleanTestDatabase: deleteAll across suite tables
  broadcast.e2e-spec.ts            # the broadcast contract (focused behaviors +
                                   # one mixed-state run, Epic + Xbox)
  sync.e2e-spec.ts                 # the sync contract (5 tests, MSW transport)
  health.e2e-spec.ts               # unchanged
vitest.config.e2e.ts               # coverage-e2e + fileParallelism: false
.github/workflows/build.yml        # postgres:18 service (5432, steammy_dev),
                                   # db:e2e:setup step, both coverage uploads
package.json                       # + msw, fishery devDependencies (test-only);
                                   # db:e2e:setup via node --env-file=.env.test
```

Test module composition — both mocked boundaries are outbound; everything the
suite verifies runs real:

```
Test.createTestingModule
├── ConfigModule.forRoot(validationSchema: envSchema)   # same validation as prod
├── DatabaseModule                                      # real PG, migrationsRun
├── PlatformsModule                                     # registry → GenericPlatform
│     └── BroadcastModule → BroadcastService            # real
└── TestDiscordModule (@Global, exports Client)         # fake: channels.fetch only

outside the module: MSW answers axios for the storefront endpoints
                              # (onUnhandledRequest: 'error' ⇒ offline)

## Key decisions

| # | Decision | Rationale |
| --- | --- | --- |
| D1 | E2e suite instead of a check runner | Verdict/exit-code/JSON machinery duplicates what a test runner already is; failures print as ordinary test failures with stack traces. |
| D2 | Mock `Client`, not `BroadcastService` | The stale-skip and mark-after-delivery logic live *behind* the client; mocking the service would test the mock. The fake records `channels.fetch`/`send` — exactly the production surface `BroadcastService` touches. |
| D3 | Fake Client provided from a `@Global()` module | Necord's `NecordModule` is `@Global()`, which is how `BroadcastModule` resolves `Client` without importing anything. The test mirrors that topology instead of introducing an interface into production code. |
| D4 | Real PostgreSQL, no SQLite/pg-mem | The behavior under test (FK cascade on departed guilds, timestamptz offer windows, `bigint` price columns, relations) is TypeORM/Postgres behavior; an emulation would verify the emulation. |
| D5 | No storefront mocking for broadcast (scope at the time; extended by D11) | Broadcast reads the catalog table; Xbox/Epic HTTP is not on the broadcast path (spec clarification: never call platform APIs). Sync-path coverage was initially out of scope. |
| D6 | Env defaults in a Vitest setup file with `??=` *(superseded: first by the dedicated-database restructure, then by `.env.test`)* | Originally ran before the spec module imported, so config resolution always saw the defaults. Now the committed, test-only `.env.test`: the test module's `ConfigModule` loads it via `envFilePath` (a developer's `.env` is never read), `db:e2e:setup` runs through `node --env-file`, and the suite's defaults travel with the repo. |
| D7 | Schema-qualified raw SQL in fixtures | TypeORM only qualifies SQL it generates; `em.query` is verbatim — `"steammy_bot".…` by hand (AGENTS note). |
| D8 | `fileParallelism: false` for e2e | Two workers initializing migrations concurrently can race; e2e runs are seconds long, serializing costs nothing. |
| D9 | CI service container `postgres:18` | Same major as production and the compose pin; the service mirrors the compose `database` server exactly (port 5432, `steammy_dev` credentials) and `db:e2e:setup` creates `steammy_test` on it just as locally, so the gate runs the identical provisioning path in both places. |
| D10 | Docs-only dev safety | Guild scoping (`NODE_ENV` + `TEST_GUILD_ID`) and `BROADCAST_ENABLED` are pre-existing production mechanisms; no guard code is added for them (spec FR-007/FR-008). |
| D11 | MSW at the HTTP transport for the sync suite (supersedes D5's "out of scope", spec Clarifications 2026-10-01) | The faithful analogue of D2/D3: fake only what is outside the process. A Nest DI fake of `EpicApi`/`XboxApi` would skip our own adapters — URL building, pinned params, Xbox's two-call flow — which is mocking `BroadcastService` in reverse. MSW intercepts axios before the network, so the real adapters, mappers, and repositories run, and `onUnhandledRequest: 'error'` makes any stray or wrong URL a test failure (SC-007). |

## Production-code surface

Exactly one production-source file changed:
`src/database/scripts/create-schema.ts` gained an ensure-database step —
`CREATE DATABASE` for the configured database when missing, over a
connection to the server's maintenance database — because the
single-server topology makes `npm run db:e2e:setup` the thing that
provisions `steammy_test` (FR-001/FR-002). It is shared infrastructure
(`db:init` runs the same code) and is not gated on any test environment,
so it is not a test-only path (FR-008, SC-005): no dry-run API, no dev
scripts, no new guards. Everything else added by the first iteration —
`src/dev/`, the `preview()` API, the scheduler guard and the env guard —
was reverted. Changed files are limited to that one script,
`docker-compose.yml`, `.env.test` (new, test-only config), `.env.example`,
`README.md`, `AGENTS.md`, `.github/workflows/build.yml`,
`vitest.config.e2e.ts`, `package.json` (dev-script removal — reverted to
stock; later `+msw`, `+fishery` as devDependencies, test-only, plus the
`.env.test` e2e / `db:e2e:setup` scripts) and `test/`.

## Risks

| Risk | Mitigation |
| --- | --- |
| Developer machine without Docker | Suite only needs *a* PostgreSQL: quickstart documents `DATABASE_*` overrides; failure mode is an immediate `ECONNREFUSED`, never a silent skip (edge case FR-002). |
| `.env` pointing elsewhere | The suite never reads the developer's `.env`: the test module's `ConfigModule` loads the committed `.env.test` (`envFilePath`) and `db:e2e:setup` runs via `node --env-file=.env.test`; the dedicated e2e database is cleared around every test. |
| CI drift from local | Identical image pin (`postgres:18`) in compose and the workflow service; same env default names. |
| Regression test loses teeth | SC-002's one-time fault injection proves the stale-skip test fails when the skip is removed; recorded in quickstart § Acceptance. |
