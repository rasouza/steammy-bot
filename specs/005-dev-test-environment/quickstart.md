# Quickstart — local database, the e2e suites, running the bot

Everything below works from a fresh clone on Windows or Linux. Expected wall
time with Docker and a warm npm cache: well under 10 minutes (SC-001).

## 0. Prerequisites

| Requirement                  | Used for                      | Notes                                              |
| ---------------------------- | ----------------------------- | -------------------------------------------------- |
| Node.js >= 24.15.0           | everything                    | `.nvmrc` pins 24.21.0                              |
| Docker + Compose v2          | the local database            | any PostgreSQL 18 works via `DATABASE_*` overrides |
| `BOT_TOKEN`, `TEST_GUILD_ID` | running the bot (step 4) only | **not** needed for the test suite                  |

## 1. Install

```bash
npm install --ignore-scripts   # --ignore-scripts: necord's postinstall crashes on Windows
```

## 2. Start and provision the E2E database (FR-001)

```bash
docker compose up -d --wait e2e-database
npm run db:e2e:setup
docker compose ps              # expect: healthy, postgres:18, 127.0.0.1:5433
```

The image is pinned to PostgreSQL **18** (production reports 18.6), the port
is published on loopback only, and the dedicated `steammy_e2e` database is
stored in the `steammy-e2e-data` named volume. The `pg_isready` healthcheck
lets `--wait` block until the server accepts connections. The setup command
creates the `steammy_bot` schema and applies migrations through TypeORM before
tests start; it is safe to rerun.

## 3. Run the e2e suites (FR-002…FR-005, FR-009)

```bash
npm run test:e2e
```

Expected tail:

```
 Test Files  3 passed (3)
      Tests  10 passed (10)
```

What one run does:

1. The `test:e2e` npm script sets its database connection environment and a
   dummy `BOT_TOKEN` through `cross-env`; there is no Vitest setup file that
   mutates `process.env`.
2. `Test.createTestingModule` boots the real `DatabaseModule` — any newly
   pending migrations run automatically — plus `PlatformsModule`, with a **fake Discord `Client`**
   (provided globally, exactly like Necord provides the real one) and, for
   the sync spec, **MSW** answering axios for the storefront endpoints.
   `onUnhandledRequest: 'error'` makes the run offline by construction: an
   unmocked URL fails the test. Nothing logs in; nothing is posted; nothing
   reaches Epic or Xbox.
3. Contract tests run against the real `GenericPlatform`:
   - **broadcast (4)**: pending game → delivered to the active subscriber →
     marked announced; departed guild's subscription skipped before any
     channel fetch while the active subscriber still receives (the
     production `broadcast-stale-subscriptions` regression); delivery
     failure → the entry stays pending; already-announced entry untouched.
   - **sync (5)**: qualifying Epic offer persisted with mapped values while
     the non-qualifying one is dropped; re-sync idempotent (one row, changed
     fields updated); an announced row stays announced; the Xbox id list is
     forwarded to the products request (params and body pinned) with mapped
     products persisted; an empty id list skips the products call.
4. Cleanup truncates the fixture tables in the dedicated E2E database between
   tests; a second run starts from the same baseline (SC-003: five consecutive
   identical runs).

E2E connection values loaded by Nest from `.env.test`:

| Variable            | Value             | Source                            |
| ------------------- | ----------------- | --------------------------------- |
| `DATABASE_HOST`     | `127.0.0.1`       | `.env.test`                       |
| `DATABASE_PORT`     | `5433`            | same                              |
| `DATABASE_NAME`     | `steammy_e2e`     | same — dedicated Compose database |
| `DATABASE_USER`     | `steammy_e2e`     | same                              |
| `DATABASE_PASSWORD` | `steammy_e2e`     | same                              |
| `DATABASE_SSL`      | `false`           | same                              |
| `BOT_TOKEN`         | `e2e-dummy-token` | dummy — no real token is used     |

### Troubleshooting

| Symptom                          | Cause                              | Fix                                                                           |
| -------------------------------- | ---------------------------------- | ----------------------------------------------------------------------------- |
| `ECONNREFUSED 127.0.0.1:5433`    | E2E database container not running | `docker compose up -d --wait e2e-database`                                    |
| `password authentication failed` | E2E database credentials changed   | align `.env.test` and the `e2e-database` service in Compose                   |
| port 5433 already in use         | another local PostgreSQL           | stop the other listener or change the E2E port in Compose and the npm scripts |
| schema or migration missing      | database was not provisioned       | `npm run db:e2e:setup`                                                        |
| suite hangs on migration         | two suites racing                  | not expected — `fileParallelism: false` is set; check for a second manual run |

## 4. Run the bot locally (optional — FR-007)

```bash
cp .env.example .env       # set BOT_TOKEN + TEST_GUILD_ID, uncomment the local DATABASE_* block
npm run db:init            # one-time: TypeORM never creates the schema itself
npm run start:dev          # watch mode; pending migrations run automatically
```

- Keep `NODE_ENV=development`: with `TEST_GUILD_ID` it puts Necord in guild
  development mode, so command registration touches **only** that guild.
- Set `BROADCAST_ENABLED=false` for a quiet local bot that never posts.

## 5. Teardown

```bash
docker compose down         # stop; the data volume is kept
docker compose down -v      # stop and wipe both local database volumes
```

## Acceptance proofs (one-time, by hand)

- **SC-003**: run `npm run test:e2e` five times back to back — identical
  results, no cleanup between runs.
- **SC-002**: temporarily remove the stale-guild skip in
  `BroadcastService.resolveTargets` (comment the `outcome: 'stale'` branch) →
  the second contract test must fail; restore it → all green again.
- **US4 / SC-007**: temporarily change the endpoint path in `EpicApi.fetch`
  → the sync spec must fail with an unhandled-request error (the URL no
  longer matches a handler); restore it → all green again.
