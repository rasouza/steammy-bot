# Feature Specification: Nest 12 Toolchain and ESM Migration

**Feature Branch**: `002-nest12-esm-toolchain`

**Created**: 2026-09-29

**Status**: Draft

**Input**: User description: "I want to implement @docs/plans/nest12_esm_toolchain.md"

The maintainer has directed that Steammy adopt the defaults `@nestjs/schematics@12` scaffolds
for ESM projects and move to native ES modules end to end: native ESM module system, Vitest as
the test runner, oxlint as the linter, tsx as the TypeScript runner for CLI scripts, and the
scaffold-default `tsc` builder (Rspack was evaluated and deliberately rejected — see
Clarifications). The detailed, phase-by-phase plan lives at
`docs/plans/nest12_esm_toolchain.md` and is the authoritative source for target values,
sequencing, and verification commands, except where a Clarification below supersedes it — most
materially the builder decision, which voids the plan's Phase 0 and requires the plan document
be revised before implementation. This specification captures the required outcomes,
constraints, and acceptance criteria; the plan captures the mechanics.

This is a **tooling** migration. It MUST NOT change runtime behavior, the database schema,
Discord behavior, or the broadcast lifecycle. It is independent of, and must not be combined
with, `docs/plans/easy_add_platform.md`.

## Clarifications

### Session 2026-09-29

- Q: Should the migration keep Rspack as its builder even though a fresh Nest 12 project
  scaffolds with the default `tsc` builder? → A: Switch to the scaffold-default `tsc` builder.
  Phase 0's single-bundle design, `tsconfig.migrations.json`, the mandatory two-step `build`
  order, and the bundle-specific silent-failure risk are all dropped; a cheap CI assertion that
  compiled migrations exist after a build is kept as insurance. The plan document MUST be
  revised to match before it is used to implement this feature.
- Q: What's the value in adding `vite-tsconfig-paths`? → A: None here — it only resolves
  tsconfig path aliases, this repository has zero path aliases and forbids adding any, so it
  would be dead config. It stays omitted from both test configs.
- Q: Can we safely drop `verbatimModuleSyntax: true`? → A: No — keep it. It is the enforcement
  that turns `npm run type:check` into proof that no type-only import survives as a value
  import at runtime, which this repository specifically needs: the pure-type barrel
  (`src/shared/types`) compiles to an empty module, and the database library's ESM entry omits
  `MigrationInterface`/`QueryRunner`, so value-importing them throws at link time on first
  boot while typecheck stays green.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Identical behavior after migration, migrations still applied on boot (Priority: P1)

After the migration, the bot behaves exactly as it does today. The most critical property: a
freshly built application still applies the database schema when it first boots against an
empty database, so announcements keep working after every deploy.

**Why this priority**: This migration's worst failure mode is silent. A build that produces no
loadable database migrations lets the application start happily against a database with no
tables, log no error, and quietly stop announcing games — no crash, no alert, just a bot that
goes quiet. Every other failure in this feature is loud and recoverable; this one is neither.

**Independent Test**: Build the application, boot it against an empty scratch Postgres
database, and confirm the schema and migration bookkeeping table exist afterward.

**Acceptance Scenarios**:

1. **Given** an empty scratch database, **When** the freshly built application boots, **Then**
   the `steammy_bot` schema exists and the migration has been applied.
2. **Given** a completed build, **When** the build output is inspected, **Then** a bootable
   application artifact and at least one compiled migration file both exist, and the compiled
   migration contains no import statements so it loads standalone.
3. **Given** a database where migrations have already been applied, **When** the migration
   command runs a second time, **Then** it succeeds without error (idempotent).
4. **Given** the migrated tree, **When** it is compared against the pre-migration tree, **Then**
   the database schema is unchanged, no migration file has been added and the only migration
   edit is the one-line `import type` marking required by FR-002, Discord announcement behavior
   is unchanged, and broadcast ordering is unchanged.

---

### User Story 2 - The standard command set works end to end (Priority: P2)

As a contributor or CI, I run the project's standard commands — typecheck, lint, unit tests,
end-to-end tests, build, and the database scripts — and each one uses the single, consistent,
supported toolset that Nest 12 defaults prescribe. No command is skipped, degraded, or needs a
manual workaround.

**Why this priority**: Delivering the new toolchain is the substance of the feature, but it is
worthless if the behavior guarantee in User Story 1 fails; hence P2.

**Independent Test**: On the migrated tree, run the full six-step verification gate in order,
then run the database scripts twice against a scratch database.

**Acceptance Scenarios**:

1. **Given** the migrated tree, **When** each verification step runs in the prescribed order,
   **Then** every step passes; a partial pass is not a pass.
2. **Given** the migrated tree, **When** the unit test command runs, **Then** only the unit
   spec(s) run and the end-to-end spec is not collected — and vice versa when the end-to-end
   command runs. Neither run scans build output or dependency directories.
3. **Given** the migrated tree, **When** a developer focuses a single spec by name or path
   filter, **Then** only that spec runs.
4. **Given** the migrated tree, **When** the linter runs read-only exactly as CI runs it, **Then**
   it reports zero errors and modifies zero files, and the new warning baseline has been
   measured.
5. **Given** the migrated tree, **When** the schema-init script and the migration command each
   run twice outside the application process, **Then** all four invocations succeed.
6. **Given** the migrated tree, **When** coverage is requested, **Then** it is written to the
   same output location as before.

---

### User Story 3 - Documentation and governance describe the toolchain that exists (Priority: P3)

Contributor documentation (README, AGENTS.md) and the project constitution describe the
commands, steps, and constraints that actually exist after the migration — with no references
to retired tools, and with the one new constraint (the test-time decorator-metadata
limitation) written down so it is discovered as documented behavior rather than an unexplained
failure.

**Why this priority**: Does not block operation of the bot, but the constitution currently
mandates the retired linter as a CI step and a Jest-centric test rule, so leaving it unamended
would make compliant future work impossible. It must be settled before merge.

**Independent Test**: Search all governance and contributor docs for references to retired
tools; review the amended constitution for the updated CI sequence, test-location rule,
migration-delivery mechanism, and measured warning baseline.

**Acceptance Scenarios**:

1. **Given** the migrated tree, **When** the README command table is reviewed, **Then** it
   names the current tools and documents the decorator-metadata test constraint.
2. **Given** the constitution after amendment, **When** it is reviewed, **Then** its CI
   sequence, test-location rule, migration-delivery clause, and warning baseline match the new
   toolchain, and the version bump was explicitly approved by the maintainer.
3. **Given** AGENTS.md, **When** it is read after the change, **Then** it no longer instructs
   anyone to run retired tools and references this plan for toolchain and module-system work.

---

### Edge Cases

- **Build output contains the application artifact but no compiled migrations**: this MUST be
  treated as a failed build, even though every tool exits 0. It is the silent-failure case and
  the reason a build-output assertion exists in both local verification and CI.
- **A migration file later gains a real value import**: the compiled migration would then carry
  an import statement and must be re-validated against module resolution rules before it can be
  trusted to load at boot.
- **A type-only symbol is value-imported**: typecheck passes, but loading fails at link time
  with a hard error — for database CLI paths this lands on the first boot; for type barrels it
  lands the first time the module is loaded. Type-only imports must be erased at compile time.
- **An extensionless relative module reference**: resolves during typecheck but fails at
  runtime under native ESM. Self-verification: typecheck reports each miss.
- **Test collection bleed**: a unit glob broad enough to match an end-to-end spec (the current
  name `health.e2e-spec.ts` is safe — it ends in `-spec.ts` — but a future `*.e2e.spec.ts`
  would match `**/*.spec.ts`), or either runner scanning stale build-output trees under a
  repo-root scan — producing tests that silently run the wrong suite or compile artifacts.
- **CommonJS dependency imported from ESM** (default or named imports of chalk, object-mapper,
  discord.js, typeorm, necord): runtime interop breakage that no typecheck catches; each is a
  plausible breakage point to watch during verification.
- **Anything not emitted by the build itself is lost**: the output directory is wiped at the
  start of every build, so migrations must be compiled by that build rather than copied in as
  source files — a copy-based shortcut would silently vanish on the next build.
- **Line endings rewritten to CRLF**: the formatter check fails on every file; the fix is the
  line endings, not the formatter config.
- **A constructor dependency is later added to a tested class**: the test tool's transform does
  not emit decorator metadata, so tests that construct or boot such a class fail with an
  unresolvable-dependency error. This is a known, accepted constraint that must be documented,
  not discovered the hard way.

## Requirements *(mandatory)*

### Functional Requirements

**Module system**

- **FR-001**: The project MUST declare itself an ES module project, and every relative module
  reference in source and test code MUST resolve under native ESM rules — explicit file
  extensions, and explicit directory index references for barrels. No extensionless relative
  reference may remain.
- **FR-002**: Imports that carry only types MUST be marked type-only so they are fully erased
  at compile time. This is load-bearing, not stylistic: type-only barrels have no runtime
  exports, and two symbols imported from the database library's ESM entry are absent from its
  export allow-list — value-importing them fails at link time even though typecheck is clean.
- **FR-003**: The directory anchor used by the database migration search MUST resolve to
  whichever directory holds the loadable migrations at run time, in all three runtime contexts:
  scripts run from source, the built application, and watch mode. The search expression itself
  MUST NOT be hardcoded to one context.
- **FR-004**: No path aliases may be introduced; the repository has none today.

**Test runner**

- **FR-005**: Both test suites MUST run on the new runner: unit specs colocated with source,
  end-to-end specs under `test/`. Each suite MUST collect only its own specs, MUST exclude
  build output and dependencies, MUST support focusing a single spec by filter, and MUST
  provide coverage reporting to the pre-existing coverage output location.

**Linter**

- **FR-006**: The replacement linter MUST preserve type-aware rule coverage — including
  floating-promise detection and the unsafe-usage warning family — because those rules are the
  documented baseline. The deliberate exemptions (`no-explicit-any` off; unused-variable
  patterns for rest-siblings and ignored argument/variable name prefixes) MUST be preserved.
  Linting MUST run read-only (no auto-fix) as CI runs it, and formatting MUST remain a
  separate, unchanged check. `npm run type:check` remains the type authority for all files
  including specs.

**TypeScript runner and database scripts**

- **FR-007**: The schema-init script and the database library's CLI MUST run outside the
  application process via the new TypeScript runner, MUST keep loading environment variables
  themselves (that split from the application's config loading is intentional and preserved),
  and `dotenv` MUST become a declared dependency rather than an accidental transitive one.

**Build and migration delivery**

- **FR-008**: A single documented build command MUST produce both bootable application output
  and compiled migrations in one pass, using the project's standard compiler — no bundler, no
  second compilation step, and no copied-in source files. The build's output directory is wiped
  at the start of every build, so the migrations MUST be emitted by that same build. Adopting a
  bundler is explicitly rejected: it would drop glob-loaded migrations from the build output
  and reintroduce a silent unmigrated-database failure mode (see Clarifications).
- **FR-009**: Compiled migrations MUST load standalone at boot. With only type-only imports
  remaining after this migration, the emitted files contain no `import` statements — asserted
  locally and in CI — and this invariant must be re-verified before any future migration
  deliberately adds a value import (which must resolve under native ESM, including the database
  library's ESM export allow-list).
- **FR-010**: A build with no loadable migrations is a FAILED build, regardless of exit codes.
  This MUST be asserted explicitly, locally and in CI (compiled migrations exist and contain no
  import statement).

**No behavior change (non-negotiable)**

- **FR-011**: No runtime behavior change: no schema change, no migration added, and no
  migration edit other than the one-line `import type` marking FR-002 mandates in
  `InitSchema.ts` (no SQL, no class logic, no ordering change), no Discord behavior change, no
  broadcast ordering change, and no moving, renaming, or reorganizing of source files —
  source-layout refactors are out of scope (the only file-level additions or replacements
  permitted are toolchain configuration files). The known `broadcasted`-before-`send`
  delivery-ordering defect is real but is explicitly OUT OF SCOPE and MUST NOT be "fixed while
  in there".
- **FR-012**: Existing framework conventions MUST be preserved untouched: the environment
  schema stays permissive (passthrough) so startup is not blocked by unrelated variables;
  `NODE_ENV` keeps having no default; the database schema name stays hardcoded; the split
  between application config loading and database-CLI config loading stays as is.
- **FR-013**: Every phase MUST leave the full six-step verification gate green before the next
  phase begins. The specifier, type-only-import, and module-anchor changes are interdependent
  and MUST land together — never a tree where explicit extensions are added but type-only
  marking is incomplete. Type errors in previously passing code that surface when a phase
  enables stricter settings MUST be fixed in that phase before its gate may pass — never
  suppressed, excluded, or deferred to a later phase.

**CI, deployment, and docs**

- **FR-014**: CI MUST run the new commands in the same order with the same guarantees as
  before, MUST keep the existing formatting and typecheck steps unchanged, and MUST gain a
  guard that compiled migrations exist after a build and contain no import statement. The
  database job's script runs now exercise the same from-source path developers use locally.
- **FR-015**: The container image MUST build and boot exactly as before: no new build
  configuration needs to be copied into the image, the runtime stage still contains only
  production dependencies plus build output, and migrations still run at container boot with no
  separate deploy-time migrate step. Production startup behavior is unchanged.
- **FR-016**: Contributor docs (README, AGENTS.md) MUST be updated in the same change: the
  command table names the current tools, and the decorator-metadata test constraint is
  documented. The stale gitignored intermediate build-output tree MUST be deleted so it cannot
  be mistaken for build output.
- **FR-017**: The constitution MUST be amended on the feature branch before merge — after
  implementation and analysis, so it describes the tree it governs — covering: the CI sequence,
  the test-location rule (whose current title names the retired runner), the migration-delivery
  clause (migrations are emitted by the standard build and asserted to exist in CI), the newly
  measured warning baseline, and the stack declaration (the new tools are stack additions and
  therefore constitution-level).
  The amendment MUST additionally leave zero retired-tool references anywhere in the
  constitution — SC-008 is the completion test; the list above is the minimum scope, not the
  maximum.
  The version bump type MUST be explicitly approved by the maintainer, never chosen silently.
  AGENTS.md MUST be amended in the same change so it does not contradict the constitution.
- **FR-018**: This feature MUST NOT be combined with `docs/plans/easy_add_platform.md` work;
  the two plans are independent and a commit containing both is unreviewable.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: All six verification steps pass when run in order on the migrated tree — 6/6,
  with zero tolerated failures; a partial pass counts as a fail.
- **SC-002**: Booting a freshly built application against an empty scratch database creates
  the complete schema in 100% of attempts — there is no start path that connects to a database
  and leaves it without tables.
- **SC-003**: The migration command succeeds twice in a row against the same scratch database
  (2/2), proving idempotency.
- **SC-004**: The unit test run executes exactly the unit spec(s) and the end-to-end run
  executes exactly the end-to-end spec(s): 0 specs cross between suites, and 0 build or
  dependency files are scanned by either run.
- **SC-005**: Zero behavioral deltas versus the pre-migration tree: 0 migration files added,
  the sole permitted migration edit is FR-002's `import type` line (no SQL/logic changes), 0
  schema differences, all pre-existing tests pass with no test-logic changes (mechanical
  specifier/`import type` edits per FR-001/FR-002 excepted), and broadcast ordering is
  untouched.
- **SC-006**: The linter completes with 0 errors, modifies 0 files when run as CI runs it, and
  its newly measured warning baseline is recorded in governance docs (replacing the stale
  baseline).
- **SC-007**: From a clean checkout, the container image builds and boots with the schema
  present (1/1), and the database scripts succeed on 4/4 invocations (init ×2, migrate ×2)
  against a scratch database.
- **SC-008**: 0 references to retired tools remain in README, AGENTS.md, and the constitution;
  the constitution carries a maintainer-approved version bump; the one new constraint (test
  decorator metadata) is documented in the contributor docs.
- **SC-009**: Verification and all local database work use scratch, non-production resources
  only: 0 touches of the production database or production Discord credentials during the
  migration.

## Assumptions

- `docs/plans/nest12_esm_toolchain.md` is the authoritative source for exact target values,
  file contents, phase ordering, and verification commands. This spec does not restate those
  mechanics; where the plan and this spec ever diverge on a *mechanism*, the plan wins — except
  for the builder decision recorded in Clarifications, which supersedes the plan's Rspack
  content. That precondition is satisfied: `docs/plans/nest12_esm_toolchain.md` was revised on
  2026-09-29 (Phase 0 rewritten as the builder decision record; `tsconfig.migrations.json`, the
  two-step `build`, the Dockerfile tsconfig copy, and the `outDir` quirk removed). If a plan
  fact proves wrong against installed packages, the plan is corrected and the correction
  stated — never worked around silently.
- The builder stays the fresh-scaffold default `tsc` (clarified 2026-09-29): a bundler brings
  no meaningful build-time win at this scale while dropping glob-loaded migrations from the
  build output — a silent unmigrated-database failure mode that would otherwise need permanent
  guard-rails. No bundler configuration is introduced.
- A plain test runner without decorator-metadata emission is accepted (matching the Nest 12 ESM
  scaffold). The two existing tests are unaffected; the limitation is documented rather than
  solved here — a future test that boots a constructor-injected class needs explicit
  `@Inject(...)` or a transform plugin, which is separate work.
- Deviations from the scaffold are deliberate, enumerated, and closed: the
  environment-crossing helper is retained (the development-logging gate depends on it); no
  path-alias plugin (`vite-tsconfig-paths`) — the repo has zero path aliases and forbids
  adding any, so it would be dead config; `verbatimModuleSyntax` added beyond the scaffold (the
  fresh template does not set it) because this repo's pure-type barrel and the database
  library's ESM export allow-list make it load-bearing; `tsx` added for the database CLI (fresh
  projects have no database scripts); the scaffold's `@nestjs/mau` deploy CLI is not adopted
  (Steammy deploys via its container pipeline).
- Verification runs against a scratch Postgres and non-production Discord credentials only;
  production resources are never touched (Constitution §deployment, platform plan §16).
- The constitution's current version is **2.0.0** (last amended 2026-09-28). Earlier plan
  drafts cited v1.0.0; the 2026-09-29 revision corrected the citation to v2.0.0 and
  re-verified that the listed conflicts against Principles IV/V and Technical Constraints are
  still present in the 2.0.0 text (its Principle III note is now a clarifying addition, not a
  conflict). The amendment target version is therefore ≥3.0.0; the bump type (the plan
  pre-stages an argument for MAJOR) is explicitly deferred to the maintainer at the amendment
  step, per the constitution's governance rule that a bump MUST NOT be chosen silently.
- This feature is independent of `docs/plans/easy_add_platform.md` and lands as its own branch,
  PR, and commits; the plan document itself is committed alongside this spec's branch as its
  source.
- The pre-existing delivery-ordering defect (`broadcasted` persisted before a confirmed send)
  remains open and untouched; it is governed by Principle II and gets its own work.
- The new linter's warning baseline is unknown until measured on the migrated tree; it replaces
  the stale "22 warnings" figure wherever that figure is recorded.
- Sequential feature numbering applies (`.specify/init-options.json`), giving this feature
  directory `specs/002-nest12-esm-toolchain`; the spec directory and any future git branch name
  are independent.
