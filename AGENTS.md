# AGENTS.md

Steammy is a Discord bot (NestJS + Necord + TypeORM/Postgres) that announces
free game offers from Xbox Game Pass and Epic Games. Entry points:
`src/main.ts` → `src/app.module.ts`; features live in `src/modules/*`.

## Commands

CI (`.github/workflows/build.yml`) runs these in order — run all of them before pushing:

```bash
npx prettier --check "src/**/*.ts" "test/**/*.ts"
npm run type:check
npm run lint
npm run build
npm run test:cov
npm run test:e2e
```

- `npm run lint` is the CI lint command: type-aware oxlint (`--type-aware`),
  read-only — it never rewrites files. `npm run format` is the writer.
- `npm run format` writes Prettier output over `src/` and `test/`.
- CI runs unit tests as `npm run test:cov` and uploads `coverage/lcov.info`
  to Codecov. Uploads are informational — `fail_ci_if_error: false` plus
  `codecov.yml` statuses keep CI green and unblocked regardless; the step
  only reports once the `CODECOV_TOKEN` secret is set.
- `npm install --ignore-scripts` is required. necord's postinstall crashes on
  Windows; CI uses `npm ci --ignore-scripts` on Linux too.
- Node: `.nvmrc` pins `24.21.0`; `engines` sets the floor at `>=24.15.0`.
- Line endings: `.gitattributes` forces `eol=lf`. If your editor or a tool
  rewrites files to CRLF, `prettier --check` fails on every file while `lint`
  still passes (oxlint does not check formatting). Fix the line endings, not
  the Prettier config.

## Tests

- Unit specs are colocated in `src/**/*.spec.ts`. The unit suite includes only
  `**/*.spec.ts`, so a spec under `test/` is invisible to `npm test`, and the
  e2e suite includes only `**/*.e2e-spec.ts`.
- E2E specs are `test/**/*.e2e-spec.ts` (`npm run test:e2e`).
- Focus one: `npm test -- game-embed` (path) or `npm test -- -t "name"`.
- `tsconfig.build.json` excludes `**/*spec.ts`, so specs never reach `dist/` —
  but `tsc --noEmit -p tsconfig.json` _does_ typecheck them. `type:check` is the
  only gate for spec files.
- Unit specs construct services directly (`new GameEmbedService()`), no Nest
  testing module. E2E uses `Test.createTestingModule` with a single module, so
  it needs neither a database nor a Discord token.
- `tsx` transpiles without typechecking, so `npm run typeorm` and
  `npm run db:init` do not typecheck. Run `type:check` separately.

## Database

- Schema `steammy_bot` is hardcoded in `src/config/database.config.ts`
  (`DATABASE_SCHEMA`) on purpose, so the schema literal baked into generated
  migrations is identical in every environment. Do not make it configurable.
- `synchronize` is never used; schema changes go through migrations only.
- `npm run db:init` is a prerequisite, not a convenience: TypeORM will not
  create the Postgres schema, and it creates the `migrations` table _inside_
  that schema. Run it once per database before any `migration:run`.
- `npm run migration:generate` diffs entities against the **live** database. Run
  it against a fully migrated DB or it emits a wrong migration.
- Nest sets `migrationsRun: true` (`src/database/database.module.ts`), so the app
  auto-migrates on boot. The TypeORM CLI does not.

**A new entity must be registered twice**: in the `src/database/entities/index.ts`
barrel _and_ in the `entities` array in `src/database/data-source-options.ts`.
Miss the array and the entity is invisible to both Nest and the CLI.

## Adding a platform

Six touch points, per the README: entity → `entities/index.ts` **and**
`data-source-options.ts` → migration → platform service with `@Cron()` →
`src/shared/constants.ts` and `src/modules/subscription/dto/platform-option.dto.ts`
(the Discord `choices` array is hardcoded) → `broadcast.service.ts`.

**Read `docs/plans/easy_add_platform.md` first — it is the maintainer's active
directive, and it deliberately rejects the current shape.** `BroadcastService`
today injects `Repository<CatalogEpic>` and `Repository<CatalogXbox>`, carries
per-platform `broadcastEpic()`/`broadcastXbox()` and `cronEpic()`/`cronXbox()`,
and `admin.commands.ts` branches on `if (platform === ...)`. Do not copy that
pattern. The target is one generic platform lifecycle plus a platform registry,
so adding a platform means adding a definition and registering it — not editing
generic code.

## Changing the toolchain

**`docs/plans/nest12_esm_toolchain.md` records the Nest 12 migration.** It has
been implemented and merged in PR #20: the tree is native ESM
(`"type": "module"`), tested with Vitest, linted with type-aware oxlint, and
the TypeORM CLI runs through `tsx`. The builder stayed on plain `tsc`:
Rspack was evaluated and rejected on 2026-09-29 (decision recorded in
`specs/002-nest12-esm-toolchain/spec.md`), so there is no bundler, no
`tsconfig.migrations.json`, and no two-step `build` —
`dist/database/migrations/*.js` keeps coming from the standard build.

Two hazards worth knowing before you touch anything here:

- Every relative import carries an explicit extension — `.js` for concrete
  files, `/index.js` for the 19 barrels (70 specifiers across 29 files). Keep
  them that way: an extensionless relative import breaks at runtime, not at
  typecheck.
- `src/shared/constants` is a **file**, not a barrel directory, despite sitting
  next to `src/shared/types/`. It takes a plain `.js`, not `/index.js`.

This work is independent of `docs/plans/easy_add_platform.md`; a commit
containing both is unreviewable.

A bug the plan also fixes: `broadcastEpic`/`broadcastXbox` run
`game.broadcasted = true; await save()` **before** `send()`, so a failed Discord
delivery permanently marks a game as broadcast and it is never retried. Do not
preserve that ordering if you are implementing the plan.

## Conventions that differ from defaults

- `tsconfig.json` sets `strict: false` but enables `strictNullChecks`,
  `noImplicitAny`, and `strictBindCallApply` individually. Neither fully strict
  nor fully loose — don't assume either.
- oxlint runs type-aware through `oxlint-tsgolint` (the `--type-aware` flag on
  `npm run lint`); `tsc` (`npm run type:check`) remains the type authority.
  `no-unsafe-*` are warnings, not errors, because `object-mapper`'s mapping
  schema is untyped. 22 warnings on a clean tree is normal; do not try to
  clear them.
- Necord: there is no manual slash-command registration anywhere in `src/` and
  none is needed. Handlers come from `@SlashCommand()` on classes listed in a
  module's `providers`, using `@Context()` and `@Options()` with a DTO class for
  options. discord.js `Client` is injectable anywhere without importing
  `BotModule` — Necord provides it globally, so don't add a `BotModule` import
  to wire it up.
- `envSchema` (`src/config/env.schema.ts`) must stay `.passthrough()`:
  `ConfigModule` hands it all of `process.env`, so a strict object would reject
  `PATH`/`USERNAME` and block startup.
- `NODE_ENV` deliberately has no default, so an unset `NODE_ENV` never behaves
  like development. Necord's dev-gateway registration is gated on it plus
  `TEST_GUILD_ID`.
- `dotenv` is imported by `src/database/data-source.ts` and
  `src/database/scripts/create-schema.ts` but is **not** a declared dependency;
  it resolves only because `@nestjs/config` and `typeorm` hoist it. If you touch
  those files, add `dotenv` to `dependencies`.
- Catalog `price` and `size` are `bigint`, so pg returns them as strings — wrap
  in `Number()` before arithmetic, as `game-embed.service.ts` does. Prices are
  stored in cents.
- The TypeORM CLI entrypoints call `loadEnv()` themselves because they run
  outside Nest; the Nest path loads `.env` via `ConfigModule`. Keep that split.

## Deploy

Merges to `main` deploy themselves **when the change is releasable**.
`.releaserc.json` releases only on `feat` (minor), `fix`/`perf`/`revert`
(patch), and breaking changes (major); `chore`/`docs`/`ci`/`test` merges run CI
but produce no release, so the `publish` job's
`new_release_published == 'true'` guard skips the build and deploy. Do **not**
reintroduce catch-all release rules (`"type": "*"`, `"header": "**"`,
`"message": "{*,**}"`) — they made every merge cut a patch release and redeploy
an unchanged bot. Dependabot (`/.github/dependabot.yml`) opens grouped weekly
npm PRs and monthly GitHub Actions/Docker PRs as `chore(deps…)` commits — the
scoped `deps*` rule in `.releaserc.json` is what makes those merges release a
patch and deploy, while plain `chore` merges do not. Remove neither half
without the other, and do not add Renovate alongside it (duplicate PRs).
`release.yml` chains `ci` (the `build.yml` workflow via
`workflow_call`) → `release` (semantic-release; version inferred from the change; creates the
`v*.*.*` tag, GitHub Release, and notes) → `publish` (calls `deploy.yml` via `workflow_call`),
which
builds a multi-arch (`linux/amd64`, `linux/arm64`) image, pushes to `ghcr.io/<repo>`
with a provenance attestation, and pings a Coolify webhook. Hand-pushed tags and
manual dispatches trigger nothing: `deploy.yml` has no tag or `workflow_dispatch`
triggers, and `build.yml` no longer runs on push to `main` (it keeps its PR/dispatch
triggers). There is no npm publish step.

The Dockerfile never copies `.env`; `docker-compose.yml` injects variables
explicitly and bind-mounts `assets/`. `.env.prod` is gitignored. Migrations run
at container boot, so deploys have no separate migrate step.

## Spec-driven workflow

This repo uses GitHub Spec Kit (`.specify/`, `.opencode/commands/`). Work flows
through `/speckit.constitution` → `.specify` → `.plan` → `.tasks` →
`.implement` → `.converge`; artifacts land in `specs/<branch>/`. The bundled
scripts are bash (`--script sh`) and need `bash`, `git`, and `jq` on PATH — keep
them that way rather than porting them to PowerShell.

**Installed extensions** (`specify extension list`; sources in
`.specify/extensions/<id>/`, commands materialized into `.opencode/commands/`):
`bug` provides `/speckit.bug.assess` → `.fix` → `.test`, a per-bug triage loop
writing `.specify/bugs/<slug>/{assessment,fix,test}.md`; `assess` provides
`/speckit.assess.intake` → `research` → `define` → `shape` → `decide`, writing
`.specify/assessments/<slug>/`, where a *go* verdict hands off to
`/speckit.specify` and a *kill* closes the idea. Neither registers hooks, so the
Linear block below is unaffected. Beware: `specify extension add/update`
rewrites `.specify/extensions.yml` — it strips the comment header and reflows
the hook block — so restore the original content (keeping only the appended
`installed:` / `settings:` keys) instead of committing the CLI's formatting.
`.specify/extensions/.cache/` is a download cache and is gitignored.

**Linear is the tracker of record.** `.specify/extensions.yml` wires the
lifecycle to the Linear MCP: `after_tasks` → `/speckit.taskstolinear` (pushes
`tasks.md` tasks as subtasks of the feature's `STE-x` issue, deduping by
`T\d{3,}` ID), and `before_implement` / `after_implement` / `after_converge` →
`/speckit.linear-status <mode>` (status transitions + progress comments;
`converged` closes the issue only when every task checkbox is checked). Both
commands resolve the parent issue from the **`STE-x` key in the branch name**
and fall back to the `steammy-bot` project — never guess an issue. PR linking
and branch-driven transitions come from Linear's native GitHub integration, so
name feature branches with the `STE-x` key. `/speckit.taskstoissues` creates
_GitHub_ issues instead; do not run it alongside `taskstolinear` for the same
`tasks.md` — the two trackers will drift.
