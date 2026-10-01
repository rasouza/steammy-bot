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
docker compose up -d --wait database
npm run db:e2e:setup
docker compose ps              # expect: healthy, postgres:18, 127.0.0.1:5432
```

The image is pinned to PostgreSQL **18** (production reports 18.6), the port
is published on loopback only, and both databases live in the
`steammy-dev-data` named volume: `steammy_dev` created by the container,
`steammy_test` created by the setup command. The `pg_isready` healthcheck
lets `--wait` block until the server accepts connections. The setup command
creates the `steammy_test` database and the `steammy_bot` schema and applies
migrations through TypeORM before tests start; it is safe to rerun. The two
databases share one server but never touch each other: the suite connects
only to `steammy_test` and clears its tables between tests.

## 3. Run the e2e suites (FR-002…FR-005, FR-009)

```bash
npm run test:e2e
```

Expected tail:

```
 Test Files  3 passed (3)
      Tests  20 passed (20)
```

What one run does:

1. The suite's connection settings and a dummy `BOT_TOKEN` come from the
   committed, test-only `.env.test` (loaded by the test module's
   `ConfigModule`); there is no Vitest setup file that mutates
   `process.env`, and a developer's `.env` is never read.
2. `Test.createTestingModule` boots the real `DatabaseModule` — any newly
   pending migrations run automatically — plus `PlatformsModule`, with a **fake Discord `Client`**
   (provided globally, exactly like Necord provides the real one) and, for
   the sync spec, **MSW** answering axios for the storefront endpoints.
   `onUnhandledRequest: 'error'` makes the run offline by construction: an
   unmocked URL fails the test. Nothing logs in; nothing is posted; nothing
   reaches Epic or Xbox.
3. Contract tests run against the real `GenericPlatform`:
   - **broadcast (8 specs / 14 runs, Epic + Xbox)**: pending game →
     delivered → marked announced; already-broadcast game ignored by the
     repository query; one pending game delivered to multiple active
     subscriptions; departed guild's subscription skipped before any
     channel fetch while the active subscriber still receives (the
     production `broadcast-stale-subscriptions` regression); inactive
     channel probed but never delivered to; multiple guilds served
     independently across platforms; one mixed-state run (pending and
     already-broadcast rows across active, inactive, and departed guilds);
     delivery failure → the entry stays pending.
   - **sync (5)**: qualifying Epic offer persisted with mapped values while
     the non-qualifying one is dropped; re-sync idempotent (one row, changed
     fields updated); an announced row stays announced; the Xbox id list is
     forwarded to the products request (params and body pinned) with mapped
     products persisted; an empty id list skips the products call.
4. Cleanup clears the suite's tables in the dedicated E2E database between
   tests; a second run starts from the same baseline (SC-003: five consecutive
   identical runs).

E2E connection values loaded by Nest from `.env.test`:

| Variable            | Value             | Source                            |
| ------------------- | ----------------- | --------------------------------- |
| `DATABASE_HOST`     | `127.0.0.1`       | `.env.test`                       |
| `DATABASE_PORT`     | `5432`            | same                              |
| `DATABASE_NAME`     | `steammy_test`    | same — dedicated Compose database |
| `DATABASE_USER`     | `steammy_dev`     | same — the Compose role           |
| `DATABASE_PASSWORD` | `steammy_dev`     | same — the Compose role           |
| `DATABASE_SSL`      | `false`           | same                              |
| `BOT_TOKEN`         | `e2e-dummy-token` | dummy — no real token is used     |

### Troubleshooting

| Symptom                          | Cause                                          | Fix                                                                           |
| -------------------------------- | ---------------------------------------------- | ----------------------------------------------------------------------------- |
| `ECONNREFUSED 127.0.0.1:5432`    | compose database not running                   | `docker compose up -d --wait database`                                        |
| `password authentication failed` | `.env.test` creds differ from the Compose role | align `DATABASE_USER`/`DATABASE_PASSWORD` in `.env.test` and your `.env`      |
| port 5432 already in use         | another local PostgreSQL                       | stop the other listener or change the port in Compose and `.env.test`         |
| schema or migration missing      | database was not provisioned                   | `npm run db:e2e:setup`                                                        |
| suite hangs on migration         | two suites racing                              | not expected — `fileParallelism: false` is set; check for a second manual run |

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
