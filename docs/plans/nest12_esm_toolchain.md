# Steammy Bot — Nest 12 Toolchain and ESM Migration Plan

**Revised**: 2026-09-29 — builder decision: stay on the scaffold-default `tsc`; Rspack is
rejected and every Rspack-specific design in this document has been removed. The decision and
its rationale are recorded in `specs/002-nest12-esm-toolchain/spec.md` (Clarifications).

## Objective

Move Steammy from the pre-Nest-12 toolchain to the defaults that `@nestjs/schematics@12`
scaffolds for ESM projects, and adopt native ESM end to end.

Specifically:

1. Add `"type": "module"` and make every module specifier ESM-legal.
2. Replace Jest + ts-jest with Vitest.
3. Replace ESLint + typescript-eslint with oxlint, keeping type-aware coverage.
4. Replace ts-node with tsx for the TypeORM CLI and `db:init`.
5. Keep the build on `tsc`, the single-app default that `nest new` scaffolds (no `builder`
   key).

**Builder decision (resolved 2026-09-29 at clarification).** Rspack was the original fifth goal
and is now **rejected**: at this repository's scale it offers no meaningful build-time win, and
it changes the shape of `dist/` from a per-file tsc tree to a single bundle that omits
glob-loaded TypeORM migrations — a silent unmigrated-database failure mode that would otherwise
demand a second compilation pass, a permanent CI guard, and a documented output-directory quirk.
The `ts-esm` scaffold's `nest-cli.json` carries no `builder` key, so plain `tsc` is the actual
fresh-project default. Phase 0 records this decision and the migration-delivery guard it keeps;
everything else in this plan is unchanged.

This is a **tooling** migration. It MUST NOT change runtime behavior, the database schema,
Discord behavior, or the broadcast lifecycle.

It is a prerequisite for, and independent of, `docs/plans/easy_add_platform.md`. Nothing here
blocks or is blocked by that plan; the two may land in either order.

---

# Why

NestJS 12 changed what `nest new` produces. From the migration guide:

> `nest new` now prompts for CommonJS or ESM. ESM projects use Vitest by default, generated
> projects use oxlint by default.

Steammy is already on Nest 12 packages (`@nestjs/common@^12`, `@nestjs/core@^12`,
`@nestjs/cli@^12`, `@nestjs/schematics@^12`) but kept the old toolchain. The maintainer has
directed that it adopt the new defaults rather than continue to diverge.

Two independent gaps are in scope: the *toolchain* (test runner, linter, TS runner) and the
*module system*. The toolchain swap is mechanical. The ESM migration is not: it touches
**68 import specifiers across 29 of the repository's 37 TypeScript files**.

---

# Current Situation

## Verified baseline

| Fact | Value |
|---|---|
| `package.json` `"type"` | absent (CommonJS) |
| `tsconfig.json` `module` / `moduleResolution` | already `nodenext` / `nodenext` |
| `tsconfig.json` `verbatimModuleSyntax` | not set |
| `tsconfig.json` `paths` / `baseUrl` | neither set — **zero path aliases exist** |
| TypeScript files | 37 (36 under `src/`, 1 under `test/`) |
| `.tsc` typecheck today | exit 0, clean |
| Test runner | Jest 30 + ts-jest 29, config inline in `package.json:77-96` + `test/jest-e2e.json` |
| Linter | ESLint 9 flat config, `eslint.config.mjs`, `recommendedTypeChecked` |
| Node | `.nvmrc` 24.21.0, `engines` `>=24.15.0` |

## Import surface

| Metric | Count |
|---|---|
| Relative `from`-clauses | 68 |
| …written **without** a file extension | **68 (100%)** |
| …written with any extension | 0 |
| …resolving to a concrete `.ts` file | 49 |
| …resolving to a barrel `index.ts` | 19 |
| Files containing at least one relative import | 29 of 37 |
| Relative specifiers that resolve to nothing today | 0 |

Every relative specifier in the repository is extensionless. Not one `.js` specifier exists.

The 19 barrel imports, by target:

| Target | Sites |
|---|---|
| `src/config/index.js` | 4 |
| `src/database/entities/index.js` | 10 |
| `src/shared/types/index.js` | 5 |

**`src/shared/constants` is a file, not a barrel — this is a trap.** `src/shared/constants.ts`
is a sibling of the `src/shared/types/` *directory*, and the names invite the wrong assumption.
It has 5 import sites and needs a plain `.js`, not `/index.js`. A `/index.js` appended here is
a resolution failure, not a lint error. When rewriting specifiers, resolve the path on disk
rather than pattern-matching on the name.

## Construct audit

| Construct | Occurrences |
|---|---|
| `export =` | 0 |
| `import x = require(...)` | 0 |
| `namespace X { }` | 0 |
| `declare module` | 0 |
| `enum` / `const enum` | 0 |
| dynamic `import()` | 0 |
| `require()` in source | 0 |
| `__dirname` | **1** — `src/database/data-source-options.ts:13` |

`import 'reflect-metadata'` appears in exactly three files, all at line 1, and all three are
entry points: `src/main.ts`, `src/database/data-source.ts`,
`src/database/scripts/create-schema.ts`. No file is missing it.

## Type-only imports

`src/shared/types/index.ts` contains **only** `interface` and `type` declarations — zero runtime
exports. Its compiled `index.js` will be an empty ESM module. Any *value* import from it is a
hard `SyntaxError: The requested module does not provide an export named ...` at link time.

15 symbols across **12 import statements** in 8 files must become `import type`. The list below
is the authoritative one, produced by running the check this phase is about:

```bash
npx tsc --noEmit --verbatimModuleSyntax -p tsconfig.json 2>&1 | grep 'error TS1484'
```

`TS1484` is *"is a type and must be imported using a type-only import when 'verbatimModuleSyntax'
is enabled"*. It is emitted per **symbol**, not per statement, which is why 15 symbols occupy
only 12 statements — `xbox.service.ts:9` alone carries three. Reuse that command rather than
re-deriving the list by hand; it cannot drift from reality.

| File | Line | Symbols |
|---|---|---|
| `src/database/migrations/1790514243494-InitSchema.ts` | 1 | `MigrationInterface`, `QueryRunner` |
| `src/modules/broadcast/broadcast.service.ts` | 12-13 | `GamePlatformType`, `Game` |
| `src/modules/broadcast/game-embed.service.ts` | 4 | `Game` |
| `src/modules/broadcast/game-embed.service.spec.ts` | 2 | `Game` |
| `src/modules/platforms/epic.service.ts` | 10-13 | `EpicApiGame`, `EpicGame`, `FreeGamesPromotionApiResponse`, `Game` |
| `src/modules/platforms/xbox.service.ts` | 9 | `Game`, `XboxApiGame`, `XboxCatalogIdResponse` |
| `src/modules/subscription/subscription.service.ts` | 6 | `GamePlatformType` |
| `test/health.e2e-spec.ts` | 1 | `INestApplication` |

Seven statements already use `import type` and need no change; they are simply not in this list.
After this phase the tree has 19 type-only import statements in total.

Note the two `src/modules/platforms` services: `epic.service.ts` spans four separate
statements at 10-13 while `xbox.service.ts` packs the same three symbols onto one line at 9.
Converting these is a per-symbol judgement, not a find-and-replace.

`QueryRunner` and `MigrationInterface` are a second hazard: `typeorm`'s hand-maintained ESM
entry `typeorm/index.mjs` is a 208-name allow-list and **does not export either**.
Value-importing them fails at runtime even though the type is valid.

This is the most dangerous line in the migration, and it deserves emphasis. Under
`"type": "module"`, Node resolves the migration's `from 'typeorm'` through typeorm's `import`
condition, which points at `index.mjs` rather than the CJS entry. So the compiled migration
throws `SyntaxError: The requested module ... does not provide an export named 'QueryRunner'`
at link time. `tsc` is clean, `npm run type:check` is clean, and `npm test` never loads this
file. The failure lands on the first `migrationsRun` at container boot — and because
`migrationsRun: true` is set in `src/database/database.module.ts`, that is the *first thing the
app does*. A container that dies on boot is at least loud, which is the only reason this ranks
below the silent missing-migrations case in "The one thing not to get wrong".

## Current tests

| Spec | Shape | Needs decorator metadata? |
|---|---|---|
| `src/modules/broadcast/game-embed.service.spec.ts` | `new GameEmbedService()` directly | no |
| `test/health.e2e-spec.ts` | `Test.createTestingModule({ imports: [HealthModule] })` | no — `HealthController` has no constructor |

Neither existing test exercises constructor DI. See "Accepted Trade-offs".

## Pre-existing violation this plan fixes

`dotenv` is imported by `src/database/data-source.ts:3` and
`src/database/scripts/create-schema.ts:3` but is **not** a declared dependency. It resolves only
because `@nestjs/config` and `typeorm` hoist it. The constitution already records this as a known
violation. Phase 2 fixes it.

---

# Target State

```text
package.json   "type": "module"
               build: nest build

tsconfig.json  types: ["node", "vitest/globals"]
               verbatimModuleSyntax: true
               (no "ts-node" block)

nest-cli.json  (no "builder" key — default tsc, as scaffolded)
               compilerOptions.deleteOutDir: true

src/**         every relative specifier ends in .js (or /index.js)
               every type-only import marked `import type`
               import.meta.dirname in place of __dirname

dist/          per-file tsc tree (as today)
               database/migrations/*.js    (emitted by the same build, zero imports)

vitest.config.ts         unit specs
vitest.config.e2e.ts     e2e specs
.oxlintrc.json           type-aware lint rules
(no eslint.config.mjs)
(no test/jest-e2e.json)
(no jest block in package.json)
```

Reference for every target file: the templates shipped inside the already-installed
`node_modules/@nestjs/schematics/dist/lib/application/files/ts-esm/` — `package.json`,
`tsconfig.json`, `tsconfig.build.json`, `nest-cli.json`, `.oxlintrc.json`, `vitest.config.ts`,
`vitest.config.e2e.ts`, `src/main.ts`. Deviate from them only where this document says to.

---

# Non-Negotiables

These are not preferences. A change that violates one is not a valid implementation of this plan.

1. **No runtime behavior change.** No schema change, no migration added; the only permitted
   migration edit is the one-line `import type` marking that `verbatimModuleSyntax` forces on
   the migration file (no SQL, no class logic, no ordering change); no Discord behavior change,
   no broadcast ordering change.
2. **Do not touch broadcast logic.** The `broadcasted`-before-`send()` defect is real and is
   governed by the constitution's Principle II, but fixing it is **not** this plan. Do not
   "fix it while you are in there."
3. **No path aliases.** The repository has none; do not introduce any. A `@app/*` alias would
   also require a runtime resolver under ESM, which does not exist here.
4. **`envSchema` MUST stay `.passthrough()`** and `NODE_ENV` MUST keep having no default.
5. **The TypeORM CLI entrypoints MUST keep calling `loadEnv()` themselves.** They run outside
   Nest; the Nest path loads `.env` via `ConfigModule`. Do not unify them.
6. **Migrations MUST reach the running application.** The standard build MUST emit
   `dist/database/migrations/*.js`; a build that produces no loadable migration is a failed
   build, not a partial success, even when every tool exits 0. Assert it locally and in CI —
   see Phase 0.
7. **Every phase MUST leave the full CI gate green** (see Verification Gates) before the next
   begins. A partially-migrated tree does not get committed as a checkpoint.

---

# Phase 0 — Builder decision (resolved: stay on `tsc`)

This phase was originally the Rspack migration-delivery design. The maintainer resolved it at
clarification on 2026-09-29 (recorded in `specs/002-nest12-esm-toolchain/spec.md`): **keep the
scaffold-default `tsc` builder.** The single-bundle collision that motivated a second
compilation pass no longer exists. This section remains as the record of the decision and the
one property the rest of the plan must keep preserving: migrations reach the running
application.

## 0.1 Why Rspack was rejected

Rspack is the **monorepo** default upstream, not the single-app default. Read from the
installed `@nestjs/cli`: `get-builder.js:14` defaults to `'tsc'`; the `ts-esm` scaffold
template's `nest-cli.json` has no `builder` key; only the monorepo-only `nest g library`
schematic injects `builder: 'rspack'`. Adopting it here would have been a deliberate departure
from `nest new` output.

The costs it would have imposed on this repository, all verified rather than assumed:

- A Rspack bundle contains only modules reachable from the entry, and
  `src/database/migrations/1790514243494-InitSchema.ts` is imported by nothing. Under a
  bundle the migration glob would find nothing, `migrationsRun: true` would apply **zero**
  migrations, and the app would start against a nonexistent schema — no error, no crash, just
  no tables.
- Resolving that would have required a second compiler (`tsconfig.migrations.json`), a
  mandatory build order, a permanent CI guard, a Dockerfile change, and a README entry.
- The Rspack builder also ignores `outDir`, writing to its own `dist` default while deletion
  honors the configured value — a latent divergence to document forever.
- Decorator metadata would have survived (`builtin:swc-loader` sets `decoratorMetadata:
  true`) and dependencies stay external — but those were table stakes, not wins. At 37
  TypeScript files the build-time difference is negligible.

Under plain `tsc`, none of that machinery exists and none of those failure modes apply.

## 0.2 What the standard build delivers for free

The migration file is loaded at runtime via the glob at
`src/database/data-source-options.ts:13`:

```ts
export const migrationsGlob = join(__dirname, 'migrations', '*.{ts,js}');
```

Under tsc the compiled `dist/database/migrations/*.js` sits next to the compiled
`data-source-options.js`, so `import.meta.dirname` (Phase 6) resolves to `dist/database` and
the glob finds the migrations — the property the Rspack design had to engineer is the default
here. The glob resolves correctly in all three runtime contexts, unchanged:

| Context | `import.meta.dirname` | Glob resolves to | Loaded by |
|---|---|---|---|
| `tsx` from source (`db:init`, TypeORM CLI) | `src/database` | `src/database/migrations/*.ts` | tsx ESM hook |
| Built (`node dist/main`) | `dist/database` | `dist/database/migrations/*.js` | TypeORM dynamic `import()` |
| (`nest start` in watch) | `dist/database` | `dist/database/migrations/*.js` | TypeORM dynamic `import()` |

Nest's `assets` mechanism must NOT be used as a substitute for compiling migrations: it copies
files *verbatim* and would place `.ts` sources in `dist/`, which production cannot load without
a TypeScript runtime. Migrations are emitted by the build; never copied.

## 0.3 Why TypeORM can load an ESM migration

`typeorm@0.3.31`'s `util/ImportUtils.js` `importOrRequireFile` inspects the file extension, then
walks up to the nearest `package.json`. For `.js` and `.ts`:

```js
else if (extension === "js" || extension === "ts") {
    const packageJson = await getNearestPackageJson(filePath);
    if (packageJson != null) {
        const isModule = packageJson?.type === "module";
        if (isModule) return tryToImport();
        else return tryToRequire();
    }
    ...
}
```

With `"type": "module"` in the root `package.json`, migrations load via dynamic `import()`
(`Function("return filePath => import(filePath)")`, deliberately not transpiled to `require`).
The nearest `package.json` for both `src/database/migrations/*.ts` and
`dist/database/migrations/*.js` is the repository root, so both take the ESM branch. This is
verified, not assumed — it is the single fact the whole ESM migration story rests on.

`util/DirectoryExportedClassesLoader.js` then scans the imported module's exports for migration
classes. `InitSchema1790514243494` is a named export, so it is found.

## 0.4 Verification for this phase

All of the following MUST be observed, not assumed:

1. `npm run build` exits 0.
2. `dist/main.js` exists, alongside the per-file tree including
   `dist/database/migrations/1790514243494-InitSchema.js`.
3. `dist/database/migrations/1790514243494-InitSchema.js` exists and has **no** `import`
   statement (Phase 5 erased the type-only imports).
4. A boot against a scratch Postgres creates `steammy_bot` and applies the migration.
5. `npm run db:init` then `npm run migration:run` twice both succeed from source via tsx.
6. `npm run test:e2e` still passes.
7. `docker build` + container boot; the schema exists afterwards.

If step 3 or 4 fails, **stop and escalate.** Do not work around it by copying `.ts` files with
`assets`, by shipping `tsx` in the runtime image, or by disabling `migrationsRun`. A silently
unmigrated database is worse than a failed build.

---

# Phase 2 — `package.json`

Add `"type": "module"`.

## Scripts

| Script | New value | Note |
|---|---|---|
| `build` | `nest build` | unchanged — single standard compiler (builder decision, Phase 0) |
| `lint` | `oxlint --type-aware src/ test/` | |
| `test` | `vitest run` | |
| `test:watch` | `vitest` | |
| `test:cov` | `vitest run --coverage` | |
| `test:debug` | `vitest --inspect-brk --no-file-parallelism` | |
| `test:e2e` | `vitest run --config ./vitest.config.e2e.ts` | |
| `typeorm` | `node --import tsx node_modules/typeorm/cli.js -d src/database/data-source.ts` | |
| `db:init` | `tsx src/database/scripts/create-schema.ts` | |

Delete the entire `"jest"` block (`package.json:77-96`).

Unchanged: `format`, `start`, `start:dev`, `start:debug`, `start:prod`, `type:check`,
`migration:generate`, `migration:revert`, `migration:show`.

`start:prod` stays `node dist/main`. Node resolves a CLI entry point with extension fallback
even when the resolved file is ESM, which is why the Nest template ships that exact string.
Confirm it in Phase 0.4; fall back to `node dist/main.js` if it does not.

## Dependencies

- **Add** `dotenv`. See "Pre-existing violation" above.
- **Add devDeps:** `vitest`, `@vitest/coverage-v8`, `oxlint`, `oxlint-tsgolint`, `tsx`.
- **Remove devDeps:** `jest`, `ts-jest`, `@types/jest`, `@eslint/eslintrc`, `@eslint/js`,
  `eslint`, `eslint-config-prettier`, `eslint-plugin-prettier`, `typescript-eslint`, `ts-node`,
  `tsconfig-paths`, and `globals` (used only by `eslint.config.mjs` — confirm with a grep
  first; tasks T021 guards this).

No bundler packages are added — the builder stays `tsc` (Phase 0). `nest build` continues to
typecheck via the CLI's own tsc pass, and `npm run type:check` remains the mandatory CI gate
that also covers spec files.

`cross-env` is **kept**. The Nest template drops it, but `data-source-options.ts:47` gates
TypeORM logging on `process.env.NODE_ENV === 'development'` and that must keep working.

`tsconfig-paths` is removed because it is only referenced by the old `test:debug` script, which
this plan replaces. The reference template adds `vite-tsconfig-paths`; **do not add it** — the
repository has zero path aliases and this plan forbids introducing any (Non-Negotiable 3).

---

# Phase 3 — Configuration files

## New `vitest.config.ts`

Plain Vitest, no SWC plugin. `globals: true`, `root: './'`, `include: ['**/*.spec.ts']`.

Two required details:

1. Keep an explicit `exclude`: `exclude: ['**/*.e2e-spec.ts', '**/node_modules/**',
   '**/dist/**', '**/build/**']`. The current e2e name `health.e2e-spec.ts` does **not** match
   `**/*.spec.ts` (its suffix is `-spec.ts`), but the exclude defends the isolation invariant
   (SC-004) against a future `*.e2e.spec.ts` name and costs nothing.
2. `root: './'` scans the whole repo, so `dist/` and the stale gitignored `build/` tree MUST be
   excluded.

Coverage, carried over from the old Jest block:
`provider: 'v8'`, `reportsDirectory: './coverage'`, `include: ['src/**/*.ts']`.

## New `vitest.config.e2e.ts`

Same, with `include: ['**/*.e2e-spec.ts']`.

## New `.oxlintrc.json`

Port every rule from `eslint.config.mjs:27-47` **one for one**, including the `no-unsafe-*`
family as `warn` — the comment at `eslint.config.mjs:32-33` records that `object-mapper`'s
mapping schema is untyped by design, and that is still true after the migration. Preserve
`@typescript-eslint/no-explicit-any: off` and the `no-unused-vars` options
(`ignoreRestSiblings`, `argsIgnorePattern`, `varsIgnorePattern`).

`plugins: ["typescript", "vitest"]` so `describe`/`it`/`expect` resolve as defined.

`--type-aware` is enabled in the `lint` script, and `oxlint-tsgolint` is a required devDep.
This is what preserves `typescript/no-floating-promises` and the `no-unsafe-*` rules; tsgolint
implements 59 of the 61 typescript-eslint type-aware rules.

`npm run type:check` (`tsc --noEmit`) **remains the type authority.** tsgolint targets
TypeScript 7 via the Go port while this repository is on TypeScript 6; the two are not
interchangeable, and `type:check` is what typechecks spec files.

The `prettier/prettier` eslint rule is **dropped**, along with the `endOfLine: 'auto'` override.
Formatting is enforced by the separate `prettier --check` CI step, which already exists and
already has the strict LF enforcement that rule was working around. Removing the rule also
removes the CRLF blind spot the constitution records.

## Delete

- `eslint.config.mjs`
- `test/jest-e2e.json`

## `nest-cli.json`

No `builder` key — this matches the `ts-esm` scaffold template and keeps the default `tsc`
builder (builder decision, Objective and Phase 0):

```json
{
  "$schema": "https://json.schemastore.org/nest-cli",
  "collection": "@nestjs/schematics",
  "sourceRoot": "src",
  "compilerOptions": {
    "deleteOutDir": true
  }
}
```

`deleteOutDir: true` MUST stay. It is what guarantees `dist/database/migrations` is not stale
from a previous build.

Do not add `assets`. Migrations MUST be compiled by the build, never copied in as `.ts`
sources. See Phase 0.2.

## `tsconfig.json`

- `types: ["node", "jest"]` → `types: ["node", "vitest/globals"]`
- Add `"verbatimModuleSyntax": true`
- Delete the `"ts-node"` block

`module`/`moduleResolution`/`isolatedModules` are already correct and MUST NOT be changed.

`verbatimModuleSyntax` is what makes Phase 5 enforceable. Without it, `tsc` silently elides
type-only imports, so the production build would be correct while `tsx` and Vitest — both
single-file esbuild passes that cannot know an import is type-only — would emit broken ESM.
Turning the flag on converts a runtime failure into a typecheck failure.

## Untouched

`.prettierrc`, `tsconfig.build.json`, `pm2.config.json`, `docker-compose.yml`, `.gitattributes`.

`tsconfig.build.json` keeps `outDir: ./dist`, `rootDir: ./src`, `incremental: true`, and
`exclude: [..., "**/*spec.ts"]`. It is honored as written — the standard `tsc` build writes
exactly where `outDir` says.

---

# Phase 4 — ESM specifiers

Append `.js` to all 68 relative specifiers across 29 files. The 19 barrel imports also need
`/index.js`:

- `src/config/index.js` — 4 sites
- `src/database/entities/index.js` — 10 sites
- `src/shared/types/index.js` — 5 sites

This phase is self-verifying: `npm run type:check` reports every missed specifier as TS2307.
Do not hand-audit; let the compiler produce the list and work from it.

Two barrel files re-export from concrete files and are themselves included in the 68:
`src/config/index.ts` (4) and `src/database/entities/index.ts` (4).

Again, remember `src/shared/constants` is a file (5 sites) and takes a plain `.js`.

---

# Phase 5 — `import type`

Convert the 15 symbols in the 12 statements tabulated under "Type-only imports". The
`tsc --verbatimModuleSyntax` command in that section regenerates the list, so re-run it rather
than trusting this table if the two have drifted.

A `GamePlatformType` mixed import such as `broadcast.service.ts:12` needs an inline modifier
(`GamePlatform` stays a value, `GamePlatformType` becomes `type GamePlatformType`) rather than
splitting the statement, so the module is still loaded exactly once.

---

# Phase 6 — `__dirname`

`src/database/data-source-options.ts:13` → `import.meta.dirname`. Stable on Node 24; legal
under `module: nodenext` once `"type": "module"` is set.

Update the JSDoc at lines 9-12. The property it documents still holds, and this is the
load-bearing assumption of the whole migration: the glob must resolve to whichever directory
holds the loadable migrations at run time — `src/database/migrations` when running from source,
`dist/database/migrations` in every built context. See the table in Phase 0.2.

The glob expression itself is **unchanged**. Do not "fix" it to point at a hardcoded `dist` path;
that would break the `tsx`-from-source path used by `db:init` and the TypeORM CLI.

---

# Phase 7 — CI and documentation

## `Dockerfile`

**The Dockerfile needs no change.** It already copies `src`, `nest-cli.json`, `tsconfig.json`,
and `tsconfig.build.json` — with the builder decision there is no new configuration file to
copy. The `prepare` stage still copies `dist` (the per-file tree, including
`database/migrations/`), and `npm prune --omit=dev` works exactly as before.

## `.github/workflows/build.yml`

- Replace the bare `npx eslint "{src,apps,libs,test}/**/*.ts"` step (line 36) with
  `npm run lint`. The `prettier --check` and `type:check` steps stay and now carry the
  formatting and type guarantees ESLint used to provide.
- `npm test` and `npm run test:e2e` steps keep their names; both now run Vitest.
- The `migrations` job gains a step asserting that `dist/database/migrations/*.js` exists after
  `npm run build` in the `build` job, and that at least one emitted migration contains no
  `import` statement. This is the cheap CI guard for the silent-failure case in "The one thing
  not to get wrong" — a missing migrations directory is otherwise a silent production failure.
- The `migrations` job's `db:init` / `migration:run` steps now exercise the **tsx** path, not
  tsc. That is intentional: it is the same code path a developer runs locally, and it validates
  the ESM migration loading that `importOrRequireFile` performs.

## `README.md`

Update the command table at lines 59-62 to name oxlint and Vitest, and add a line recording the
decorator-metadata constraint documented under "Accepted Trade-offs" so it is not rediscovered
the hard way.

---

# Verification Gates

Run in this order. A partial run is not a pass. This is the constitution's Principle IV with
step 3 replaced.

1. `npx prettier --check "src/**/*.ts" "test/**/*.ts"`
2. `npm run type:check`
3. `npm run lint`
4. `npm run build`
5. `npm test`
6. `npm run test:e2e`

Plus, against a scratch Postgres — never production:

7. `npm run db:init`
8. `npm run migration:run`, then `npm run migration:run` **again** to prove idempotency
9. Boot the app and confirm `steammy_bot` exists and is populated by the migration
10. `docker build` + container boot, confirming `"type": "module"` survives `npm prune --omit=dev`
    and that `start:prod` resolves `dist/main`

And the migration-delivery assertions from Phase 0.4, which are the ones most likely to be
skipped because every tool can exit 0 even when they fail:

11. `dist/database/migrations/*.js` exists after `npm run build`
12. No file in `dist/database/migrations/` contains an `import` statement
13. A boot against an empty database creates the schema — this is the only assertion that
    actually proves migrations reach the running application

## Runtime interop to watch

All of these are CJS packages performing named or default imports from ESM. Each is a plausible
breakage point and none is caught by typecheck:

| Package | Risk |
|---|---|
| `chalk@4` | 4 default imports; CJS-only, no `exports` map. Relies on CJS default interop. If it breaks, upgrade to `chalk@5` (pure ESM) rather than working around it. |
| `object-mapper` | Named `merge` import from a package with no `main`, no `module`, no `exports`, and no types. Depends on `cjs-module-lexer` following a `module.exports = require()` re-export chain. Highest-risk item. |
| `discord.js@14` | 7 named imports from a CJS package; depends on lexer detection of `exports.X =` assignments. |
| `typeorm` | **One confirmed break, already known.** Only 6 distinct symbols are value-imported across the repo, and exactly 2 of them are absent from the 208-name `typeorm/index.mjs` allow-list: `MigrationInterface` and `QueryRunner`, both from `src/database/migrations/1790514243494-InitSchema.ts:1`. The other 4 (`Repository`, `DataSource`, `LessThanOrEqual`, `MoreThanOrEqual`) are present. |
| `necord@7` | Already native ESM, but Jest needed `transformIgnorePatterns` for it. Vite's dep optimizer should handle it; least predictable of the set. |

---

# Accepted Trade-offs

## Decorator metadata is unavailable in tests

Vitest transforms with esbuild, which does not emit `emitDecoratorMetadata`. The Nest-documented
remedy is `unplugin-swc`; the maintainer has chosen plain Vitest, matching the `nest new --esm`
scaffold.

Consequence: the two existing tests are unaffected (`GameEmbedService` is constructed directly
and takes no constructor arguments; `HealthController` has no constructor). But **seven** of the
nine `@Injectable()` classes use **bare constructor DI** with no `@Inject()`:

| Class | Constructor |
|---|---|
| `src/modules/admin/admin.commands.ts:13` | `EpicService`, `XboxService`, `BroadcastService` |
| `src/modules/bot/bot.service.ts:13` | `Client` |
| `src/modules/broadcast/broadcast.service.ts:20` | two params |
| `src/modules/general/general.commands.ts:8` | `Client` |
| `src/modules/platforms/epic.service.ts:74` | one param |
| `src/modules/platforms/xbox.service.ts:34` | one param |
| `src/modules/subscription/subscription.commands.ts:15` | `SubscriptionService` |

The remaining two are safe by accident: `GameEmbedService` and `SubscriptionService` declare
no-arg constructors. That is luck, not design — adding a dependency to either breaks its test
immediately.

This is larger than it first appears: 7 of 9 injectable classes, not a handful. The first test
that boots any of these through `Test.createTestingModule` fails with *"Nest can't resolve
dependencies of ..."*. The fix is explicit `@Inject(...)` on each parameter, or adding
`unplugin-swc` later.

This is a known, accepted limitation. It MUST be documented in `README.md` (Phase 7) so it is
discovered as a documented constraint rather than an unexplained failure.

## Builder stays `tsc` — Rspack rejected

Recorded here so the choice is never re-opened by accident. Rspack is the **monorepo** default
upstream, not the single-app default: `get-builder.js:14` defaults to `'tsc'`, the `ts-esm`
scaffold template's `nest-cli.json` has no `builder` key, only `library.factory.js:195-196`
(the monorepo-only `nest g library` schematic) injects `builder: 'rspack'`, and
`upgrade/steps/cli-config.step.js` rewrites `builder` only for projects already on webpack.

It was evaluated on 2026-09-29 and rejected for this repository: at 37 TypeScript files the
build-time win is negligible, while a bundle omits glob-loaded migrations — requiring a second
compilation pass, a permanent CI guard, a Dockerfile change, and a documented `outDir`
divergence to prevent a silent unmigrated-database failure. Staying on `tsc` is also the
literal fresh-`nest new` default, which is the stated goal of this migration. The full
reasoning is Phase 0.1; the decision is recorded in
`specs/002-nest12-esm-toolchain/spec.md` (Clarifications).

## `cross-env` retained

A deliberate deviation from the Nest 12 scaffold, for the `NODE_ENV` reason in Phase 2.

## `vite-tsconfig-paths` omitted

A deliberate deviation. The repository has no path aliases and Non-Negotiable 3 forbids adding
them.

---

# Constitution Impact

**This plan conflicts with the ratified constitution and cannot be merged until the constitution
is amended.** `.specify/memory/constitution.md` is at **v2.0.0** (last amended 2026-09-28;
earlier drafts of this plan cited v1.0.0 — every conflict listed below was re-verified as still
present in the 2.0.0 text on 2026-09-29) and explicitly supersedes informal practice, README
claims, and habitual convention.

## Required amendments

| Constitution location | Conflict |
|---|---|
| Principle IV, step 3 | Names `npx eslint "{src,apps,libs,test}/**/*.ts"` as CI step 3. Becomes `npm run lint`. |
| Principle IV, bullet 2 | `npm run lint` MUST NOT be used as a verification step because it passes `--fix`. **The oxlint `lint` script has no `--fix`, so this caution inverts** and MUST be rewritten. |
| Principle IV, bullet 3 | 22 ESLint `no-unsafe-*` warnings is the documented baseline. The oxlint baseline must be measured and re-documented. |
| Principle IV, bullet 4 | The quoted-glob caution is about eslint's brace expansion and **ceases to apply** once the glob is gone. |
| Principle IV, bullet 5 | `ts-node` runs `transpileOnly`, so the TypeORM CLI does not typecheck. Moot under `tsx`. |
| **Principle V** | Titled *"Tests Live Where Jest Can Find Them"*. The **name itself** is runner-specific. The rule's substance — colocate unit specs, e2e specs under `test/`, an uncollected spec is worse than none — survives and MUST be preserved, but the title and the `rootDir: "src"` mechanics do not. |
| Principle III | States "Nest sets `migrationsRun: true` and auto-migrates on boot." Still true, and the mechanism is unchanged under `tsc` — the standard build emits `dist/database/migrations/`. While amending, it SHOULD gain a clause that under native ESM TypeORM loads migrations via dynamic `import()` (nearest `package.json` with `type: "module"`), and that CI asserts the migrations directory exists after a build. |
| Technical Constraints | "`module`/`moduleResolution` are `nodenext` while ESLint declares `sourceType: 'commonjs'`. This MUST NOT be 'fixed'" — moot once `eslint.config.mjs` is deleted. |
| Technical Constraints | The `dotenv` violation — **resolved** by this plan. |
| Technical Constraints, Runtime and toolchain | "Stack is NestJS + Necord + discord.js + TypeORM + PostgreSQL. Additions to it are a constitution-level decision." Vitest, oxlint and tsx are additions and so are squarely in scope for this amendment (the builder stays `tsc`, which is not an addition). |
| Technical Constraints, Repository hygiene | Notes eslint's prettier rule used `endOfLine: 'auto'`, which is why CRLF broke `prettier --check` but not eslint. With the rule gone, the LF hazard is now visible to both tools. The `.gitattributes` `eol=lf` requirement becomes load-bearing rather than incidental. |

## Bump type — decided on the feature branch, not here

The constitution's governance section says the bump MUST NOT be chosen silently, and that a
maintainer MUST be asked when a bump is ambiguous. This case is ambiguous:

- **MINOR** — every rule is being *swapped* for a tool of equivalent or greater capability;
  `no-floating-promises` and the `no-unsafe-*` family are preserved via `--type-aware`, and the
  number of CI steps is unchanged. Nothing is relaxed.
- **MAJOR** — Principle V is being retitled, which is arguably *redefining a principle*, and
  Principle IV's meaning shifts (the `--fix` inversion). Existing compliant work under the old
  wording becomes non-compliant.

**The argument is pre-staged so the decision is a formality, but it MUST be made on the feature
branch that implements this, not on the branch that documents it.**

**This plan does not amend the constitution and MUST NOT.** The reasoning matters:

- The constitution describes the state of the code. On a documentation-only branch nothing is
  implemented, so there is nothing to justify an amendment, and 2.0.0 remains a true statement
  about the tree as it stands.
- Amending early would make the constitution *false on `main`* — mandating `npm run lint`
  (oxlint) against a codebase whose CI still runs `npx eslint`. Your governance section says
  "amendments take effect on merge", so a merged amendment is immediately binding.
- Deferring past implementation is worse: `speckit.analyze` treats any conflict with a
  constitution MUST as automatically CRITICAL, with the prescribed remedy being to adjust the
  spec. Choosing the new text under deadline, after days of non-compliant work, is how a
  constitution gets quietly diluted.

**Correct sequencing.** On the feature branch: `/speckit.specify` → `/speckit.clarify` →
`/speckit.plan` (sourcing this document) → `/speckit.analyze`. That analyze run is *expected* to
report the Principle IV/V conflicts as CRITICAL against 2.0.0, and its output is the
authoritative checklist for what 3.0.0 must cover — better than hand-deriving it. Then
`/speckit.constitution` writes 3.0.0 as a **separate commit in the same branch**, followed by
`/speckit.tasks` → `/speckit.checklist` → `/speckit.implement` → `/speckit.converge`. One PR, so
the constitution and the code it describes become true at the same instant.

Recorded recommendation, for the maintainer to ratify or override at that time: **MAJOR
(3.0.0)**, on the grounds that Principle V's title names Jest and Principle IV's five bullets
are redefined, either of which satisfies "redefining a principle" independently.

## AGENTS.md

`AGENTS.md` repeats the CI command list and the Jest/ts-node guidance, so it MUST be amended in
the same change or it will contradict the constitution. It also names
`docs/plans/easy_add_platform.md` as "the maintainer's active directive"; add a parallel
reference to this plan for the tooling and module system.

---

# Migration strategy

Phases are ordered so that each leaves a working, green tree.

| Phase | Depends on | Reversible independently |
|---|---|---|
| 0 — Builder decision + migration-delivery guard | — | yes |
| 2 — `package.json` | — | yes |
| 3 — Config files | 2 | yes |
| 4 — ESM specifiers | 3 | yes |
| 5 — `import type` | 4 | yes |
| 6 — `__dirname` | 5 | yes |
| 7 — CI, docs | 6 | yes |
| — Constitution amendment | 7 | separate change; see "Constitution Impact" |

Phase 0 now records the resolved builder decision and the migration-delivery guard; it is
sequenced first because that guard — compiled migrations present after every build — is the
invariant the rest of the migration must never break.

Phases 4-6 are interdependent: appending `.js` without adding `import type` produces a build
that typechecks under `verbatimModuleSyntax` and fails at runtime, and vice versa. Expect to
land them together. Do not commit a tree where `.js` specifiers are added but `verbatimModuleSyntax`
is off and Phase 5 is incomplete.

Phase 5 has a hard dependency on Phase 0.3: the emitted migration is only clean because
`import type` is fully erased from it. If a migration ever gains a real value import,
`dist/database/migrations/*.js` will carry an `import` statement and must be re-checked against
Node's resolution rules — including typeorm's ESM allow-list.

---

# Rollback

The entire migration is a single revertable branch. No schema change, no data change, no
external state. Reverting the branch restores the CommonJS toolchain exactly.

**Before deploying, verify against a scratch database that `dist/database/migrations/*.js` is
present and that a container boot creates the schema.** This is the one failure mode in this
plan that produces no error and no crash — the app starts happily against a database with no
tables, and
the first symptom is a bot that silently stops announcing games. That is the shape of the
existing `broadcasted`-before-`send()` defect in a new costume, and it deserves the same
suspicion.

Deployment safety, per constitution §16 of the platform plan:

```text
Production
├── Production Discord application/bot
├── Production Discord server
└── Production database

Development
├── Development Discord application/bot
├── Development Discord server
└── Development database
```

Local work MUST NOT point at the production database. Use a scratch Postgres. Do not use the
production Discord token.

---

# Acceptance criteria

The migration is complete only when all of these are true.

### ESM

- [ ] `package.json` has `"type": "module"`.
- [ ] Every relative specifier in `src/` and `test/` ends in `.js`, or `/index.js` for a barrel.
- [ ] No extensionless relative import remains (`npm run type:check` is the proof).
- [ ] All 15 type-only symbols are `import type` or carry an inline `type` modifier.
- [ ] `verbatimModuleSyntax` is enabled and `npm run type:check` passes.
- [ ] No `__dirname` remains; `import.meta.dirname` is used.
- [ ] `npm run build` emits a `dist/` the app actually boots from.
- [ ] The stale gitignored `build/` tree is deleted so it cannot be mistaken for build output.

### Tests

- [ ] `vitest.config.ts` and `vitest.config.e2e.ts` exist; `test/jest-e2e.json` is gone.
- [ ] The `jest` block is gone from `package.json`.
- [ ] `npm test` runs **only** `game-embed.service.spec.ts`.
- [ ] `npm run test:e2e` runs **only** `health.e2e-spec.ts`.
- [ ] Neither run picks up the other, and neither scans `dist/` or `build/`.
- [ ] `npm test -- game-embed` still focuses a single spec.

### Lint

- [ ] `.oxlintrc.json` exists; `eslint.config.mjs` is gone.
- [ ] `npm run lint` passes with the type-aware backend active.
- [ ] The measured warning count is recorded in the constitution amendment, replacing the
      stale "22 warnings" baseline.
- [ ] `npm run lint` does not modify files.
- [ ] ESLint and typescript-eslint are uninstalled.

### Runner and CLI

- [ ] `tsx` replaces ts-node for `db:init` and the TypeORM CLI.
- [ ] The `ts-node` block is gone from `tsconfig.json`.
- [ ] `dotenv` is a declared dependency.
- [ ] `db:init` and both `migration:run` invocations succeed against a scratch Postgres.
- [ ] A fresh boot applies migrations.

### Build

- [ ] `nest-cli.json` has **no** `builder` key and keeps `deleteOutDir: true`.
- [ ] `build` is a single `nest build`; no second compilation pass exists anywhere.
- [ ] No bundler devDeps (`@rspack/core`, `webpack-node-externals`, `tsconfig-paths-webpack-plugin`)
      were added; no `tsconfig.migrations.json` exists; no `assets` entry was added to
      `nest-cli.json`.
- [ ] `npm run build` produces a `dist/` tree that includes `dist/database/migrations/*.js`.
- [ ] No emitted migration contains an `import` statement.
- [ ] A fresh boot applies migrations, so `steammy_bot` exists afterward.
- [ ] The Dockerfile is unchanged (no new config to copy) and the image builds and boots.
- [ ] CI asserts the migrations directory exists after a build.

### Docs and governance

- [ ] `README.md` command table names oxlint and Vitest.
- [ ] `README.md` documents the decorator-metadata constraint.
- [ ] `.gitattributes` still forces `eol=lf` and CRLF is not present in the tree.
- [ ] The constitution is amended per the maintainer's chosen bump type.
- [ ] `AGENTS.md` no longer instructs anyone to run eslint or Jest.

---

# Implementation rule for the LLM

Do not implement this document by pattern-matching on the target files. Several of the
conclusions here are non-obvious and were established by reading installed package source, not
by convention:

- the exact Vitest/Oxlint/tsconfig target values, which are in
  `node_modules/@nestjs/schematics/dist/lib/application/files/ts-esm/` (re-verified against
  `nestjs/schematics` master on 2026-09-29: `nest-cli.json` ships no `builder` key — plain `tsc`
  is the single-app default);
- that `typeorm@0.3.31` loads ESM migrations via dynamic `import()` when the nearest
  `package.json` has `type: "module"` (`util/ImportUtils.js`), which is the fact the ESM
  migration story rests on;
- that `import type` is mandatory rather than stylistic, because `shared/types/index.ts` has no
  runtime exports and `typeorm`'s ESM entry omits `QueryRunner`;
- that tsx and Vitest are single-file transforms that cannot elide type-only imports, which is
  what makes `verbatimModuleSyntax` load-bearing.

Re-verify against the installed packages before acting. If a fact in this document turns out to
be wrong, correct the document and say so — do not work around it silently.

Do not combine this plan with `docs/plans/easy_add_platform.md`. They are independent. A commit
containing both is unreviewable.

Do not fix the `broadcasted`-before-`send()` defect here. It is a real bug and it is governed by
the constitution's Principle II, but it is separate work with its own review.

## The one thing not to get wrong

A build that silently produces no migrations is worse than a build that fails. The app will
start, connect to Postgres, log no error, and simply never announce another game. There is no
alert and no crash — just a bot that goes quiet.

Therefore: if `dist/database/migrations/*.js` is not present after `npm run build`, **the build
failed**, even though every tool exited 0. That is why Phase 0.4 step 3 is an explicit check and
why Phase 7 adds a CI guard for it. Do not let a "green" CI run be the evidence that migrations
exist; check the directory.
