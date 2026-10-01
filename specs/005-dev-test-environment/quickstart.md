# Quickstart — local database, the broadcast suite, running the bot

Everything below works from a fresh clone on Windows or Linux. Expected wall
time with Docker and a warm npm cache: well under 10 minutes (SC-001).

## 0. Prerequisites

| Requirement | Used for | Notes |
| --- | --- | --- |
| Node.js >= 24.15.0 | everything | `.nvmrc` pins 24.21.0 |
| Docker + Compose v2 | the local database | any PostgreSQL 18 works via `DATABASE_*` overrides |
| `BOT_TOKEN`, `TEST_GUILD_ID` | running the bot (step 4) only | **not** needed for the test suite |

## 1. Install

```bash
npm install --ignore-scripts   # --ignore-scripts: necord's postinstall crashes on Windows
```

## 2. Start the database (FR-001)

```bash
docker compose up -d database
docker compose ps              # expect: healthy, postgres:18, 127.0.0.1:5432
```

The image is pinned to PostgreSQL **18** (production reports 18.6), the port
is published on loopback only, data lives in the named volume
`steammy-dev-data`, and the `pg_isready` healthcheck lets `--wait` block
until the server accepts connections.

## 3. Run the broadcast suite (FR-002…FR-005)

```bash
npm run test:e2e
```

Expected tail:

```
 Test Files  2 passed (2)
      Tests  5 passed (5)
```

What one run does:

1. `test/setup/e2e-env.ts` fills missing connection env (see table below) —
   exported `DATABASE_*` variables always win.
2. The fixture helper creates the `steammy_bot` schema if absent (the same
   prerequisite as `npm run db:init`).
3. `Test.createTestingModule` boots the real `DatabaseModule` — migrations run
   automatically — plus `PlatformsModule`, with a **fake Discord `Client`**
   as the only substituted boundary (provided globally, exactly like Necord
   provides the real one). Nothing logs in; nothing is posted.
4. Four contract tests run against the real `GenericPlatform` +
   `BroadcastService`:
   - pending game → delivered to the active subscriber → marked announced;
   - departed guild's subscription → skipped before any channel fetch, and
     the active subscriber still receives (the production
     `broadcast-stale-subscriptions` regression);
   - delivery failure → the entry stays pending (delivery first, state
     second);
   - already-announced entry → no fetch, no send.
5. Every test purges its `dev-`-prefixed rows; a second run starts from the
   same baseline (SC-003: five consecutive identical runs).

Connection defaults (overridable):

| Variable | Default | Source |
| --- | --- | --- |
| `DATABASE_HOST` | `127.0.0.1` | `test/setup/e2e-env.ts` |
| `DATABASE_PORT` | `5432` | same |
| `DATABASE_NAME` | `steammy_dev` | same — matches the compose default |
| `DATABASE_USER` | `steammy_dev` | same |
| `DATABASE_PASSWORD` | `steammy_dev` | same |
| `DATABASE_SSL` | `false` | same |
| `BOT_TOKEN` | `e2e-dummy-token` | dummy — no token can leak into tests |

### Troubleshooting

| Symptom | Cause | Fix |
| --- | --- | --- |
| `ECONNREFUSED 127.0.0.1:5432` | database container not running | `docker compose up -d database` |
| `password authentication failed` | exported `DATABASE_*` do not match the container | align them with the compose environment block |
| port 5432 already in use | another local PostgreSQL | stop it, or export `DATABASE_PORT`/`DATABASE_HOST` for both container and suite |
| suite hangs on migration | two suites racing | not expected — `fileParallelism: false` is set; check for a second manual run |

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
docker compose down -v      # stop and wipe the database
```

## Acceptance proofs (one-time, by hand)

- **SC-003**: run `npm run test:e2e` five times back to back — identical
  results, no cleanup between runs.
- **SC-002**: temporarily remove the stale-guild skip in
  `BroadcastService.resolveTargets` (comment the `outcome: 'stale'` branch) →
  the second contract test must fail; restore it → all green again.
