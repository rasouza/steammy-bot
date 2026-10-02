---

description: "Task list template for feature implementation"
---

# Tasks: Dev/Test Environment — Local Database, E2E Suites (Broadcast + Sync), Documented Run

**Input**: Design documents from `/specs/005-dev-test-environment/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [quickstart.md](./quickstart.md)

**Revision 2026-10-01**: the original harness-based task list (`src/dev/`
scripts, dry-run API, check runner) was superseded — see spec.md
Clarifications. Tasks T002–T031 of that iteration were removed with the code
they described; surviving IDs keep their identity (T001/T032/T034/T035), new
work continues at T036. The later sync-suite extension (same day, spec.md
Clarifications) continues at T044.

**Tests**: the project constitution (Principle V) requires colocated unit
specs for unit-testable changes and pins both globs. This feature's primary
deliverable IS a test — the e2e suites live at `test/broadcast.e2e-spec.ts`
and `test/sync.e2e-spec.ts`.

**Organization**: Tasks are grouped by phase; each phase's output is
verifiable on its own.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

Single project: `src/`, `test/` at repository root; design docs in
`specs/005-dev-test-environment/`. Compose file is the existing
`docker-compose.yml` (`database` service only — edited directly).

---

## Phase 1: Revert the superseded harness

**Purpose**: return production code to the branch point — nothing in `src/`
may know this feature exists (FR-008, SC-005)

- [X] T036 [US2] Delete the first iteration entirely: `src/dev/` (env-guard, stack, seed, dry-run, verify, checks, fixtures, dev-env, quiet-stdout, exit-codes, dev-client.provider, dev-broadcast.module + specs), the five `dev:*` scripts and `tsconfig.build.json` exclusion, the `preview()` API (`platform.types.ts`, `generic-platform.ts`, `broadcast.service.ts` + spec extensions), the `SCHEDULE_ENABLED` scheduler guard, and the `TEST_CHANNEL_ID`/`SCHEDULE_ENABLED` env.schema entries — `src/` ends byte-identical to the branch point

---

## Phase 2: Test infrastructure

**Purpose**: deterministic fixtures + env bootstrap + the e2e config (US2)

- [X] T001 [US1] Edit the `database` service in `docker-compose.yml`: pin an explicit PostgreSQL major (verified with `SELECT version()` → PostgreSQL 18.6 on production), add a `pg_isready` healthcheck so `up -d --wait` works, replace the `./data` bind mount with named volume `steammy-dev-data`, publish the port loopback-only as `127.0.0.1:5432:5432`, and give `POSTGRES_DB/USER/PASSWORD` fallback defaults (`${DATABASE_NAME:-steammy_dev}` etc.); drop the unused `app` service and the commented MySQL template so compose is database-only (FR-001)
- [X] T037 [P] [US2] `test/setup/e2e-env.ts` + `test/fixtures/broadcast.fixture.ts`: DATABASE_*/BOT_TOKEN defaults applied with `??=` (exported variables win; runs before the spec module is imported), schema bootstrap before the module boots (same prerequisite as `db:init`), deterministic `dev-`-prefixed fixtures (active guild, departed guild, one subscription each, one pending Epic offer inside its offer window), and a schema-qualified purge around every test (FR-002, FR-004)
- [X] T038 [US2] `test/broadcast.e2e-spec.ts`: `Test.createTestingModule` with the real `DatabaseModule` (schema + `migrationsRun`) and `PlatformsModule`, plus a `@Global()` `TestDiscordModule` exporting a fake `Client` (`channels.fetch` + recorded `send`) that mirrors how Necord provides the real one; four contract tests — deliver + mark announced; departed-guild subscription skipped before any channel fetch while the active subscriber still receives (the production regression); failed delivery leaves the entry pending; already-announced entry untouched (FR-003, FR-005)
- [X] T039 [P] [US2] `vitest.config.e2e.ts`: register the env setup file and set `fileParallelism: false` so two workers can never race migrations (spec edge case)

---

## Phase 3: CI

**Purpose**: the gate runs the same suite everywhere (SC-004)

- [X] T040 [US2] `.github/workflows/build.yml`: add a healthchecked `postgres:18` service container to the `build` job with `DATABASE_*` job env matching the compose defaults; the six-step gate order and zero-error lint requirement stay unchanged (FR-006)

---

## Phase 4: Documentation

**Purpose**: every path written down — fresh clone → green suite → running
bot (US3, FR-007)

- [X] T041 [US3] Rewrite the spec artifacts to the revised scope: `spec.md` (2026-10-01 clarifications, rewritten stories/FRs/SCs), `plan.md` (test-module composition + decisions D1–D10), `quickstart.md` (runbook with expected output and troubleshooting); delete the obsolete `contracts/` (cli.md, dry-run-report, check-result) and mark `research.md`/`data-model.md` historical
- [X] T032 [US3] Rewrite README § Development around the revised flow: compose database → `npm run test:e2e` → optional manual `start:dev`; document guild scoping (`NODE_ENV` + `TEST_GUILD_ID`) and the `BROADCAST_ENABLED=false` quiet run; drop the disproven decorator-metadata warning (`design:paramtypes` verified present under the Vitest transform)
- [X] T035 [P] [US3] Verify whether `dotenv` is a declared dependency (package.json) and, if the AGENTS.md note claiming otherwise is confirmed stale, correct that note in the same change
- [X] T042 [P] [US3] Update `AGENTS.md` Tests section: the broadcast e2e boots real `DatabaseModule` + `PlatformsModule` against PostgreSQL (compose defaults in `test/setup/e2e-env.ts`, overridable), Discord is the only mocked boundary (fake `@Global()` Client), raw SQL must be schema-qualified by hand, `fileParallelism: false` protects migrations

---

## Phase 5: Verification

**Purpose**: prove the suite has teeth and the gate is green (SC-001…SC-004)

- [X] T034 [US2] Run the full six-step CI gate in order — `npx prettier --check "src/**/*.ts" "test/**/*.ts"`, `npm run type:check`, `npm run lint`, `npm run build`, `npm test`, `npm run test:e2e` — all must pass; lint must stay at 0 errors (constitution Principle IV)
- [X] T043 [US2] Acceptance proofs: SC-002 fault injection (remove the stale-guild skip in `BroadcastService.send` → exactly the regression test fails with the stale channel fetched → restore → green again); SC-003 five consecutive identical green `test:e2e` runs with no cleanup; SC-001 fresh-clone path verified end to end against a local PostgreSQL 18.6 instance (Docker unavailable on the acceptance machine — the compose path uses the identical image major and credentials) (US2 scenarios 1–5)

---

## Phase 6: Sync pipeline suite

**Purpose**: extend the same line of thought to the fetch → map → persist
half — real adapters/mappers/repositories, storefront HTTP mocked at the
transport (US4, FR-003, FR-009)

- [X] T044 [US4] Extract the shared e2e plumbing the second spec needs: `test/helpers/testing-app.ts` (module factory — Config + Database + Platforms + `@Global()` fake `Client` with the module-level spies) and `test/fixtures/db.fixture.ts` (schema bootstrap + schema-qualified purge moved out of `broadcast.fixture.ts`); `test/broadcast.e2e-spec.ts` switches to them and stays green (FR-003)
- [X] T045 [US4] Add the `msw` devDependency, `test/fixtures/http/epic.fixtures.ts` and `test/fixtures/http/xbox.fixtures.ts` (typed against the DTOs, `dev-`-prefixed ids), and `test/sync.e2e-spec.ts`: five contract tests — qualifying persisted / non-qualifying dropped; idempotent re-sync with changed fields updated; announced row stays announced; Xbox id list forwarded to the products request with pinned params/body and mapped values persisted; empty id list skips the products call — `setupServer` with `onUnhandledRequest: 'error'` (FR-009)
- [X] T046 [P] [US4] Amend the artifacts for sync coverage: `spec.md` (US4, FR-003 reword, FR-009, SC-007, clarification, assumption removed), `plan.md` (decision D11 + structure), `quickstart.md` (sync section + expected counts), README and AGENTS Tests wording (FR-007)
- [X] T047 [US4] Re-run the full six-step gate over the extended suite (3 files / 10 e2e tests) and confirm repeat runs stay green (SC-003, SC-004)

---

## Phase 7: Convergence

**Purpose**: close the gaps the convergence assessment (2026-10-01) found
between the spec 005 artifacts and the implemented state — all four are
verification or artifact-accuracy work; no product code changes

- [ ] T048 [US1] On a Docker-capable machine, execute the documented fresh-clone chains verbatim — `docker compose up -d --wait database && npm run db:e2e:setup && npm run test:e2e` and the README § E2E path — confirm a green suite in under 10 minutes with no bot token, and record the result (elapsed time, date) in quickstart § Acceptance proofs (SC-001, SC-006) (partial — everything past the compose invocation is CI-proven in run `36921081169`, but the chain itself has never run)
- [ ] T049 [P] [US3] Amend plan.md's "Production-code surface" section, which still claims `src/` is byte-identical to the branch point: the PR's only production-source change is `src/database/scripts/create-schema.ts` (ensure-database step) — sanctioned by FR-001/FR-002 and free of test-only branches per FR-008/SC-005, but it must be documented so an SC-005 inspection does not misread it (plan: production-code surface) (contradicts)
- [ ] T050 [US2] Re-run the one-time acceptance proofs against the current suite shape (post scenario-layer rewrite, 20 tests) and record observed results — date, command, red→green evidence — under quickstart § Acceptance proofs: SC-002 (remove the stale-guild skip → exactly the regression test fails), SC-003 (five consecutive green `test:e2e` runs, no cleanup), SC-007 (`EpicApi.fetch` URL change → unhandled-request failures) (SC-002, SC-003, SC-007) (partial — proofs predate the rewrite and their results live only in the PR description)
- [ ] T051 [P] Follow the constitution's amendment procedure for the stale factual prose: Principle II's "`broadcast.service.ts:65`/`:103` currently set `game.broadcasted = true` … known defect" (the flag is no longer written there — post-delivery marking lives in `GenericPlatform`) and Principle V's "E2E specs … require neither a database nor a Discord token" (superseded for the broadcast/sync suites by FR-002; the token half still holds). Propose affected principles + rationale + bump type, obtain the explicit maintainer approval the procedure requires (the pending version question — the line reads 3.1.1), then update version/Last Amended and the AGENTS.md passages that repeat the ruled text (Constitution II, Constitution V; amendment procedure) (contradicts)
