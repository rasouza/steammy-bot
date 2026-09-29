# Contract: Toolchain Commands

**Branch**: `002-nest12-esm-toolchain` | **Date**: 2026-09-29
**Input**: [spec.md](../spec.md) (US2, FR-005/006/007/014), [data-model.md](../data-model.md)

This feature exposes no HTTP API or library surface — its external interface is **the command
set**: what CI runs, what contributors run, and what the container runs. This contract fixes
those commands' guarantees so implementation and CI edits can be verified against it.

## 1. Verification gate (the definition of done — FR-013, SC-001)

Run in this exact order; 6/6 required, a partial pass is a fail:

| # | Command | Contract |
|---|---|---|
| 1 | `npx prettier --check "src/**/*.ts" "test/**/*.ts"` | Read-only; exit 0 iff formatting clean. **Unchanged by this feature.** Fails on every file if line endings became CRLF — fix line endings, not the config. |
| 2 | `npm run type:check` (`tsc --noEmit -p tsconfig.json`) | Read-only; exit 0; typechecks specs too. Remains the **type authority** (FR-006). Under `verbatimModuleSyntax`: TS2307 ⇒ missed specifier; TS1484 ⇒ unmarked type-only import. |
| 3 | `npm run lint` (oxlint, type-aware, **no `--fix`**) | Read-only: **0 errors, 0 files modified**; warnings allowed and re-measured once (SC-006). Replaces the eslint step; CI must invoke it without `--fix`. |
| 4 | `npm run build` (`nest build`) | Wipes `dist/`, then emits per-file tree **including `dist/database/migrations/*.js`** in one pass. Source tree untouched. |
| 5 | `npm test` | Unit suite only: exactly the unit spec(s); e2e spec NOT collected; nothing under `dist/`/`build/`/`node_modules` scanned (SC-004). Exit 0. |
| 6 | `npm run test:e2e` | e2e suite only: exactly the e2e spec(s); same exclusion guarantees. Exit 0. Needs neither DB nor Discord token. |

**Build-output assertion (gates 4's companion — FR-010/014):** after step 4,
`dist/database/migrations/*.js` exists AND contains no `import` statement. A build that fails
this is a FAILED build regardless of exit codes — asserted locally and as a CI step.

## 2. Focus/filter contract (US2.3)

- `npm test -- game-embed` → runs only the spec whose path/name matches the filter.
- `npm test -- -t "name"` → runs only tests whose name matches.
- Equivalent filters must work on the e2e command.

## 3. Database script contract (FR-007, SC-003/007)

| Command | Contract |
|---|---|
| `npm run db:init` | Runs **from source via tsx**, outside the app process; loads env itself via `loadEnv()` (split preserved); creates the `steammy_bot` schema + `migrations` table. Must be run **once per database** before any `migration:run`. Idempotent enough to succeed when re-run (2/2). |
| `npm run migration:run` | TypeORM CLI via `node --import tsx`; same from-source path; applies pending migrations; **succeeds twice in a row** against the same DB (SC-003, 2/2). |
| `npm run typeorm …` | Same runner and env-loading rules as `migration:run`. |

Total required invocations during verification: **4/4** (init ×2, migrate ×2) against a
scratch database (SC-007/SC-009).

## 4. Container contract (FR-015)

| Phase | Contract |
|---|---|
| build | `docker build` succeeds **without any new file copied into the image** (no new tsconfig/config under the builder stage — Dockerfile unchanged). |
| boot | Runtime stage contains prod deps + `dist/` only; migrations run at container boot (`migrationsRun: true`); **no deploy-time migrate step**; boot against an empty DB leaves the full schema present (SC-002, 1/1). |
| startup behavior | Unchanged — env handling, `NODE_ENV` gating, and log behavior identical to today. |

## 5. CI workflow contract (FR-014)

`.github/workflows/build.yml` keeps: step order, `prettier --check` and `type:check` steps
byte-identical, `npm ci --ignore-scripts`, PR/dispatch triggers. Changes: lint step runs
`npm run lint` read-only; gains the compiled-migrations assertion after `npm run build`; the
database job's script runs exercise the same from-source tsx path developers use locally.

`.github/workflows/release.yml` chain (ci → release → publish → Coolify ping): **untouched**.

## 6. Forbidden operations (negative contract)

- No `--fix`/`-Fix` flags in any CI lint invocation.
- No bundler, no second compilation step, no `assets` copy of migrations (FR-008).
- No production database, no production Discord credentials during verification (SC-009).
- No edits to migration files, schema, broadcast ordering, `envSchema`, `NODE_ENV` defaulting,
  or the `loadEnv()` split (FR-011/012).
- No commits containing `easy_add_platform` work (FR-018).
