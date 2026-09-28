# AGENTS.md

Steammy is a Discord bot (NestJS + Necord + TypeORM/Postgres) that announces
free game offers from Xbox Game Pass and Epic Games. Entry points:
`src/main.ts` → `src/app.module.ts`; features live in `src/modules/*`.

## Commands

CI (`.github/workflows/build.yml`) runs these in order — run all of them before pushing:

```bash
npx prettier --check "src/**/*.ts" "test/**/*.ts"
npm run type:check
npx eslint "{src,apps,libs,test}/**/*.ts"   # no --fix
npm run build
npm test
npm run test:e2e
```

- `npm run lint` is **not** the CI command: it passes `--fix` and rewrites your
  files. CI runs eslint read-only, so an uncommitted autofix is still a failure.
- `npm run format` writes Prettier output over `src/` and `test/`.
- `npm install --ignore-scripts` is required. necord's postinstall crashes on
  Windows; CI uses `npm ci --ignore-scripts` on Linux too.
- Node: `.nvmrc` pins `24.21.0`, `engines` requires `>=24.15.0`. The README's
  "Node >= 22.12" is stale — trust `.nvmrc`.
- Line endings: `.gitattributes` forces `eol=lf`. If your editor or a tool
  rewrites files to CRLF, `prettier --check` fails on every file while eslint
  still passes (its prettier rule uses `endOfLine: 'auto'`). Fix the line
  endings, not the Prettier config.

## Tests

- Unit specs are colocated in `src/**/*.spec.ts`. Jest's `rootDir` is `src`, so
  a spec under `test/` is invisible to `npm test`.
- E2E specs are `test/**/*.e2e-spec.ts` (`npm run test:e2e`).
- Focus one: `npm test -- game-embed` (path) or `npm test -- -t "name"`.
- `tsconfig.build.json` excludes `**/*spec.ts`, so specs never reach `dist/` —
  but `tsc --noEmit -p tsconfig.json` *does* typecheck them. `type:check` is the
  only gate for spec files.
- Unit specs construct services directly (`new GameEmbedService()`), no Nest
  testing module. E2E uses `Test.createTestingModule` with a single module, so
  it needs neither a database nor a Discord token.
- `ts-node` runs `transpileOnly`, so `npm run typeorm` and `npm run db:init` do
  not typecheck. Run `type:check` separately.

## Database

- Schema `steammy_bot` is hardcoded in `src/config/database.config.ts`
  (`DATABASE_SCHEMA`) on purpose, so the schema literal baked into generated
  migrations is identical in every environment. Do not make it configurable.
- `synchronize` is never used; schema changes go through migrations only.
- `npm run db:init` is a prerequisite, not a convenience: TypeORM will not
  create the Postgres schema, and it creates the `migrations` table *inside*
  that schema. Run it once per database before any `migration:run`.
- `npm run migration:generate` diffs entities against the **live** database. Run
  it against a fully migrated DB or it emits a wrong migration.
- Nest sets `migrationsRun: true` (`src/database/database.module.ts`), so the app
  auto-migrates on boot. The TypeORM CLI does not.

**A new entity must be registered twice**: in the `src/database/entities/index.ts`
barrel *and* in the `entities` array in `src/database/data-source-options.ts`.
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

**Read `docs/plans/nest12_esm_toolchain.md` first — it is the maintainer's
directive for migrating this project to the Nest 12 defaults.** It is a
**pending** directive: nothing in it is implemented, and the commands above
still describe the current CommonJS/Jest/ESLint/tsc toolchain accurately. Do
not assume any part of it has landed.

It plans the move to native ESM plus Vitest, oxlint, tsx, and Rspack. Rspack is
committed, not optional, and it is not a free swap: the bundle changes the shape
of `dist/` from a per-file tsc tree to a single `main.js`, which collides with
TypeORM's runtime migration glob. The plan resolves that with a dedicated
`tsconfig.migrations.json` and a two-step `build`; until that lands,
`dist/database/migrations/*.js` is where migrations come from.

Two hazards worth knowing before you touch anything here:

- Every relative import is currently extensionless (68 of them across 29
  files). Adding `"type": "module"` without appending `.js` — or `/index.js` for
  the 19 barrel imports — breaks at runtime, not at typecheck.
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
- `module`/`moduleResolution` are `nodenext` while ESLint declares
  `sourceType: 'commonjs'`. Don't "fix" this without checking `npm run build`.
- ESLint uses `recommendedTypeChecked` with `projectService`, so lint is
  type-aware and slow. `no-unsafe-*` are warnings, not errors, because
  `object-mapper`'s mapping schema is untyped. 22 warnings on a clean tree is
  normal; do not try to clear them.
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

Merges to `main` deploy themselves. `release.yml` chains `ci` (the `build.yml` workflow via
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
