# Research: Nest 12 Toolchain and ESM Migration

**Branch**: `002-nest12-esm-toolchain` | **Date**: 2026-09-29
**Input**: [spec.md](./spec.md), [plan.md](./plan.md), `docs/plans/nest12_esm_toolchain.md`
(revised 2026-09-29)

**Status**: All unknowns resolved. The Technical Context in `plan.md` contains zero
`NEEDS CLARIFICATION` entries: open questions were settled by `/speckit.clarify`
(session 2026-09-29), by reading installed packages (`@nestjs/cli@12.0.7`,
`typeorm@0.3.31`), and by reading the live `nestjs/schematics` `ts-esm` scaffold templates on
GitHub. This document consolidates those findings in Decision / Rationale /
Alternatives-considered form.

---

## R1 — Builder choice

**Decision**: Keep the scaffold-default `tsc` builder. No `builder` key in `nest-cli.json`, no
bundler, no `tsconfig.migrations.json`, no second compilation step.

**Rationale**: Verified from `nestjs/schematics` `src/lib/application/files/ts-esm/` —
the single-app scaffold's `nest-cli.json` has no `builder` key; Rspack is the **monorepo**
default (`get-builder.js:14` defaults to `'tsc'`; only `nest g library` injects
`builder: 'rspack'`). At 37 TypeScript files a bundler buys no meaningful build-time win, while
a bundle omits glob-loaded migrations (`src/database/migrations/*` is imported by nothing) —
a silent unmigrated-database failure mode that would demand a second compiler pass, a
permanent CI guard, a Dockerfile change, and a documented `outDir` quirk. Clarified 2026-09-29;
the plan document was revised the same day to match.

**Alternatives considered**: Rspack (evaluated in full — full cost analysis recorded in the
plan's Phase 0.1 and *Accepted Trade-offs*); webpack (not a Nest 12 default anywhere, no
standing); `@swc/core` via `nest build -b swc` (faster emit but another deviation from the
scaffold with the same glob-visibility question — not pursued).

## R2 — Test runner and transform

**Decision**: Vitest 4, plain esbuild transform (no `unplugin-swc`), two config files
(`vitest.config.ts` for unit, `vitest.config.e2e.ts` for e2e), coverage via
`@vitest/coverage-v8` writing to the pre-existing `./coverage` location. Scaffold script
strings adopted verbatim.

**Rationale**: It is the Nest 12 ESM default. The decorator-metadata consequence (esbuild does
not emit `design:paramtypes`) is accepted per spec Assumptions: the existing two tests
construct services directly and are unaffected; 7 of 9 classes with constructor DI are already
tested this way and remain fine until a test boots such a class. The limitation is documented
(US3, FR-016), not solved.

**Alternatives considered**: Keep Jest + ts-jest (ESM-hostile — needs
`experimental-vm-modules` and stays off-default); Vitest + `unplugin-swc` (recovers decorator
metadata but adds a transform dependency the scaffold does not ship — deferred as separate
future work, per Assumptions).

## R3 — Suite collection boundaries

**Decision**: Unit config: `root: './'`, `include: ['**/*.spec.ts']` with explicit
`exclude: ['**/*.e2e-spec.ts', '**/node_modules/**', '**/dist/**', '**/build/**']`. E2E
config: `include: ['**/*.e2e-spec.ts']` with the same **non-source** excludes
(`node_modules`, `dist`, `build` — never an `*.e2e-spec.ts` exclusion, which would exclude
the suite's own files). Focus-by-filter (`npm test -- game-embed`, `-t`) supported by both.

**Rationale**: The exclude is what *guarantees* SC-004 rather than what merely happens to
hold: the current e2e name `health.e2e-spec.ts` does not match `**/*.spec.ts` (suffix
`-spec.ts`, verified by glob test), but a future `*.e2e.spec.ts` would, and `root: './'`
scanning would otherwise pick up `dist/` and `build/` stale trees.

**Alternatives considered**: Default globs with no excludes (rejected — silent cross-suite
runs); moving e2e specs out of `*.spec.ts` naming (rejected — renaming files is a
behavior-neutral but unnecessary churn outside the tooling surface; excludes are explicit and
self-documenting).

## R4 — Linter and type-aware coverage

**Decision**: `oxlint` with `--type-aware` enabled through `oxlint-tsgolint`. `.oxlintrc.json`
ports `eslint.config.mjs` rules one-for-one: `typescript` + `vitest` plugins,
`recommendedTypeChecked`-equivalent rules, `no-unsafe-*` downgraded to **warn** (the
`object-mapper` untyped-mapping rationale carries over), `no-explicit-any: off`, unused-vars
options (`argsIgnorePattern`, `varsIgnorePattern`, `caughtErrorsIgnorePattern`,
`ignoreRestSiblings`). Prettier stays a separate, unchanged `prettier --check` step.
`npm run type:check` remains the type authority — `tsgolint` targets TS7 while this repo is on
TS6, so lint may under-report type errors and typecheck must not be weakened (FR-006).

**Rationale**: Preserves the documented baseline — floating-promise detection and the
unsafe-usage family are the *reason* the current config is type-aware. Read-only invocation
(`npm run lint` without `--fix`; CI already runs eslint read-only) is preserved. The new
warning baseline is unknown until measured on the migrated tree (spec Assumption).

**Alternatives considered**: Keep ESLint + typescript-eslint (forbidden by the mandate and by
the constitution amendment path); oxlint without `--type-aware` (loses floating promises and
the unsafe family — fails FR-006); `oxlint --fix` in CI (violates read-only requirement).

## R5 — TypeScript runner for database CLI

**Decision**: `tsx` for `db:init` and `node --import tsx` for the TypeORM CLI. `dotenv` added
to `dependencies`. `ts-node` and the `tsconfig.json` `ts-node` block are removed.

**Rationale**: Under `"type": "module"` the CLI entry points must load TS from source; ts-node's
ESM story requires loader gymnastics this plan does not want. The TypeORM CLI already calls
`loadEnv()` itself (the split from `ConfigModule` is intentional — FR-012/FR-007). `dotenv`
resolves only by hoisting today (`@nestjs/config`/`typeorm` hoist it) — the AGENTS.md hazard
note makes it declared.

**Alternatives considered**: ts-node (current; ESM friction); Node
`--experimental-strip-types` (not the plan's target and Node-version-sensitive); compiling
scripts before running (slow feedback, wrong for a dev CLI).

## R6 — ESM specifier and type-only strategy

**Decision**: Append `.js` to all 68 relative specifiers (49 concrete files) and `/index.js`
to the 19 barrel imports — with the trap that `src/shared/constants` is a **file**, not a
barrel, and takes a plain `.js` at 5 sites (19 barrels = config 4, entities 10, types 5 →
`.js` for constants, `/index.js` for the rest). Set `verbatimModuleSyntax: true`. Convert the
15 type-only symbols in 12 statements, enumerated by
`tsc --noEmit --verbatimModuleSyntax 2>&1 | grep TS1484`.

**Rationale**: Native ESM requires explicit extensions and explicit `/index.js` for directory
imports. `verbatimModuleSyntax` turns `type:check` into *proof* (clarified Q3): the pure-type
barrel `src/shared/types` compiles to an empty module, and `typeorm`'s ESM entry omits
`MigrationInterface`/`QueryRunner` from its export allow-list — value-importing them fails at
link time on first boot while typecheck stays green without the flag. `import type` is erased
entirely, which is also what keeps compiled migrations import-free (FR-009).

**Alternatives considered**: Dropping `verbatimModuleSyntax` (rejected at clarify — see
spec Clarifications Q3); a path-alias/extension-resolution plugin (`vite-tsconfig-paths`,
`tsconfig-paths`) — zero aliases exist and adding any is forbidden (FR-004); relying on
transpiler import-elision heuristics (rejected at clarify Q3: tsx/Vitest are single-file
transforms that *cannot* elide type-only imports — value imports would survive).

## R7 — Migration loading under ESM (load-bearing)

**Decision**: Verified fact, not an open question: `typeorm@0.3.31`'s
`util/ImportUtils.js` `importOrRequireFile()` branches on the nearest `package.json`'s
`type` field and uses **dynamic `import()`** for ESM targets; the
`DirectoryExportedClassesLoader` then scans module exports for migration classes, and
`InitSchema1790514243494` is a named export. Works for `src/**/*.ts` under tsx and for
`dist/database/migrations/*.js` under the built app. The anchor
(`data-source-options.ts`) must resolve per-context — `import.meta.dirname` in all three
runtime contexts (source / built / watch), per the plan's Phase 0.2 table.

**Rationale**: This is the single fact the whole migration rests on; it was re-verified by
reading the installed package rather than assumed. The standard build emits
`dist/database/migrations/*.js` naturally — no special mechanism.

**Alternatives considered (all rejected)**: `assets` copy (copies `.ts` verbatim — unloadable
in production and wiped by `deleteOutDir` unless re-copied each build); shipping `tsx` in the
runtime image (changes the runtime stage); disabling `migrationsRun` (breaks Principle III and
container-boot migrations); a bundler with a second pass (rejected — R1).

## R8 — Scaffold deviations (closed enumeration)

**Decision**: The deviation set is exactly five, closed:
1. `cross-env` **kept** (scaffold drops it) — `data-source-options.ts` gates logging on
   `NODE_ENV`, and Windows dev needs the cross-platform setter.
2. `vite-tsconfig-paths` **omitted** (scaffold ships it) — zero path aliases, forbidden to
   add; it would be dead config (clarified Q2).
3. `verbatimModuleSyntax: true` **added** (scaffold does not set it) — load-bearing here
   (clarified Q3).
4. `tsx` **added** (fresh projects have no DB scripts) — for the TypeORM CLI and `db:init`.
5. `@nestjs/mau` **not adopted** (scaffold ships it) — Steammy deploys via GHCR + Coolify,
   not Mau.

**Rationale**: Every deviation is deliberate, enumerated, and closed so "adopt the defaults"
stays auditable.

**Alternatives considered**: Full scaffold parity (rejected — items 2 and 5 would be dead or
unused config); silently skipping item 1 (would break Windows dev).

## R9 — Runtime interop watch list (CJS dependencies under ESM)

**Decision**: Watch, via gates 5/6/9/10: `chalk@4` (4 default-import sites — CJS default
interop), `object-mapper` (highest risk — untyped CJS, mapping schema), discord.js (7 named
imports), `typeorm` (export allow-list, see R6/R7), `necord`. No preemptive code changes:
these work under Node's CJS-ESM interop in the common case; failures surface as runtime
errors in verification, not typecheck.

**Rationale**: No typecheck catches CJS/ESM interop breakage (spec edge case); the list comes
from the import audit (68 specifiers) and from the plan's *Runtime interop — watch list*
table.

**Alternatives considered**: Preemptively wrapping imports in `createRequire` (adds churn with
no demonstrated failure); skipping the watch list (would make gate failures mysterious).

## R10 — Constitution amendment sequencing

**Decision**: No amendment in this command. Sequence: implement (all phases green under the
*six current* CI steps) → `/speckit.analyze` (expected to report the Principle IV/V conflicts
CRITICAL against v2.0.0) → `/speckit.constitution` on this branch, producing ≥3.0.0 with the
bump type explicitly approved by the maintainer (plan pre-stages a MAJOR argument) → merge.
`AGENTS.md` is amended in the same change (FR-017).

**Rationale**: The constitution must describe the tree it governs — amending now (before
implementation) would make it false on `main`; amending after merge would leave one merged
state where the constitution mandates retired tools. The governance rule that a bump MUST NOT
be chosen silently is why the bump type is deferred to the maintainer.

**Alternatives considered**: Amend in this command (rejected — premature); skip the amendment
(rejected — FR-017 is a requirement); choose MAJOR silently (rejected — constitution
governance rule).

---

## Unresolved

None. Every Technical Context unknown was resolved before this document; no research task
remains open. If a plan fact proves wrong against installed packages during implementation, the
plan is corrected and the correction stated — never worked around silently (spec Assumptions).
