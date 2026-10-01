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
docker-compose.yml                 # database service: postgres:18, healthcheck,
                                   # loopback port, named volume (app untouched)
test/
  setup/e2e-env.ts                 # deterministic DATABASE_* / BOT_TOKEN defaults (??= only)
  fixtures/broadcast.fixture.ts    # dev- fixtures + schema bootstrap + purge
  broadcast.e2e-spec.ts            # the broadcast contract (4 tests)
  health.e2e-spec.ts               # unchanged
vitest.config.e2e.ts               # setupFiles + fileParallelism: false
.github/workflows/build.yml        # build job gains a postgres:18 service
```

Test module composition — one mocked boundary:

```
Test.createTestingModule
├── ConfigModule.forRoot(validationSchema: envSchema)   # same validation as prod
├── DatabaseModule                                      # real PG, migrationsRun
├── PlatformsModule                                     # registry → GenericPlatform
│     └── BroadcastModule → BroadcastService            # real
└── TestDiscordModule (@Global, exports Client)         # fake: channels.fetch only
```

## Key decisions

| # | Decision | Rationale |
| --- | --- | --- |
| D1 | E2e suite instead of a check runner | Verdict/exit-code/JSON machinery duplicates what a test runner already is; failures print as ordinary test failures with stack traces. |
| D2 | Mock `Client`, not `BroadcastService` | The stale-skip and mark-after-delivery logic live *behind* the client; mocking the service would test the mock. The fake records `channels.fetch`/`send` — exactly the production surface `BroadcastService` touches. |
| D3 | Fake Client provided from a `@Global()` module | Necord's `NecordModule` is `@Global()`, which is how `BroadcastModule` resolves `Client` without importing anything. The test mirrors that topology instead of introducing an interface into production code. |
| D4 | Real PostgreSQL, no SQLite/pg-mem | The behavior under test (FK cascade on departed guilds, timestamptz offer windows, `bigint` price columns, relations) is TypeORM/Postgres behavior; an emulation would verify the emulation. |
| D5 | No MSW / storefront mocking | Broadcast reads the catalog table; Xbox/Epic HTTP is not on the path (spec clarification: never call platform APIs). Sync-path testing is a different concern, out of scope. |
| D6 | Env defaults in a Vitest setup file with `??=` | Runs before the spec module is imported, so config resolution always sees them; exported `DATABASE_*` win, so CI and developers can redirect the suite without code changes. |
| D7 | Schema-qualified raw SQL in fixtures | TypeORM only qualifies SQL it generates; `em.query` is verbatim — `"steammy_bot".…` by hand (AGENTS note). |
| D8 | `fileParallelism: false` for e2e | Two workers initializing migrations concurrently can race; e2e runs are seconds long, serializing costs nothing. |
| D9 | CI service container `postgres:18` | Same major as production and the compose pin; the gate (`test:e2e`) then runs identically locally and in CI. |
| D10 | Docs-only dev safety | Guild scoping (`NODE_ENV` + `TEST_GUILD_ID`) and `BROADCAST_ENABLED` are pre-existing production mechanisms; no guard code is added for them (spec FR-007/FR-008). |

## Production-code surface

None. `src/` is byte-identical to the branch point except for nothing: the
harness, the `preview()` API, the scheduler guard and the env guard added by
the first iteration were all reverted (FR-008, SC-005). Changed files are
limited to `docker-compose.yml`, `.env.example`, `README.md`, `AGENTS.md`,
`.github/workflows/build.yml`, `vitest.config.e2e.ts`, `package.json`
(dev-script removal — reverted to stock) and `test/`.

## Risks

| Risk | Mitigation |
| --- | --- |
| Developer machine without Docker | Suite only needs *a* PostgreSQL: quickstart documents `DATABASE_*` overrides; failure mode is an immediate `ECONNREFUSED`, never a silent skip (edge case FR-002). |
| `.env` pointing elsewhere | Setup fills only missing vars; fixtures are `dev-`-prefixed and purged, so foreign rows are never touched. |
| CI drift from local | Identical image pin (`postgres:18`) in compose and the workflow service; same env default names. |
| Regression test loses teeth | SC-002's one-time fault injection proves the stale-skip test fails when the skip is removed; recorded in quickstart § Acceptance. |
