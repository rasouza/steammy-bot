# Bug Verification: Skip subscriptions of soft-deleted guilds in BroadcastService

- **Slug**: broadcast-stale-subscriptions
- **Tested**: 2026-09-29
- **Assessment**: ./assessment.md
- **Fix**: ./fix.md
- **Result**: verified

## Summary

The reproduction was re-exercised as an automated equivalent against **real
database rows and the real compiled service** (`dist/`): the TypeORM query
added by the fix populates `guild.deleted`, all 20 soft-deleted-guild Xbox
subscriptions are skipped (0 channel fetches, 20 `debug` skip lines, 0 WARN
lines), and all 29 live-guild subscriptions are still fetched — so the guard
removes the symptom without over-filtering. The new unit tests, the full unit
suite, e2e, build, lint, type-check and Prettier all pass; no regressions.

## Checks Performed

| Check | Command / Action | Result | Notes |
|-------|------------------|--------|-------|
| Reproduction (post-fix, automated equivalent) | `node .specify/bugs/broadcast-stale-subscriptions/verify-repro.mjs` | pass | 6/6 assertions; real DB rows + real `BroadcastService` from `dist/`, stub Discord client, read-only SELECTs only |
| Relation query shape (real TypeORM) | same script — `find({ where, relations: { guild: true } })` vs raw `JOIN` | pass | 49/49 Xbox rows carry a populated `guild.deleted`, values agree with the raw JOIN |
| Reproduction (live production run) | hourly cron with real Discord sends | skipped | Needs the deployed bot posting real messages to real guilds; would be a live side effect, not run without consent |
| New / updated tests | `npx vitest run src/modules/broadcast/broadcast.service.spec.ts` | pass | 1 file, 3 tests |
| Regression suite (unit) | `npm test` | pass | 2 files, 9 tests |
| Regression suite (e2e) | `npm run test:e2e` | pass | 1 file, 1 test |
| Build | `npm run build` | pass | `nest build` exit 0 |
| Type-check | `npm run type:check` | pass | `tsc --noEmit` exit 0 |
| Lint | `npm run lint` | pass | exit 0, 22 warnings — the documented clean-tree baseline, none in `src/modules/broadcast/` |
| Format | `npx prettier --check "src/**/*.ts" "test/**/*.ts"` | pass | all files |
| No source modified by this command | `git status --short` | pass | only the pre-existing fix (`broadcast.service.ts`, new spec) and `.specify/` artifacts are listed |

## Output Excerpts

```
== Summary ==
xbox subscription rows (real DB):     49
  live guilds:                        29
  soft-deleted guilds (the bug):      20
pre-fix fetch() calls per broadcast:  49  (=> ~20 WARN lines)
post-fix fetch() calls per broadcast: 29

== Checks ==
PASS  relations:{guild:true} populates guild.deleted (real TypeORM query)  [49 xbox rows returned, 49 carry a guild relation]
PASS  relation values match a raw JOIN cross-check  [49/49 rows agree]
PASS  no channel fetch for any soft-deleted-guild subscription  [0 of 20 orphan rows fetched]
PASS  every live-guild subscription is still fetched (guard not over-filtering)  [fetched 29, live rows 29]
PASS  one debug skip line per ignored orphan row  [debug lines 20, orphan rows 20]
PASS  no WARN lines emitted for the ignored orphan rows  [captured WARN lines: 0]

RESULT: PASS   (exit=0)
```

```
npx vitest run src/modules/broadcast/broadcast.service.spec.ts
 Test Files  1 passed (1)
      Tests  3 passed (3)

npm test
 Test Files  2 passed (2)
      Tests  9 passed (9)

npm run test:e2e
 Test Files  1 passed (1)
      Tests  1 passed (1)
```

## Residual Risks

- **Production not exercised**: the fix has not been deployed. The live check
  (hourly cron against real Discord) was skipped deliberately — it would post
  real messages. Confirm after the first production run that the WARN count
  drops from ~29 to ~9.
- **Stubbed Discord client in the reproduction**: the repro proves the *skip*
  (no `fetch()` is ever issued for orphan rows); it does not re-create
  Discord-side REST failures, because a stub channel was returned for every
  fetched ID. The unit test `still warns when a live guild channel cannot be
  fetched` covers that half with a rejecting fetch.
- **Xbox path only**: 49 Xbox rows were driven through `send()`. The Epic path
  uses the identical `send()` method (5 Epic rows remain in the table), but was
  not executed in this run.
- **The 9 residual WARN sources remain** — dead channels / revoked permissions
  inside guilds the bot is still in (`guild.deleted = false`). Explicitly out
  of scope per the assessment; needs its own bug if desired.
- **Script iteration**: the first run of `verify-repro.mjs` under-reported the
  `debug` line count because Nest's `ConsoleLogger` writes to `process.stdout`
  rather than `console.*`; the capture was corrected in the script (a file
  inside this bug directory). No source code was touched — `git status` is
  unchanged from the fix run.

## Recommendation

**Close the bug — verified.** The symptom's mechanism is reproduced against
real data and shown to be gone with the fix in place, the guard does not drop
any live target, and the full CI-style suite (format, type-check, lint, build,
unit, e2e) is green. Keep the one post-deploy check on the list: inspect the
first hourly broadcast's logs and expect ~9 WARN lines instead of ~29; if the
count does not drop, reopen with the captured logs and re-run
`/speckit.bug.assess`.
