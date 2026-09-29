# Steammy Constitution

This constitution governs the Steammy Discord bot: a NestJS + Necord service, backed by
PostgreSQL via TypeORM, that announces free game offers from Xbox Game Pass and Epic Games.

## Core Principles

### I. Platform Definitions, Not Platform Branches

Adding a storefront MUST mean adding a platform definition and registering it. It MUST NOT
require editing generic, platform-agnostic code.

`BroadcastService` today injects `Repository<CatalogEpic>` and `Repository<CatalogXbox>`, and
carries `broadcastEpic()`/`broadcastXbox()` plus `cronEpic()`/`cronXbox()`; `admin.commands.ts`
branches on `if (platform === ...)`. This is the documented anti-pattern, not the model to copy.
The target is one generic platform lifecycle driven by a platform registry.

`docs/plans/easy_add_platform.md` is the maintainer's active directive and governs platform
architecture. It MUST be read before any platform work. Its "Do Not Over-Abstract" constraints
bind equally: abstraction MUST stop at what the second platform actually needs.

Rationale: the current shape makes N storefronts cost N edits in shared code, so each new
platform risks breaking the platforms already shipping.

### II. Delivery Before Durable State

A record MUST NOT be marked as delivered until the delivery has demonstrably succeeded. Persist
the `broadcasted` flag only after Discord acknowledges the message; on failure the game MUST
remain un-broadcast so the next run retries it.

`broadcast.service.ts:65` and `:103` currently set `game.broadcasted = true` and save *before*
calling `send()` at `:67` and `:105`. This is a known defect. New code MUST NOT reproduce the
ordering, and touching broadcast logic without correcting it is not compliant.

Rationale: a transient Discord outage or rate limit otherwise marks games as announced forever
and they are never retried — permanent, silent data loss.

### III. Migrations, Never synchronize

`synchronize` MUST remain disabled. Every schema change ships as a reviewed migration.

- `npm run db:init` is a prerequisite: TypeORM will not create the `steammy_bot` schema, and it
  places the `migrations` bookkeeping table inside that schema. Run it once per database.
- `npm run migration:generate` diffs entities against the **live** database. It MUST be run
  against a fully migrated database or it will emit a wrong migration.
- A new entity MUST be registered in both `src/database/entities/index.ts` **and** the `entities`
  array in `src/database/data-source-options.ts`. Omitting the array makes the entity invisible
  to both Nest and the TypeORM CLI.
- The `steammy_bot` schema literal MUST stay hardcoded, so the schema name baked into generated
  migrations is byte-identical in every environment. It MUST NOT become configurable.
- Nest sets `migrationsRun: true` and auto-migrates on boot; the TypeORM CLI does not. This
  split is intentional.
- Migrations are delivered by the standard `npm run build`: the plain `tsc` builder emits
  `dist/database/migrations/*.js`, with no bundler and no separate migrations build. CI MUST
  assert that the compiled migrations exist and contain no import statements — a migration that
  needs a runtime import is not self-contained.

Rationale: a migration that differs per environment is a migration that breaks production.

### IV. The CI Gate Is the Definition of Done

Work is not complete until the full CI sequence passes locally, in this order:

1. `npx prettier --check "src/**/*.ts" "test/**/*.ts"`
2. `npm run type:check`
3. `npm run lint`
4. `npm run build`
5. `npm test`
6. `npm run test:e2e`

- `npm run lint` is type-aware oxlint (`oxlint --type-aware src/ test/`). It MUST NOT be given
  `--fix` in any verification context; files are rewritten only by `npm run format` (Prettier
  over `src/` and `test/`), so an unformatted or lint-violating file fails the gate rather than
  being silently repaired.
- `tsx` transpiles without typechecking, so `npm run typeorm` and `npm run db:init` do not
  typecheck. `npm run type:check` is the only gate that typechecks spec files and TypeORM
  scripts, and it remains the type authority — `tsgolint` targets TypeScript 7 through the Go
  port while this repository is on TypeScript 6, so the two are not interchangeable.
- oxlint's `no-unsafe-*` rules are warnings, not errors, because `object-mapper`'s mapping
  schema is untyped. A clean tree yields 22 warnings and exit code 0 (re-measured under oxlint).
  These MUST NOT be "fixed" by casting the untyped schema; 0 errors is the bar.

Rationale: checkers never write and writers never gate, so local habits (autofix, transpile-only
CLIs) cannot masquerade as a passing gate — and the Windows-vs-Linux divergence that remains,
line endings, is pinned by `.gitattributes` and caught by step 1.

### V. Tests Live Where the Include Globs Can Find Them

Unit specs are colocated as `src/**/*.spec.ts`. End-to-end specs live in `test/**/*.e2e-spec.ts`.

- The unit suite includes only `**/*.spec.ts`; the e2e suite includes only `**/*.e2e-spec.ts`.
  A spec outside its suite's include glob is never collected and will silently appear to pass
  while executing nothing. The two suites MUST stay disjoint — zero cross-suite specs — and
  neither suite may collect files from `dist/`, `build/`, or `node_modules/`.
- Unit specs construct services directly (`new GameEmbedService()`); no Nest testing module.
  E2E specs use `Test.createTestingModule` with a single module and require neither a database
  nor a Discord token.
- `tsconfig.build.json` excludes `**/*spec.ts` so specs never reach `dist/`, but
  `tsc --noEmit -p tsconfig.json` does typecheck them.
- Vitest transpiles with esbuild, which emits no `design:paramtypes` decorator metadata. The
  current specs never boot a constructor-injected class; a spec that must do so requires explicit
  `@Inject(...)` decorators or a transform plugin — never a weaker metadata guarantee.

Rationale: an uncollected spec is worse than no spec, because it manufactures false confidence.

## Technical Constraints

**Runtime and toolchain**

- Node `.nvmrc` pins `24.21.0` and `engines` requires `>=24.15.0`; the README MUST state the same
  floor, and all three MUST be updated together when it changes. The README claimed `>=22.12` for
  months after the bump — a stale install hint strands contributors on the wrong runtime, which is
  why agreement is asserted here rather than assumed.
- Installs MUST use `--ignore-scripts` (`npm ci --ignore-scripts`). necord's postinstall crashes
  on Windows; CI uses the same flag on Linux.
- The repository is native ESM (`"type": "module"`): relative imports carry explicit `.js`
  (or `/index.js`) extensions, and `import type` marks type-only imports under
  `verbatimModuleSyntax`.
- Stack is NestJS + Necord + discord.js + TypeORM + PostgreSQL, tested with Vitest, linted with
  type-aware oxlint (`oxlint` + `oxlint-tsgolint`), with `tsx` driving the TypeORM CLI and
  `db:init`. This amendment adopts those three as constitution-level toolchain additions;
  further additions remain a constitution-level decision, not an implementation detail.

**Framework conventions that must not be "corrected"**

- `envSchema` (`src/config/env.schema.ts`) MUST stay `.passthrough()`. `ConfigModule` hands it all
  of `process.env`; a strict object would reject `PATH`/`USERNAME` and block startup.
- `NODE_ENV` deliberately has no default, so an unset `NODE_ENV` never behaves like development.
- There is no manual slash-command registration and none is needed. Handlers come from
  `@SlashCommand()` on classes listed in a module's `providers`, with `@Context()` and
  `@Options()` plus a DTO class for options.
- discord.js `Client` is injectable anywhere without importing `BotModule`; Necord provides it
  globally. Adding a `BotModule` import to wire it up is unnecessary coupling.
- `dotenv` is imported by `src/database/data-source.ts` and
  `src/database/scripts/create-schema.ts` but is not a declared dependency; it resolves only
  because `@nestjs/config` and `typeorm` hoist it. Any change touching those files MUST add
  `dotenv` to `dependencies`.
- The TypeORM CLI entrypoints call `loadEnv()` themselves because they run outside Nest; the Nest
  path loads `.env` via `ConfigModule`. This split MUST be preserved.

**Data representation**

- Catalog `price` and `size` are `bigint` columns, so `pg` returns them as strings. They MUST be
  coerced with `Number()` before any arithmetic, as `game-embed.service.ts` does. Prices are
  stored in cents; presentation divides by 100.

**Repository hygiene**

- `.gitattributes` forces `eol=lf`. If a tool rewrites files to CRLF, `prettier --check` fails on
  every file while `npm run lint` still passes, because oxlint does not check formatting. The fix
  is the line endings, not the Prettier config.

**Deployment**

- Releases are cut automatically: a merge to `main` whose gate (Principle IV) passes publishes the
  GitHub Release, with the version inferred from the merged change. Hand-pushed `v*.*.*` tags are
  not a release mechanism and MUST NOT publish anything.
- The release chain is the sole path that publishes: `deploy.yml` is `workflow_call`-only — no
  tag-push trigger, no manual dispatch — and is invoked by the release workflow after the gate,
  where it builds a multi-arch (`linux/amd64`, `linux/arm64`) image, pushes to `ghcr.io/<repo>`
  with a provenance attestation, and pings a Coolify webhook. `build.yml` no longer runs on push
  to `main`; it runs as the gate inside that chain and keeps its PR/dispatch triggers. There is no
  npm publish step.
- The Dockerfile never copies `.env`; `docker-compose.yml` injects variables explicitly and
  bind-mounts `assets/`. `.env.prod` is gitignored. Migrations run at container boot, so deploys
  have no separate migrate step. Secrets MUST NOT be committed.

## Development Workflow and Quality Gates

**Issue tracking**

- Linear is the single tracker of record (team `Steammy Bot`, project `steammy-bot`). Planned
  work MUST be recorded as an `STE-x` issue before it becomes a branch.
- Feature branches MUST carry the `STE-x` key — Linear's suggested `gitBranchName` already
  does — so PR linking and branch-driven status transitions flow through Linear's native
  GitHub integration.
- The same work MUST NOT be tracked in GitHub Issues alongside Linear: two trackers drift.
  The speckit `after_tasks` hook pushes `tasks.md` tasks as Linear subtasks; the
  GitHub-issues variant (`speckit.taskstoissues`) MUST NOT run for the same `tasks.md`.
  Operational wiring lives in AGENTS.md.

1. Confirm the target platform and whether `docs/plans/easy_add_platform.md` applies. For platform
   work, drive the change through the Spec Kit workflow rather than hand-implementing the plan.
2. Branch from `main`. Keep commits atomic: a commit MUST contain one logical change, and a
   commit that references a document MUST include that document.
3. Write or update colocated unit specs alongside the change (Principle V).
4. Run the full CI sequence from Principle IV. All six steps MUST pass. A partial run is not a
   pass.
5. Schema changes require a migration generated per Principle III, and MUST NOT be hand-edited
   unless the generated SQL is deliberately adjusted, in which case the reason MUST be stated in
   the PR description.
6. Open a PR against `main`. The reviewer MUST verify Principle IV's six steps and confirm the
   change introduces no new platform branch in generic code (Principle I).

Compliance review expectations:

- Reviewers MUST reject changes that pass a subset of the CI gate.
- Reviewers MUST reject new `if (platform === ...)` branching in generic services.
- Reviewers MUST confirm no `broadcasted` flag is persisted before a successful send.
- Reviewers MUST reject work that bypasses the tracker of record: a feature branch with no
  `STE-x` issue, or the same `tasks.md` mirrored into GitHub Issues while Linear holds it.
- Adding a principle, or relaxing one of the non-negotiable rules, is a MAJOR amendment and
  requires explicit maintainer sign-off.

## Governance

This constitution supersedes informal practice, README claims, and habitual convention. Where
AGENTS.md, a README, or an existing code pattern conflicts with it, this document wins. Code that
violates it is a known defect to be scheduled for remediation, not a precedent to imitate.

Amendment procedure:

1. Propose the change with the affected principles, the rationale, and the version bump type.
2. The maintainer approves the bump type explicitly; the version MUST NOT be chosen silently.
3. Update `.specify/memory/constitution.md`, amend AGENTS.md where it repeats governed rules, and
   remove the Sync Impact Report scratch block before committing.
4. Amendments take effect on merge. Commits MUST NOT contain the scratch report.

Versioning policy — semantic versioning on the constitution's own version:

- MAJOR: removing a principle, redefining one, or relaxing a non-negotiable rule. Backward
  incompatible; existing compliant work may become non-compliant.
- MINOR: adding a principle or materially expanding guidance.
- PATCH: clarifications, wording, typo fixes, and other non-semantic refinements.

Where a bump is ambiguous, the maintainer MUST be asked before the version is finalized.

Compliance review: the six CI steps in Principle IV are the mechanical floor. The judgment
checks in "Compliance review expectations" — new platform branching, delivery ordering, and
partial-gate passes — are not automatable and MUST be verified by a human reviewer.

**Version**: 3.1.0 | **Ratified**: 2026-09-27 | **Last Amended**: 2026-09-29
