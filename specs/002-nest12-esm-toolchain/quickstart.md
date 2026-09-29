# Quickstart: Validating the Nest 12 Toolchain and ESM Migration

**Branch**: `002-nest12-esm-toolchain` | **Date**: 2026-09-29
**Input**: [spec.md](./spec.md) (US1–US3, SC-001–009), [contracts/toolchain-commands.md](./contracts/toolchain-commands.md),
[data-model.md](./data-model.md)

This is the runnable validation path — it proves the feature end to end without duplicating
mechanics (see the contract table for each command's guarantees and the plan document for
implementation steps).

## Prerequisites

- Node `24.21.0` (`.nvmrc`); `npm install --ignore-scripts` (necord's postinstall crashes on
  Windows).
- A **scratch** Postgres reachable at your local dev DSN — never production (SC-009).
- No Discord token needed for any step below except an optional live boot.
- `bash`, `git`, `jq` on PATH (Spec Kit scripts; CI scripts stay bash per AGENTS.md).

```bash
git checkout 002-nest12-esm-toolchain   # or the worktree containing it
npm install --ignore-scripts
createdb steammy_scratch                # or any scratch database
```

## 1. The six-step verification gate (SC-001: 6/6)

```bash
npx prettier --check "src/**/*.ts" "test/**/*.ts"   # 1 — exit 0
npm run type:check                                  # 2 — exit 0 (type authority)
npm run lint                                        # 3 — 0 errors, 0 files changed
npm run build                                       # 4 — emits dist/ (see §2)
npm test                                            # 5 — exactly the unit spec(s)
npm run test:e2e                                    # 6 — exactly the e2e spec(s)
```

Expected: all six exit 0 **in order**; a partial pass is a fail. Step 3 must report a
measured warning count recorded in governance docs (SC-006) and must not modify any file.

Focus checks (US2.3):

```bash
npm test -- game-embed     # runs only that spec
npm test -- -t "pattern"   # runs only matching tests
```

## 2. Build-output assertion — the silent-failure gate (FR-009/010, US1.2)

```bash
npm run build
ls dist/main.js dist/database/migrations/1790514243494-InitSchema.js
grep -c "^import" dist/database/migrations/1790514243494-InitSchema.js || true
```

Expected: both files exist; the compiled migration contains **zero** `import` statements.
If the migration file is missing, the build FAILED even though tools exited 0.

## 3. Migrations on an empty database (US1, SC-002/003/007)

```bash
# from source (tsx) — 2/2
npm run db:init && npm run db:init
npm run migration:run && npm run migration:run

# built artifact boots and applies schema (1/1) — point the app at the scratch DB
npm run start:prod        # against scratch Postgres; or: node dist/main
```

Expected: scratch DB ends with the `steammy_bot` schema + migration bookkeeping table; second
runs succeed without error. Equivalent e2e proof without a DB: `npm run test:e2e` exercises
the health path via `Test.createTestingModule`.

## 4. Container path (SC-007)

```bash
docker build -t steammy:esm .
docker run --rm -e DATABASE_*... steammy:esm   # against scratch Postgres only
```

Expected: image builds with **no Dockerfile change**, boots, and the schema exists afterward.
Migrations run at container boot — no separate migrate step.

## 5. Zero-behavior-delta diff (US1.4, SC-005)

```bash
git diff main -- src/database/migrations/          # expected: ONLY the FR-002 `import type` line
git diff main -- src/config/env.schema.ts src/database/data-source.ts src/database/database.module.ts   # expected: no semantic change (FR-012)
git diff main -- src/modules/broadcast/ test/              # expected: specifier / import type edits only — no logic, ordering, or test-behavior changes
```

Expected: 0 migration files added; the sole migration edit is the `import type` line; 0 schema
differences; broadcast ordering untouched; all pre-existing tests pass without test-logic
changes (they construct services directly — no DI boot).

## 6. Docs and governance sweep (US3, SC-008)

```bash
grep -rn -E "jest|ts-jest|eslint|ts-node\b|npx eslint" README.md AGENTS.md .specify/memory/constitution.md
grep -rn "Rspack" README.md AGENTS.md
```

Expected: no retired-tool instructions remain (historical/decision-record references in the
plan document and spec clarifications are fine); constitution carries a maintainer-approved
version bump ≥3.0.0; README command table names oxlint/Vitest/tsx and documents the
decorator-metadata test constraint.

## Pass/fail summary

| Signal | Required |
|---|---|
| Gate steps 1–6 | 6/6 (SC-001) |
| Empty-DB boot creates schema | 100% (SC-002) |
| `migration:run` ×2 | 2/2 (SC-003) |
| Suite bleed / dist scanning | 0 (SC-004) |
| Behavior deltas vs `main` | 0 (SC-005) |
| Lint errors / files modified | 0 / 0 (SC-006) |
| Container build+boot; DB scripts 4/4 | 1/1 (SC-007) |
| Retired-tool references | 0 (SC-008) |
| Production resources touched | 0 (SC-009) |
