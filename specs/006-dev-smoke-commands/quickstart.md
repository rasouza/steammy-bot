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

### S5 — Reset leaves silence · proves SC-003, SC-004, SC-009 ⚠️ partially observed 2026-10-19

Operator ran `/dev sync platform: Epic Games` against a catalog of 0 Epic rows
(it had been emptied to stage SC-006), 526 Xbox rows, 54 subscriptions.

Reply, verbatim:

```
Epic Games: reset — 2 seeded announced (14 fetched)
```

| Step | Expected | Observed | Verdict |
| ---- | -------- | -------- | ------- |
| 1. reply counts (SC-009) | states how many rows were seeded announced | **`2 seeded announced (14 fetched)`** | ✅ |
| 2. catalog equals storefront, stale rows 0 (SC-004) | row count matches the seeded count; nothing survives from before | **`epic 2 rows, 0 pending`**; both rows `broadcasted = true` at row level; the catalog held **0** rows before the reset, so nothing could be stale | ✅ |
| 3. scheduled pass delivers 0 (SC-003) | 0 messages for that platform | **not observed on Epic — see the confound below** | ⏳ |
| 4. `/dev broadcast` gives one message | exactly one per platform | not yet run | ⏳ |

**`fetched` and `seeded` are different numbers by design, and an initial
expectation that they would match was wrong.** `load()` returns
`{ fetched: sources.length, games }` — `fetched` counts the **raw** elements
the storefront returns (14), while `games` is only what the mapper qualified as
eligible (2). The gap of 12 is the eligibility filter doing its job, not a
mismatch. The reply's two numbers are therefore correct as printed.

**Why SC-003 cannot be proven on Epic, and why this is a property of the data
rather than a defect.** `epicPendingCriteria` requires `broadcasted: false`
**and** an offer window containing `now`. Both rows this reset seeded carry
`offer_start_at = 2026-10-22 15:00 UTC` — four days in the future. A silent
announce pass would therefore be **confounded**: those rows cannot be delivered
whether or not the reset marked them announced, because the window excludes
them independently. Silence would evidence nothing about the reset.

**`xboxPendingCriteria` is window-free** — `{ broadcasted: false }`, with no
offer-window columns on `catalog_xbox` at all — so Xbox is the platform on which
SC-003's silence is a clean, unconfounded observation. S5's remaining steps are
being run there instead; the outcome is recorded below when observed.

#### S5 on Xbox — the unconfounded run · 2026-10-19

Operator ran `/dev sync platform: Xbox Game Pass` at 00:31, against a catalog of
526 Xbox rows and the test guild subscribed to **both** platforms on channel
`#general` (`1284868608123736116`) — so the scheduled pass's silence is directly
observable there.

Reply, verbatim:

```
Xbox Game Pass: reset — 515 seeded announced (515 fetched)
```

| Step | Expected | Observed | Verdict |
| ---- | -------- | -------- | ------- |
| 1. reply counts (SC-009) | states how many rows were seeded announced | **`515 seeded announced (515 fetched)`** | ✅ |
| 2. catalog equals storefront, stale rows 0 (SC-004) | row count matches the seeded count; nothing survives from before | **`xbox 515 rows, 0 pending`**; the catalog held **526** rows before, so the 11 removed were replaced wholesale and none survived | ✅ |
| 3. scheduled pass delivers 0 (SC-003) | 0 messages in `#general` at minute 10 | **not observed — the window was lost; see below** | ⏳ |

**The two counts matching here is the correct expectation, and it is the
opposite of Epic's.** `EpicMapper.toGame` can return `null`, so Epic's `fetched`
(14) and `seeded` (2) differ by the filter. `XboxMapper.toGame` returns a `Game`
unconditionally — never `null` — so every raw element qualifies and `fetched`
must equal `seeded`. Both numbers printed **515**, as the code requires.

**A prior count of 526 became 515 on reset.** That is the reset doing its job:
`clear()` then `saveAll()`, so the catalog reflects exactly what the storefront
returns at that moment rather than a merge with what was there before. Eleven
rows left because the storefront no longer listed them.

**How SC-003 is being measured, and why a single reading would not do.** If the
01:10 pass delivered anything it would mark those rows announced, so a probe
taken *after* the pass alone would read `0 pending` whether or not a message was
sent — silence and success would look identical. The probe therefore samples
twice: once just before minute 10 to capture what the pass will find eligible,
and once after, diffing row ids against a 515-id baseline saved at 00:31. Any
row still pending afterwards is classified as either **new since baseline**
(inserted by the 01:00 sync cron — correct behaviour, not a defect) or
**baseline** (a delivery or marking defect). `updated_at` is compared per row for
the same reason.

**Step 3 was attempted and the observation was lost; it is not recorded as
observed.** The pre-pass sample succeeded — **01:09:16, `xbox 515, pending 0`**,
so the pass would have found nothing eligible. The post-pass sample never
happened: the host session restarted at that moment and killed the probe.

A later reading at **10:17** showed `xbox 515, pending 0`, with **0 rows new and
0 rows gone** against the 00:31 baseline. That is *not* a substitute for the
post-pass reading, because **the bot was not running at 10:17** — no `dist/main`
process was alive. Without proof the process was up at 01:10, "no messages
appeared" is indistinguishable from "the pass never executed", which is exactly
the confound the two-sample design existed to avoid and which a lost sample
cannot be repaired after the fact.

So SC-003 stands on its **automated** evidence (`generic-platform.spec` — "never
touches broadcast delivery") and on the pre-pass state being correct, and is
marked **not observed live**. The two steps that *were* observed — SC-009's reply
count and SC-004's catalog state — remain recorded above as observed.

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
   `/broadcast` are gone. They are, because that boot overwrote **this application's** global
   set — allow for Discord's propagation delay (research R8). A **second application** is not
   covered by that overwrite: its stale globals are never purged by any boot, so remove them
   from that application's Developer Portal before judging `0` there (R8, amended 2026-10-18).
4. Confirm `0` `/dev` commands in the test guild of the deployed bot.
5. Linear `STE-185` reflects the state the hooks report.

## Expected failures worth knowing

| Observation                                                | Cause                                           | Correct response                                                                                                              |
| ---------------------------------------------------------- | ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `/dev` commands missing locally                            | `NODE_ENV` not reaching the process             | use `npm run start:dev`; check `cross-env`                                                                                    |
| Commands still visible in another guild right after deploy | Discord client cache                            | wait for propagation or refresh, then re-check (research R8)                                                                  |
| `Platform is not registered: …`                            | platform removed from `gameSources`             | FR-011 rejection is working; the platform is not registered                                                                   |
| `/dev broadcast` reports `0` delivered for one platform    | the channel is unreachable from the bot         | row stays pending; a repeat run recovers — no data lost (spec Edge Cases)                                                     |
| A platform reports `0` delivered although it has rows      | **no longer expected** — `findDevCandidate` ignores the announcement window, so any row is deliverable            | the reply says `skipped`, which means the catalog is empty; otherwise suspect the unreachable-channel row above, then a bug |

## Validation record

**Executed**: 2026-10-03 · **Branch**: `STE-185-006-dev-smoke-commands` · **Constitution**: 4.0.0 ✓

### S8 — no pre-existing check regresses · proves SC-007 ✅ executed 2026-10-03

All six steps of the automated gate, in order (a partial run is not a pass), as run against the
tree at `ef5ec54`:

| #   | Step                        | Result                                       |
| --- | --------------------------- | -------------------------------------------- |
| 1   | `prettier --check`          | pass — all matched files use Prettier style  |
| 2   | `npm run type:check`        | pass — clean                                 |
| 3   | `npm run lint`              | pass — **0 errors / 22 warnings** (baseline) |
| 4   | `npm run build`             | pass — `nest build` exit 0                   |
| 5   | `npm test`                  | pass — 10 files, **101** tests               |
| 6   | `db:e2e:setup` + `test:e2e` | pass — 4 files, **24** tests                 |

Prerequisite confirmed: `.specify/memory/constitution.md` reads
`**Version**: 4.0.0`, so the Principle II carve-out was in place before any
FR-006/FR-009 code was written (research R11 / Task 0).

> This table is the record of **that** run, kept as history rather than rewritten. The suite has
> since grown — `60b0486` took it to 102, and the convergence phase below to 129 — and the S4
> evidence cell cited a test that has since been renamed. The current numbers are in the
> convergence run directly below; a validation record that quietly renumbers itself would be
> claiming observations that were not made.

### S8 — convergence run · proves SC-007 ✅ executed 2026-10-18

All six steps re-run, in order, against the tree carrying `60b0486` (forced delivery) and the
Phase 7 convergence fixes (T031 runtime refusal, T032 unreachable-guild degradation, T034/T035
document corrections):

| #   | Step                        | Result                                       |
| --- | --------------------------- | -------------------------------------------- |
| 1   | `prettier --check`          | pass — all matched files use Prettier style  |
| 2   | `npm run type:check`        | pass — clean                                 |
| 3   | `npm run lint`              | pass — **0 errors / 22 warnings** (baseline) |
| 4   | `npm run build`             | pass — `nest build` exit 0                   |
| 5   | `npm test`                  | pass — 12 files, **129** tests               |
| 6   | `db:e2e:setup` + `test:e2e` | pass — 4 files, **28** tests                 |

Evidence this run added, which is what S1/S3 (SC-001) and US1/AC5 now rest on:
`src/modules/admin/test-guild.guard.spec.ts`, the refusal block added to
`src/modules/admin/dev.commands.spec.ts`, the new `src/modules/admin/admin.commands.spec.ts`,
the ready-time cases in `src/modules/bot/command-scope.service.spec.ts`, and the unreachable-guild
cases in `test/command-scope.e2e-spec.ts`.

### S1 — Command counts by guild and run mode · proves SC-001 ✅ executed 2026-10-18

Run from a machine with `.env`, against the dev application
`SteammyBotDEV#1402` (`863117639207223298`) on branch `STE-185-006-dev-smoke-commands`.
Two guilds: the test guild `The Lab` (`1284541904209444894`) and a second guild
`Nazaré's server` (`1561489788027011164`), created for this run.

Counts were taken from the **live registry** via
`REST.get Routes.applicationCommands / applicationGuildCommands` rather than by
eyeballing the client list, so they are exact rather than subject to the
propagation delay R8 describes.

| Step | Guild | Observed | Expected | Verdict |
| ---- | ----- | -------- | -------- | ------- |
| 1 | second (`1561489788027011164`) | **0** guild commands | `0` of the four | ✅ |
| 2 | test (`1284541904209444894`) | **8** total: `subscribe`, `unsubscribe`, `sync`, `broadcast`, `ping`, `invite`, `help`, `dev` | `4` admin/dev | ✅ |

**How the second guild's 8 reconciles with the expected 4.** The list is the
application's full set: the 5 always-global commands plus the 3 scoped roots.
SC-001 counts only the admin/dev set, which is `sync`, `broadcast` and `dev` —
`dev` is **one root carrying two subcommands**, so that is 3 registry entries and
**4 invocable commands** (`/sync`, `/broadcast`, `/dev sync`, `/dev broadcast`),
exactly SC-001's 4. `/dev sync` and `/dev broadcast` are not separate registry
entries (research R2).

**Stale-global check.** The dev application's **global** command set is **empty**
(`Routes.applicationCommands` → 0), so the 8 are guild registrations and the
scoped roots were never written globally. This is the shape research R1
predicts: Necord's `development` option pins to the test guild, so a dev run
leaves nothing global to purge.

**Not observed here**: S1 step 3 (revoke `TEST_GUILD_ID`, restart) — not yet
run; see S1b below.

### S1b — No test guild configured · proves FR-002, FR-003 ⏳ not yet executed

S1's step 3. Requires stopping the dev run, removing `TEST_GUILD_ID` from
`.env`, and restarting. Expected: the bot boots normally (FR-003) and all four
are absent everywhere while the other five remain (FR-002).

### S2 — Deployed run offers only the admin pair · proves SC-008 ⚠️ partially observed

The production application is a **separate Discord application** —
`Steammy#8458` (`1284565018788106273`) — running the Coolify app `steammy-bot`,
which is `running:healthy`. It is a member of the test guild. The deployed bot's
own command registrations were **not read**, because that requires its
`BOT_TOKEN` and this run only holds the dev token; a token is never written into
a record.

The relevant structural fact **was** verified: because production is a separate
application, `application.commands.set` reached by a production boot touches
only `Steammy#8458`'s registrations and can never rewrite the dev application's
— the exact isolation research R8 (amended 2026-10-18) now states. And the
deployed build at the time of this run is `v3.4.0`, which **predates the code
under test** (PR #44), so a deployed-run observation here would not evidence
this branch's behaviour anyway.

**Status**: the 2-command expectation is confirmed by the automated evidence in
`command-scope.service.spec` ("removes dev from a deployed run even when the
guild is configured") and `test/command-scope.e2e-spec` ("keeps the admin pair
in the test guild and drops the dev pair when deployed"); the live count is
**not yet observed** and stays open pending a deploy of this branch.

### S3 — Runtime refusal outside the test guild · proves US1/AC7 ✅ executed 2026-10-18

Two halves, both observed.

**Registration scoping.** The second guild (`1561489788027011164`) held **0** guild
commands on the dev application, confirmed by a direct registry read, so research
R8's propagation delay was not in play — nothing was lingering to be invoked.

**Runtime refusal.** Because a cleanly-removed command cannot exercise the guard,
a temporary `/sync` registration (`1561493007818166332`) was written into the
second guild under the dev application to make the command invokable there —
the exact shape T031 exists for: a registration that *should* not be reachable
still is, until propagation or a re-registration removes it. Invoking it
returned, ephemerally:

> These commands only run in the test guild.

which is `TEST_GUILD_REFUSAL` in
`src/modules/admin/test-guild.guard.ts` verbatim. The temporary registration was
deleted immediately afterwards (`0` remaining); the test guild's 8 scoped
registrations were confirmed unchanged, so the out-of-band write never leaked
into the scoped set.

**Catalog state.** No before/after diff is claimed here, because the catalog was
fingerprinted only *after* the invocation rather than before it. What the
refusal's safety rests on is structural and was verified in the source:
`TestGuildGuard.allow()` is the first statement of the handler, ahead of the
`runtime()` lookup and any `BroadcastService` call, so a `false` return cannot
reach a catalog read, write, or message. Post-invocation state was
`epic 2/0 pending, xbox 521/0 pending, subscription 54`. The colocated specs
(`test-guild.guard.spec.ts`, `admin.commands.spec.ts`) assert no
`runtime.*` and no `BroadcastService.send` call in the refusing cases.

### S4 — One message per platform, repeatedly · proves SC-002, SC-006, SC-010 ✅ executed 2026-10-18

Five consecutive `/dev broadcast` invocations in one test-guild channel, against
catalogs of 2 Epic rows and 521 Xbox rows. Operator observations, corroborated by
a catalog read taken afterwards.

| Criterion | Expected | Observed | Verdict |
| --------- | -------- | -------- | ------- |
| SC-002 — messages per run | exactly 1 per platform | **exactly 2 per run** (one Epic, one Xbox), all five runs, never zero-and-stuck | ✅ |
| SC-010 — delivery confined | the invocation channel only | **only the invocation channel**; nothing in `general`, `xbox` or `epic` | ✅ |
| SC-009 — suppression reported | any surplus must be stated | reply read `delivered 1` with **no suppression clause** — correct, since `suppressed` was 0 | ✅ |

**Why the absence of a suppression clause is the correct answer here**, and not a
missed report. `devBroadcast` suppresses only the *surplus* — every eligible row
other than the one picked. With one candidate per platform there is no surplus,
so `suppressed` is 0 and the clause is correctly omitted. FR-015 obliges the
reply to state the count *when rows were marked announced without being
delivered*; stating a count that does not exist would itself violate the
contract (`describe()` in `dev.commands.ts` gates the clause on
`outcome.suppressed > 0`).

**Catalog state after the five runs**: `epic 2 / 0 pending`, `xbox 521 /
0 pending` — fully announced, as FR-006 requires so that consecutive invocations
behave identically. This is *not* evidence that the runs skipped: `devBroadcast`
is deliberately window-free, so it picks a row regardless of `broadcasted`,
flips it to pending unconditionally, and delivers it — net zero pending at the
end of each run. Zero pending is the expected resting state, which is why
SC-002 says "never zero-and-stuck" rather than "starts empty".

**Still open within S4**: SC-006 — the genuine *skip* path, where a platform has
**zero catalog rows** and must report skipped with 0 delivered without failing
the invocation. That requires emptying a catalog first and is recorded separately
below; the five runs above exercise the delivery path, not the skip path. **Since
observed: see SC-006 below.**

### SC-006 — A platform with no catalog rows skips · proves SC-006 ✅ executed 2026-10-19

The skip branch in `devBroadcast`, reached by deleting all four Epic rows and
leaving Xbox at 526 — so one platform genuinely had nothing while the other had
stock. Operator-screenshot observation:

```
Dev broadcast into #general:
Epic Games: skipped (0 delivered)
Xbox Game Pass: delivered 1
```

| Criterion | Expected | Observed | Verdict |
| --------- | -------- | -------- | ------- |
| SC-006 — empty platform | reports skipped, 0 delivered | **`Epic Games: skipped (0 delivered)`** | ✅ |
| SC-006 — invocation survives | the other platform still delivers, no error | **`Xbox Game Pass: delivered 1`**, no error, ephemeral reply intact | ✅ |

**A first staging attempt of this scenario was wrong and was discarded, not
recorded as evidence.** Marking Epic's rows `broadcasted = true` was tried on the
assumption it would make them ineligible; it did not, because `findDevCandidate`
is deliberately `broadcasted`-agnostic (`where: {}`, `order: { id: 'ASC' }`,
`take: 1` in `epic.repository.ts`). It returns the first row whatever its state,
so a catalog holding rows always has a candidate and can never skip. The only
state that yields `null` is a catalog with **zero rows**, which is what SC-006's
"every catalog is empty" means literally. The attempt's own output —
`Epic Games: delivered 1` — is what exposed the mistake.

**Side effect of the staging, recorded because it is real**: four Epic rows were
deleted from the live catalog. The hourly sync (`0 * * * *`) refetches from the
storefront and repopulates; `saveAll` only writes rows the storefront returns, so
the cron cannot resurrect the deleted ids but does restore the catalog itself.

**Also observed incidentally, and it belongs to SC-009** — in the run immediately
preceding this one, the Xbox line read **`delivered 1` with a suppression
clause** (`suppressed 5`), against five pending surplus rows. That is the first
live confirmation that the clause fires *and* states the right number, which S4
could not show because suppression was 0 there. Together the two runs cover both
arms of FR-015: absent when the count is zero, present and correct when it is
not.

### S1–S4 status · 2026-10-18/19 operator run

**Observed**: S1 ✅ (second guild `0`, test guild scoped roots exactly
`sync`/`broadcast`/`dev` = 4 invocable admin/dev commands), the dev
application's global set confirmed empty, S3 ✅ (runtime refusal live, exact
refusal string returned, temp registration cleaned up), S4 ✅ (five runs,
2 messages per run, invocation channel only, suppression correctly absent) and
SC-006 ✅ (a platform with zero catalog rows reports `skipped (0 delivered)`
while the other still delivers, with no error).

**Not yet observed**: S1b, S2 live count, S5, S6, S7. Each is marked above with
why, rather than left unmarked — the record's honesty about what was *not*
observed is the property this record protects.

Automated evidence backing every one of the outstanding scenarios, which is
what CI keeps enforcing:

| Scenario | Criterion              | Automated evidence executed here                                                                                                                                                                                                                                                                                                    | Manual step outstanding                      |
| -------- | ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| S1       | SC-001                 | `command-scope.service.spec` — "pins every root to the test guild in a development run", "scopes to exactly one guild, never to a global registration"; `test/command-scope.e2e-spec` — "pins the admin and dev roots to the test guild in a development run"                                                                       | ✅ observed 2026-10-18 — see S1 above; S1b (revoke `TEST_GUILD_ID`) still open |
| S2       | SC-008                 | `command-scope.service.spec` — "removes dev from a deployed run even when the guild is configured"; `test/command-scope.e2e-spec` — "keeps the admin pair in the test guild and drops the dev pair when deployed"                                                                                                                   | run the image with `NODE_ENV=production`     |
| S3       | SC-001                 | same scope tests as S1 — the `dev`/`sync`/`broadcast` roots are never global                                                                                                                                                                                                                                                        | manual `/sync` in the second guild           |
| S4       | SC-002, SC-006, SC-010 | `generic-platform.spec` — "picks, suppresses, flips to pending, then sends exactly once (R6)", "skips a platform with no catalog rows at all (FR-007)"; `broadcast.service.spec` — "fetches exactly that channel and never queries a subscription (R-4.1)", "keeps the no-recipient path querying subscriptions (R-4.2)" | ✅ observed 2026-10-18/19 — five runs plus a zero-row Epic catalog; see S4 and SC-006 |
| S5       | SC-003, SC-004, SC-009 | `generic-platform.spec` — "never touches broadcast delivery", "clears before it writes, then marks announced", "still clears when a successful fetch returns zero rows"; `dev.commands.spec` — "states how many rows were seeded announced (FR-015)"                                                                                | ⚠️ partial 2026-10-19 — reset reply + catalog state observed on Epic and Xbox; the scheduled-pass silence was lost to a host restart, recorded as not observed |
| S6       | SC-005                 | `generic-platform.spec` — "performs no write when the storefront fetch rejects (R-4.4)"; `dev.commands.spec` — "reports a failed fetch as a failure, not as a reset (FR-010)"                                                                                                                                                       | break the network and compare row counts     |
| S7       | SC-011                 | `dev.commands.spec` — "acknowledges with deferReply before any awaited work (R-5.2, SC-011)" and its FR-017 twin, plus "answers only through editReply — never a second reply (R-5.2)"                                                                                                                                              | a genuinely slow storefront                  |

Research **R8**'s propagation caveat applies to the _removal_ half of S1/S2 and
to post-deploy checklist item 3: a command removed from one guild can stay
visible for up to about an hour, so a stale listing is not evidence of a bug —
refresh the client or wait before judging. What R8 (amended 2026-10-18) now
states explicitly is that the overwrite reaches **only the application its
token belongs to**: stale globals on a second application are never purged by
any boot and have to be cleared by hand.

**Honest status**: S8 executed twice — 2026-10-03 and 2026-10-18. **S1, S3, S4
and SC-006 executed 2026-10-18/19** (second guild created for the run; counts
read from the live registry; runtime refusal provoked with a temporary
registration that was cleaned up afterwards; five consecutive `/dev broadcast`
runs observed by the operator and corroborated by a catalog read; then a
zero-row Epic catalog to reach the skip branch). **S5 partially observed**
2026-10-19: its reset reply count (SC-009) and catalog state (SC-004) were
observed on *both* platforms, but its scheduled-pass silence (SC-003) was lost
when the host session restarted during the measurement — recorded as not
observed rather than inferred. Still open: S1b, S2's live count (blocked on a
deploy of this branch — the running image is `v3.4.0`, which predates it), S6,
and S7, each marked with its reason above rather than left unmarked.
Convergence tasks **T033** and **T036** track the remainder. Nothing in this
record claims an observation that was not made.
