---
description: "Task list for the Nest 12 toolchain and ESM migration"
---

# Tasks: Nest 12 Toolchain and ESM Migration

**Input**: Design documents from `/specs/002-nest12-esm-toolchain/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/toolchain-commands.md, quickstart.md

**Tests**: TDD test-writing tasks are NOT included — the spec does not request them, and
SC-005 requires all pre-existing tests to pass with no test-logic changes (mechanical
specifier/`import type` edits per FR-001/FR-002 excepted). Verification tasks (gate runs,
assertions, isolation checks) stand in for them; every user story carries an Independent Test.

**Organization**: Tasks are grouped by user story so each story can be implemented and tested
independently.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: Which user story this task belongs to (US1, US2, US3); absent in Setup,
  Foundational, and Polish phases
- Exact file paths are given in every description.

## Path Conventions

Single project: `src/`, `test/` at repository root. Root-level config files
(`vitest.config.ts`, `.oxlintrc.json`, `package.json`, `tsconfig.json`) are the primary change
surface — see plan.md *Project Structure*.

**Atomicity rule (FR-013)**: T010–T014 are one interdependent batch — specifiers, type-only
marking, the `verbatimModuleSyntax` flag, the migration anchor, and the `"type": "module"`
flip MUST land together; the gate is re-run only after the batch, never mid-batch.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Dependencies and a recorded baseline before anything changes

- [ ] T001 Run `npm install --ignore-scripts` (necord postinstall crashes on Windows) and capture the baseline: execute the current six-step gate (`npx prettier --check "src/**/*.ts" "test/**/*.ts"`, `npm run type:check`, `npx eslint "{src,apps,libs,test}/**/*.ts"`, `npm run build`, `npm test`, `npm run test:e2e`) on the untouched tree and record results — including the current eslint warning count (22) as the pre-migration baseline — in the PR description
- [ ] T002 Add the five toolchain devDependencies to `package.json` → `devDependencies`: `vitest`, `@vitest/coverage-v8`, `oxlint`, `oxlint-tsgolint`, `tsx` (specifiers per plan.md Phase 2 *Dependencies*); remove nothing yet
- [ ] T003 Add `dotenv` to `package.json` → `dependencies` (FR-007: declared, not an accidental transitive of `@nestjs/config`/`typeorm`)

**Checkpoint**: Setup complete — new toolchain available, baseline recorded

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Swap the two runners that every user story's Independent Test depends on. The
ESM flip (US1) would break Jest (ESM-hostile, research R2) and `ts-node`, so both must be
replaced while the tree is still CommonJS — each step leaves the six-step gate green (FR-013).

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [ ] T004 [P] Create `vitest.config.ts` at repository root per docs plan Phase 3: `root: './'`, `include: ['**/*.spec.ts']`, `exclude: ['**/*.e2e-spec.ts', '**/node_modules/**', '**/dist/**', '**/build/**']`, `globals: true` (existing specs use bare `describe`/`it`/`expect` and must pass without test-body rewrites — SC-005), `test.environment: 'node'`, coverage `provider: 'v8'`, `reportsDirectory: './coverage'`, coverage `include: ['src/**/*.ts']`; no `vite-tsconfig-paths` (Clarifications Q2 — zero path aliases, forbidden) — per research R3 and data-model.md §3
- [ ] T005 [P] Create `vitest.config.e2e.ts` at repository root per docs plan Phase 3: `include: ['**/*.e2e-spec.ts']`, the same **non-source** excludes only (`**/node_modules/**`, `**/dist/**`, `**/build/**` — never `**/*.e2e-spec.ts`, which would exclude the suite's own files), `globals: true`, `environment: 'node'` — per data-model.md §3
- [ ] T006 In `package.json` → `scripts`, replace the five Jest scripts with Vitest per plan.md Phase 2 *Scripts table*: `test`, `test:watch`, `test:cov` (coverage to `./coverage`), `test:e2e` (→ `vitest run --config vitest.config.e2e.ts`), and `test:debug` (must drop `tsconfig-paths/register` and `ts-node/register`); then grep for remaining `tsconfig-paths` usage and, if none outside `test:debug`, remove the `tsconfig-paths` devDependency (depends on T004, T005)
- [ ] T007 Remove Jest in one atomic change: delete the `"jest"` block from `package.json`, remove devDeps `jest`, `ts-jest`, `@types/jest`; in `tsconfig.json` change `"types": ["node", "jest"]` (line 13) to `"types": ["node", "vitest/globals"]`; delete `test/jest-e2e.json` (depends on T004–T006 — the `types` edit and `@types/jest` removal must land together or `type:check` breaks)
- [ ] T008 Swap database scripts to tsx in `package.json` → `scripts` per plan.md Phase 2 *Scripts table*: `typeorm` (currently `typeorm-ts-node-commonjs -d src/database/data-source.ts` → node + tsx per plan) and `db:init` (`ts-node src/database/scripts/create-schema.ts` → `tsx …`); remove the `ts-node` devDependency; remove the `"ts-node"` block (line 25) from `tsconfig.json`. The CI database job (`.github/workflows/build.yml` lines 89–98) calls these script names unchanged, so it is automatically rerouted to tsx (FR-014)
- [ ] T009 Foundational checkpoint: run the full six-step gate plus `npm run db:init` against a scratch Postgres — all green on Vitest + oxlint-pending + tsx while the tree is still CommonJS (FR-013)

**Checkpoint**: Foundation ready — user story implementation can now begin

---

## Phase 3: User Story 1 - Identical behavior after migration, migrations still applied on boot (Priority: P1) 🎯 MVP

**Goal**: Native ESM end to end with zero behavior change — the built app still applies the
database schema when it boots against an empty database.

**Independent Test**: `npm run build`; assert `dist/database/migrations/1790514243494-InitSchema.js`
exists with zero `import` statements; boot against an empty scratch Postgres → `steammy_bot`
schema present; `migration:run` twice succeeds; git diff shows 0 migration/schema/broadcast/test
changes.

### Implementation for User Story 1

- [ ] T010 [US1] Sweep explicit ESM specifiers across all 29 files under `src/` and `test/` per plan.md Phase 4 import audit (68 total = 49 concrete + 19 barrels): append `.js` to the 49 concrete relative specifiers — among them the 5 `src/shared/constants` sites, which take a **plain `.js`** because it is a file, not a barrel (AGENTS.md hazard note) — and append `/index.js` to the 19 directory-barrel imports (`src/config/index` ×4, `src/database/entities/index` ×10, `src/shared/types/index` ×5)
- [ ] T011 [US1] In `tsconfig.json` enable `"verbatimModuleSyntax": true` (keep `"types": ["node", "vitest/globals"]` from T007), then enumerate the type-only imports with `npm run type:check 2>&1 | grep TS1484` (Windows: use `2>&1 | findstr TS1484`) — per plan.md Phase 5
- [ ] T012 [US1] Mark every TS1484-reported symbol `import type` (15 symbols / 12 statements per plan.md Phase 5 table): the pure-type barrel `src/shared/types`, `MigrationInterface` + `QueryRunner` (absent from typeorm's ESM export allow-list — value-import throws at link time, Clarifications Q3), `INestApplication`, `ConfigService`, and the rest of the enumerated list — across `src/`, `test/health.e2e-spec.ts`, and the migration file (depends on T011)
- [ ] T013 [US1] Replace `__dirname` with `import.meta.dirname` at the migration-glob anchor `src/database/data-source-options.ts` (~line 13) and any further sites listed in plan.md Phase 6, updating the JSDoc to the three-context table (plan.md Phase 0.2) — the search expression must not be hardcoded to one context (FR-003)
- [ ] T014 [US1] Add `"type": "module"` to `package.json` — landing together with T010–T013 as one commit (FR-013 atomicity rule above), then re-run the full six-step gate (FR-001)
- [ ] T015 [US1] Build-output assertion: run `npm run build`, then verify `dist/main.js` and `dist/database/migrations/1790514243494-InitSchema.js` both exist and `grep`/`findstr` shows **zero** `import` statements in the compiled migration — a build failing this is FAILED regardless of exit codes (FR-009, FR-010, data-model.md invariants A1–A4)
- [ ] T016 [US1] Boot verification: start the built app (`node dist/main`) against an empty scratch Postgres only (SC-009) and confirm the `steammy_bot` schema + migration bookkeeping table exist (SC-002); while booting, watch the CJS-ESM interop list in runtime logs — chalk default imports, object-mapper, necord (research R9)
- [ ] T017 [US1] Add the compiled-migrations guard to `.github/workflows/build.yml` immediately after the `npm run build` step (line ~39): assert `dist/database/migrations/*.js` exists and contains no `import` statement (FR-014) — the cheap CI insurance retained from Clarifications Q1
- [ ] T018 [US1] US1 checkpoint: run the full six-step gate (FR-013) plus a semantic zero-delta review: `git diff main` must contain **only** mechanical ESM edits (`.js`/`/index.js` specifiers, `import type` markings, `import.meta.dirname`) — `src/database/migrations/` changes by exactly FR-002's one `import type` line, `src/broadcast/` and `test/` show specifier/`import type` edits only with no logic or ordering change, `src/config/env.schema.ts`, `src/database/data-source.ts` and `src/database/database.module.ts` show no semantic change (passthrough, no `NODE_ENV` default, `loadEnv` split — FR-012), and no file is added or deleted beyond the T004/T005/T019 configs (FR-011, SC-005)

**Checkpoint**: User Story 1 fully functional — the migrated tree boots and applies schema exactly as before

---

## Phase 4: User Story 2 - The standard command set works end to end (Priority: P2)

**Goal**: Every standard command — lint, tests, coverage, focus filters, database scripts —
runs on the single supported toolset with the prescribed guarantees.

**Independent Test**: Run the six-step gate in order (6/6), the focus filters, the isolation
checks, and the 4/4 database invocations against a scratch database.

### Implementation for User Story 2

- [ ] T019 [P] [US2] Create `.oxlintrc.json` at repository root: port the rules from `eslint.config.mjs` one-for-one — `typescript` + `vitest` plugins, type-aware mode via `oxlint-tsgolint`, `no-unsafe-*` family as **warnings** (the `object-mapper` untyped-mapping rationale), `no-explicit-any: off`, unused-vars patterns (`argsIgnorePattern`/`varsIgnorePattern`/`caughtErrorsIgnorePattern`, `ignoreRestSiblings`) — per research R4 and FR-006
- [ ] T020 [US2] In `package.json` → `scripts`, change `lint` (currently `eslint … --fix`) to the read-only type-aware oxlint invocation per plan.md Phase 2 *Scripts table* — no `--fix`; it must behave exactly as CI runs it (FR-006)
- [ ] T021 [US2] Remove ESLint: delete `eslint.config.mjs`; remove devDeps `eslint`, `@eslint/js`, `@eslint/eslintrc`, `eslint-config-prettier`, `eslint-plugin-prettier`, `typescript-eslint` from `package.json`, and `globals` too **only after** grepping to confirm nothing else uses it (depends on T019, T020)
- [ ] T022 [US2] Update `.github/workflows/build.yml` line 36: `npx eslint "{src,apps,libs,test}/**/*.ts"` → `npm run lint` (read-only oxlint), keeping step order and every other step byte-identical — `prettier --check` and `type:check` unchanged (FR-014)
- [ ] T023 [US2] Focus-filter verification: `npm test -- game-embed` runs only `src/modules/broadcast/game-embed.service.spec.ts`, and `npm test -- -t "pattern"` runs only matching tests (US2 scenario 3)
- [ ] T024 [US2] Suite-isolation verification: `npm test` executes exactly the 1 unit spec and `npm run test:e2e` exactly the 1 e2e spec — 0 cross-suite specs, 0 files scanned from `dist/`, `build/`, or `node_modules/` (SC-004)
- [ ] T025 [US2] Coverage verification: `npm run test:cov` writes the report to `./coverage`, the pre-existing location (FR-005, US2 scenario 6)
- [ ] T026 [US2] Database-script verification against a scratch database: `npm run db:init` ×2 and `npm run migration:run` ×2 — 4/4 succeed, all via the tsx from-source path (SC-003, SC-007)
- [ ] T027 [US2] Measure the oxlint warning baseline on the migrated tree (`npm run lint` output count) and record the figure in the PR description for US3's governance docs (SC-006 — replaces the stale 22-warning figure)
- [ ] T028 [US2] US2 checkpoint: run the six-step gate in prescribed order per `contracts/toolchain-commands.md` §1 — 6/6 with zero tolerated failures (SC-001); lint reports 0 errors and modifies 0 files (SC-006)

**Checkpoint**: User Stories 1 AND 2 both work independently — full command set green

---

## Phase 5: User Story 3 - Documentation and governance describe the toolchain that exists (Priority: P3)

**Goal**: README, AGENTS.md, and the constitution describe the tools that exist, with the
decorator-metadata test constraint documented and no retired-tool references.

**Independent Test**: Grep README/AGENTS/constitution for retired tools (0 hits); review the
amended constitution for CI sequence, test-location rule, migration-delivery clause, measured
baseline, and maintainer-approved bump.

### Implementation for User Story 3

- [ ] T029 [P] [US3] Update `README.md`: rewrite the command table (lines ~59–62) to name oxlint/Vitest/tsx and the new CI sequence, and add the decorator-metadata constraint line (esbuild emits no `design:paramtypes`; a future test booting a constructor-injected class needs explicit `@Inject(...)` or a transform plugin — research R2, Assumptions) (FR-016)
- [ ] T030 [P] [US3] Sweep `AGENTS.md` for retired-tool instructions: the CI command block (`npx eslint` → `npm run lint`, `npm test` mechanics), the Tests section ("Jest's `rootDir` is `src`" → Vitest include/exclude semantics, `test/` e2e glob), the `npm run lint` `--fix` caution (now inverted — `npm run lint` becomes read-only; `npm run format` stays the writer), and the `ts-node`/`ts-jest` notes (FR-016, SC-008). The toolchain paragraph was already updated 2026-09-29 — leave it
- [ ] T031 [P] [US3] Delete the stale gitignored intermediate build-output tree `build/` if it exists (FR-016) — it is gitignored so it may exist only in the primary working tree, not this worktree; verify with `ls build` and record the outcome either way
- [ ] T032 [US3] Amend `.specify/memory/constitution.md` via `/speckit.constitution` **after** `/speckit.analyze`, covering all FR-017 items: the new CI sequence (prettier → type:check → oxlint → build → tests), the test-location rule retitled off Jest with the strengthened include/exclude guarantee, the migration-delivery clause (emitted by the standard build, asserted in CI), the measured warning baseline from T027, and the stack declaration (Vitest/oxlint/tsx as constitution-level additions) — target version ≥3.0.0 with the bump type **explicitly approved by the maintainer**, never chosen silently; `AGENTS.md` must not contradict the result (T030)
- [ ] T033 [US3] Retired-tool sweep: grep `README.md`, `AGENTS.md`, `.specify/memory/constitution.md` for `jest|ts-jest|eslint|ts-node|npx eslint` → 0 stale references remain (historical/decision-record mentions in `docs/plans/` and `specs/` are expected and exempt) (SC-008, depends on T029–T032)

**Checkpoint**: All user stories independently functional; governance matches the tree

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: End-to-end validation and final consistency checks before `/speckit.converge`

- [ ] T034 [P] Run `specs/002-nest12-esm-toolchain/quickstart.md` end to end against its pass/fail summary table (SC-001 through SC-009) and record each result in the PR description
- [ ] T035 [P] Container verification: `docker build` succeeds with **no Dockerfile change** (FR-015), then boot the image against a scratch Postgres → schema present (SC-007 1/1); confirm the runtime stage still contains only production dependencies plus `dist/`
- [ ] T036 Final consistency pass: full six-step gate green; `npx prettier --check "src/**/*.ts" "test/**/*.ts"` clean; final `git diff` review for zero behavioral deltas (SC-005) and for FR-018 — the branch must contain **no** `docs/plans/easy_add_platform.md` work

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — starts immediately
- **Foundational (Phase 2)**: Depends on Setup — **BLOCKS all user stories**
- **User Story 1 (Phase 3)**: Depends on Foundational (Vitest must run the gate while the tree flips to ESM; tsx must run `migration:run` for scenario 3)
- **User Story 2 (Phase 4)**: Depends on Foundational; the final full-gate checkpoint (T028) is most meaningful after US1's flip (T014) — sequence P1 → P2 per spec priority
- **User Story 3 (Phase 5)**: Depends on US2 (T027's measured baseline feeds T032) and on `/speckit.analyze` having run (T032)
- **Polish (Phase 6)**: Depends on all desired stories being complete

### User Story Dependencies

- **US1 (P1)**: After Foundational; no dependency on US2/US3 → independently testable (MVP)
- **US2 (P2)**: After Foundational; oxlint work (T019–T022) is file-independent of US1 and could run in parallel staffed, but T028's gate validates the whole tree — prefer P1 first
- **US3 (P3)**: After US2 (baseline) — governance tasks T029–T031 are doc-only and parallel-safe

### Within Each User Story

- Atomicity rule first (T010–T014 as one commit), then verification tasks
- Config before script before dependency-removal (never orphan a running script)
- Checkpoint gate before moving to the next story

### Parallel Opportunities

- Phase 1: none (T002/T003 share `package.json`)
- Phase 2: T004 ∥ T005 (different files)
- US1: verification tasks are sequential (build → assert → boot); T017 (CI file) ∥ T015–T016 (local) after the flip
- US2: T019 (`.oxlintrc.json`) ∥ T023–T026 (verification, no file writes)
- US3: T029 ∥ T030 ∥ T031 (three different files); T032 sequential (needs analyze + T027)
- Polish: T034 ∥ T035

---

## Parallel Example per User Story

```bash
# User Story 1 — after the T010–T014 flip commit, run in parallel:
Task: "T015 build-output assertion (dist/database/migrations/*.js, zero imports)"
Task: "T017 CI migrations guard in .github/workflows/build.yml"

# User Story 2 — config/verification split:
Task: "T019 create .oxlintrc.json"
Task: "T023/T024/T025 focus, isolation, coverage verifications"

# User Story 3 — three independent doc files:
Task: "T029 README.md command table"
Task: "T030 AGENTS.md retired-tool sweep"
Task: "T031 delete stale build/ tree if present"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL — blocks all stories)
3. Complete Phase 3: User Story 1 — the atomic ESM flip (T010–T014), then assertions
4. **STOP and VALIDATE**: boot against empty scratch DB → schema exists (US1 Independent Test)
5. The migrated bot behaves identically — this alone delivers the P1 guarantee

### Incremental Delivery

1. Setup + Foundational → runners swapped, gate green on still-CJS tree
2. US1 → test independently (boot + migrations) → **MVP**
3. US2 → full command set green (6/6 + 4/4 + baseline measured)
4. US3 → docs/governance truthful → `/speckit.analyze` → constitution amendment
5. Polish → quickstart + container + final delta review

### Notes

- [P] tasks touch different files with no dependencies; everything touching `package.json`
  or `tsconfig.json` is sequential by construction
- Commit after each task or logical group; T010–T014 must be ONE commit (FR-013)
- Scratch resources only — never the production database or production Discord credentials
  (SC-009)
- If any plan fact proves wrong against installed packages, correct the plan and state the
  correction — never work around it silently (spec Assumptions)
