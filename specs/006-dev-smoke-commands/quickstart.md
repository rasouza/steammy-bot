# Quickstart Validation: Guild-Scoped Dev Smoke Commands

**Feature**: `specs/006-dev-smoke-commands` | **Date**: 2026-10-02

A run guide, not an implementation guide: every step below either executes something or observes
something. Behaviour that needs explaining lives in [contracts](./contracts/dev-command-contracts.md),
state in [data-model](./data-model.md), and decisions in [research](./research.md).

## Prerequisites

- Node `24.21.0` (`.nvmrc`), installed with `npm ci --ignore-scripts`
- The bundled database running: `docker compose up -d --wait database`
- A `.env` with `BOT_TOKEN`, `DATABASE_*`, and `TEST_GUILD_ID` (copy `.env.example`). Keep
  `NODE_ENV=development` in it — but note that **`npm run start:dev` sets `NODE_ENV=development`
  through `cross-env`**, which is the value that reaches the process.
- The bot is a member of the test guild and you are an Administrator there
- A second guild the bot has also joined (needed only for S1/S2)
- Constitution at **4.0.0**: the Principle II carve-out must already be merged (research R11,
  Task 0). Check `.specify/memory/constitution.md`'s `**Version**` line first — if it still reads
  `3.1.2`, stop: FR-006/FR-009 would be non-compliant as written.

## Automated gate

Run from the repository root, in this order (Principle IV). All six must pass; a partial run is
not a pass.

```bash
npx prettier --check "src/**/*.ts" "test/**/*.ts"
npm run type:check
npm run lint
npm run build
npm test
npm run db:e2e:setup && npm run test:e2e
```

Narrow the two suites while iterating:

```bash
npm test -- command-scope      # scope decision + hook ordering
npm test -- generic-platform   # reset() / devBroadcast() sequences
npm test -- broadcast.service  # recipient vs subscription paths
npm run test:e2e               # registration counts against the real module graph
```

## Manual scenarios

Each scenario names the success criterion it proves. Counts are what Discord shows in the guild's
**integration command list** (Apps → the bot), counting invocable commands — root commands plus
subcommands (research R2).

### S1 — Command counts by guild and run mode · proves SC-001, SC-008

1. `npm run start:dev`, then open the command list in **another** guild the bot has joined.
   **Expected**: `0` of the four; `/ping`, `/invite`, `/help`, `/subscribe`, `/unsubscribe` still
   appear.
2. Open the list in the **test** guild.
   **Expected**: `4` — `/sync`, `/broadcast`, `/dev sync`, `/dev broadcast`.
3. Revoke `TEST_GUILD_ID` in `.env`, restart.
   **Expected**: the bot starts normally (FR-003); the four are gone everywhere; the other five
   remain.

### S2 — Deployed run offers only the admin pair · proves SC-008

Run the image the way production does (`NODE_ENV=production` supplied by the Dockerfile) with
`TEST_GUILD_ID` set, as a member of the test guild.

**Expected**: `2` — `/sync` and `/broadcast`. `/dev sync` and `/dev broadcast` absent, even though
the guild gate alone would have admitted them (FR-014).

> Wait for Discord's command-list propagation (up to about an hour) or refresh the client before
> judging a _removed_ command — see [research R8](./research.md#r8--stale-global-commands-after-moving-syncbroadcast-into-a-guild).

### S3 — Admin commands are refused outside the test guild · proves SC-001

In the second guild, attempt `/sync` by typing it manually (bypassing the list).
**Expected**: Discord reports no such command; nothing runs, nothing changes.

### S4 — One message per platform, repeatedly · proves SC-002, SC-006, SC-010

With at least one platform holding catalog rows, in a channel of the **test** guild:

```text
/dev broadcast
```

Run it five consecutive times. Each run: exactly one message per platform with rows, landing in
**that channel and no other**, and the reply states how many rows were suppressed (SC-009).
Then empty a platform's catalog and run again: reported as skipped, invocation succeeds, `0`
messages, no error (SC-006).

Check afterwards that every row reads as announced — a second run behaves exactly like the first
(FR-006). To confirm SC-010 independently, subscribe a _different_ channel to a platform first:
it must receive nothing from `/dev broadcast`.

### S5 — Reset leaves silence · proves SC-003, SC-004, SC-009

```text
/dev sync <platform>
```

Then:

1. Compare the platform's catalog row count with what the storefront returns. **Expected**: equal;
   stale rows `0` (SC-004).
2. Read the reply. **Expected**: it states how many rows were seeded as announced without being
   delivered (SC-009).
3. Let the scheduled announcement pass run. **Expected**: `0` messages for that platform (SC-003).
4. Run `/dev broadcast`. **Expected**: exactly one message for that platform (US3 scenario 4).

### S6 — A failed fetch removes nothing · proves SC-005

Point `DATABASE_*` at the running database, note the platform's row count, then break the
storefront path (disconnect the network or point the API host at an unroutable address) and run
`/dev sync <platform>` again.

**Expected**: the reply reports a failed run, **not** a reset; the row count is byte-identical to
before (SC-005). Compare immediately before and after.

### S7 — No "did not respond" · proves SC-011

Run `/dev sync <platform>` against a slow storefront (throttle the network, or watch the first run
after a cold start). **Expected**: the reply appears immediately and is updated when the work
finishes. The same applies to `/dev broadcast`. `0` invocations may surface Discord's application
error.

### S8 — No pre-existing check regresses · proves SC-007

The automated gate above is the evidence: every suite that passed on `main` passes here.

## Post-deploy checklist

1. Principle IV's six steps green on the PR.
2. Constitution shows `4.0.0` and the PR description records the MAJOR sign-off.
3. After the first production boot, confirm from a **second guild** that `/sync` and
   `/broadcast` are gone (their old global copies are purged by that boot's overwrite — allow for
   propagation delay).
4. Confirm `0` `/dev` commands in the test guild of the deployed bot.
5. Linear `STE-185` reflects the state the hooks report.

## Expected failures worth knowing

| Observation                                                | Cause                                           | Correct response                                                                                                              |
| ---------------------------------------------------------- | ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `/dev` commands missing locally                            | `NODE_ENV` not reaching the process             | use `npm run start:dev`; check `cross-env`                                                                                    |
| Commands still visible in another guild right after deploy | Discord client cache                            | wait for propagation or refresh, then re-check (research R8)                                                                  |
| `Platform is not registered: …`                            | platform removed from `gameSources`             | FR-011 rejection is working; the platform is not registered                                                                   |
| `/dev broadcast` reports `0` delivered for one platform    | the channel is unreachable from the bot         | row stays pending; a repeat run recovers — no data lost (spec Edge Cases)                                                     |
| A platform reports `0` delivered although it has rows      | none of its rows pass its own eligibility rules | expected; see the eligibility note in [research R6](./research.md#r6--which-row-dev-broadcast-picks-and-what-gets-suppressed) |
