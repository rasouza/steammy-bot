# Data Model: Nest 12 Toolchain and ESM Migration

**Branch**: `002-nest12-esm-toolchain` | **Date**: 2026-09-29
**Input**: [spec.md](./spec.md), [plan.md](./plan.md), [research.md](./research.md)

## Domain data delta: NONE

This feature changes no data. Verified against FR-011 / SC-005:

- **No entity** gains, loses, or changes a field; no table, index, or constraint changes.
- **No migration** is added, and the sole permitted migration edit is FR-002's one-line
  `import type` marking — `InitSchema1790514243494` keeps its SQL, class logic, and ordering,
  and remains the only migration.
- **No schema change**: `steammy_bot` stays hardcoded; the `migrations` bookkeeping table keeps
  its semantics (`migrationsRun: true` on boot, `db:init` as the one-time prerequisite).
- **No state transition changes**: game rows keep `broadcasted` persisted in the same order as
  today — the `broadcasted`-before-`send` ordering defect is explicitly out of scope and MUST
  NOT be "fixed while in there".

Consequently there are no new entities, validation rules, or state machines to spec. What
follows is the *artifact and invariant model* the design turns on — the relationships this
migration is actually about.

## 1. Build artifact model

```text
src/**/*.ts ── nest build (tsc, deleteOutDir wipes dist/) ──▶ dist/**/*.js
      │                                                        │
      │                                                        ├─ dist/main.js               (bootable entry)
      │                                                        ├─ dist/database/*.js         (incl. data-source-options.js)
      │                                                        └─ dist/database/migrations/*.js  ← emitted by the SAME build
      │
      └── tsx (from source) ── src/database/migrations/*.ts    (db:init, typeorm CLI)
```

**Invariants** (FR-008/009/010):

| # | Invariant | Enforcement |
|---|---|---|
| A1 | One documented build command (`npm run build`) emits *both* bootable output and compiled migrations — single pass, standard compiler | No `builder` key, no second script segment |
| A2 | Compiled migrations contain **zero `import` statements** after this migration | `verbatimModuleSyntax` erases all `import type`; asserted locally + in CI |
| A3 | Output dir is wiped every build ⇒ migrations must be *emitted*, never copied | `deleteOutDir: true` kept; `assets` forbidden |
| A4 | A build without loadable migrations is a **FAILED** build even at exit 0 | Explicit assertion: `dist/database/migrations/*.js` exists AND has no `import` |
| A5 | Anchor resolves per runtime context — search expression not hardcoded | `import.meta.dirname` in `data-source-options.ts` (FR-003) |

**Runtime contexts the anchor must satisfy** (plan Phase 0.2 table):

| Context | anchor resolves to | glob target | loader |
|---|---|---|---|
| tsx from source | `src/database` | `src/database/migrations/*.ts` | tsx ESM hook |
| built (`node dist/main`) | `dist/database` | `dist/database/migrations/*.js` | typeorm dynamic `import()` |
| watch (`nest start`) | `dist/database` | `dist/database/migrations/*.js` | typeorm dynamic `import()` |

## 2. Import classification model

Every relative specifier in `src/` and `test/` is classified exactly once. The classification
determines its edit; a misclassification is a defect with a specific failure signature:

| Class | Count | Edit | If wrong |
|---|---|---|---|
| Concrete value import | 50 sites (of 69) | append `.js` | TS2307 at typecheck (loud) |
| …of which `src/shared/constants` (a **file**, not a barrel) | 5 of those 50 | plain `.js` — **never** `/index.js` | TS2307 at typecheck (loud) |
| Barrel (directory) import | 19 sites: config 4, entities 10, types 5 | append `/index.js` | TS2307 at typecheck (loud) |
| Type-only import | 15 symbols / 9 statements | mark `import type` (TS1484-driven) | link-time `SyntaxError` at first boot / module load — typecheck stays **green** (silent) |

The two silent-risk rows are why `verbatimModuleSyntax: true` is non-negotiable (Clarifications
Q3) and why phases 4–6 must land together (FR-013).

**Type-only symbols inventory** (enumerated by
`tsc --noEmit --verbatimModuleSyntax 2>&1 | grep TS1484`; full table in the plan document):
pure-type barrel `src/shared/types` (10 symbol reports over its 5 import statements —
`Game` ×5, `EpicGame`, `EpicApiGame`, `FreeGamesPromotionApiResponse`, `XboxApiGame`,
`XboxCatalogIdResponse`),
`MigrationInterface` + `QueryRunner` from `typeorm` (absent from its ESM export allow-list),
plus `ConfigService`, `INestApplication`, and related test/DI type imports.

## 3. Test suite membership model

| Suite | Membership | Must exclude | Runner entry |
|---|---|---|---|
| unit | `src/**/*.spec.ts` (colocated; today: `game-embed.service.spec.ts`) | `**/*.e2e-spec.ts`, `node_modules`, `dist`, `build` | `vitest.config.ts` → `npm test` |
| e2e | `test/**/*.e2e-spec.ts` (today: `health.e2e-spec.ts`) | `node_modules`, `dist`, `build` | `vitest.config.e2e.ts` → `npm run test:e2e` |

**Transition rule**: membership may change *only* by adding a file with the right suffix; no
spec may satisfy both membership predicates (SC-004: 0 cross-suite, 0 build/dependency files
scanned).

## 4. Linter finding model (baseline transition)

| Severity | Before (eslint, CI read-only) | After (oxlint, CI read-only) |
|---|---|---|
| errors | 0 (must stay 0) | 0 (must stay 0) |
| warnings | 22 (`no-unsafe-*`, stale figure) | **unknown → measured once on the migrated tree**, recorded in governance docs (SC-006) |
| files modified by CI lint run | 0 | 0 (no `--fix` in CI) |

## 5. Governance state transition

| Artifact | Before | After (same change, pre-merge) |
|---|---|---|
| constitution | v2.0.0 — mandates eslint step, names Jest | ≥3.0.0, **maintainer-approved bump** — CI sequence, test-location rule, migration-delivery clause, measured baseline, stack declaration (FR-017) |
| AGENTS.md | partially revised (toolchain paragraph fixed 2026-09-29) | no retired-tool instructions remain; references this feature's plan (SC-008) |
| README | names eslint/Jest/ts-node | names oxlint/Vitest/tsx; documents decorator-metadata test constraint |
