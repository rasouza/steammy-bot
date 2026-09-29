# Quickstart Validation Guide: Easy Add Platform

**Branch**: `003-easy-add-platform` | **Date**: 2026-09-29
**Input**: [spec.md](./spec.md), [contracts](./contracts/platform-contracts.md), [data-model](./data-model.md)

Validation runs in layers. Run them in order; each layer must pass before the next is
meaningful. This is a run/verify guide — implementation steps live in `tasks.md`.

---

## 0. Prerequisites

```bash
node --version        # >= 24.15.0 (nvm uses .nvmrc → 24.21.0)
npm install --ignore-scripts    # necord's postinstall crashes on Windows without this
```

- **No production credentials needed for steps 1–3.** (Spec Story 4)
- Local app runs (step 4) need a *development* Discord application + test server and a
  *development* database — never production (Constitution, plan §16).

## 1. Full CI gate (Constitution IV — definition of done)

```bash
npx prettier --check "src/**/*.ts" "test/**/*.ts"
npm run type:check
npm run lint          # read-only; never add --fix here
npm run build
npm run test:cov      # same suite as `npm test` + coverage; CI uploads lcov (informational)
npm run test:e2e
```

**Expected**: all six exit 0, in this order. Lint shows the usual 22 `no-unsafe-*` warnings,
0 errors. Any step failing ⇒ not done.

## 2. Architecture unit tests (proves FR-016 / contracts §8)

```bash
npm test -- generic-platform      # lifecycle: sync, announce success, failure-not-marked, empty queue
npm test -- repository            # Epic 4-case eligibility + Xbox rule (exact spec pattern)
npm test -- scheduler             # one storefront throws → remaining storefronts still run
npm test -- broadcast             # retry ordering: send-before-mark; total failure stays pending
```

**Expected**: each focused suite passes with tests colocated under `src/` (they must be
collected — a spec outside the glob would silently "pass" by not running, Constitution V).

**Structural spot-check** (spec SC-001/SC-006 ingredients):

```bash
grep -rn "if (platform ===" src/                  # expect: no matches in shared services
grep -rn "broadcastEpic\|broadcastXbox\|cronEpic\|cronXbox" src/   # expect: no matches
grep -rln "CatalogEpic\|CatalogXbox" src/modules/broadcast/        # expect: no matches
grep -rn "shared/" src/                            # expect: no matches (src/shared/ retired, R11)
```

## 3. Registration-level dry run (proves the developer-experience story)

Without writing a real storefront, confirm the seam exists (contracts §2–§3):

1. Read `docs/platform-integration.md` (FR-018) start to finish.
2. Check that its steps mention **only**: creating the three platform files, adding a
   definition entry to the registry file, and running the verification commands.
3. Check it never mentions editing `generic-platform`, `broadcast.service`,
   `platform.scheduler`, Epic, or Xbox files.

**Expected**: a non-author could follow it without opening the generic lifecycle (Story 1
independent test, SC-006).

## 4. Local end-to-end (development environment only)

```bash
# .env — development values only:
#   BOT_TOKEN=<dev bot>  DATABASE_*=<dev db>  BROADCAST_ENABLED=false
npm run db:init        # once per dev database
npm run start:dev
```

**Expected**:
- Boots with zero production credentials (Story 4, scenario 1).
- Sync crons/commands populate the dev catalog; **no Discord message is ever sent** while
  `BROADCAST_ENABLED=false`, and no game's `broadcasted` flag changes (A-007).
- Logs show the two generic passes (sync hourly, announce hourly) with storefront names
  coming from registration data.

### 4b. Delivery exercise (deliberate opt-in)

Set `BROADCAST_ENABLED=true`, subscribe a channel in the dev server via `/subscribe`, then:

- `/sync epic` (or `xbox`) → reply `... catalog synchronized successfully.`
- `/broadcast epic` → reply `Broadcasted N games for **Epic Games**.` with N = games actually
  announced; message text/embed identical to pre-refactor (SC-002).
- **Failure drill**: temporarily break delivery (e.g. remove the bot's send permission in the
  test channel and make it the only subscriber) → `/broadcast` must leave the game pending:
  re-running `/broadcast` after fixing permissions announces it exactly once (SC-003,
  Story 2).

## 5. Regression comparison (SC-002)

On the dev database, before/after the refactor (or vs. production data snapshot):

```sql
-- Eligibility sets must match the old hand-rolled queries exactly:
SELECT id FROM catalog_epic WHERE broadcasted = false
  AND offer_start_at <= now() AND offer_end_at >= now();
SELECT id FROM catalog_xbox WHERE broadcasted = false;
```

**Expected**: the games the new announce pass picks equal these rows; message text, embed, and
target channels unchanged. Also verify no duplicate ids per catalog (upsert invariant, data
model §"Persistence operations").

## 6. Done checklist

- [ ] All six CI steps green (step 1)
- [ ] All four focused unit suites green (step 2)
- [ ] Structural greps clean (step 2)
- [ ] `docs/platform-integration.md` passes the non-author review (step 3)
- [ ] Local run works with no production credentials and broadcast disabled (step 4)
- [ ] Failure drill: failed delivery ⇒ retried; success ⇒ announced exactly once (4b)
- [ ] Eligibility parity query returns identical sets (step 5)
