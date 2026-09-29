# Implementation Plan: Nest 12 Toolchain and ESM Migration

**Branch**: `002-nest12-esm-toolchain` | **Date**: 2026-09-29 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/002-nest12-esm-toolchain/spec.md`

## Summary

Migrate Steammy's toolchain to the Nest 12 ESM defaults with zero runtime behavior change:
native ESM end to end (`"type": "module"`, all 69 relative specifiers made explicit, 15
type-only symbols marked, `import.meta.dirname` replacing `__dirname`), Jest → Vitest with two
configurations and strict suite boundaries, ESLint → oxlint with type-aware coverage preserved,
ts-node → tsx for the TypeORM CLI and `db:init`, plus declaring `dotenv`, updating CI/docs, and
amending the constitution before merge. The builder deliberately stays on the scaffold-default
`tsc` — Rspack was evaluated and rejected at clarification. The authoritative source for
mechanics is `docs/plans/nest12_esm_toolchain.md` (revised 2026-09-29 to match the builder
decision); this plan records technical context, constitution gates, and design artifacts.

## Technical Context

**Language/Version**: TypeScript `^6.0.0` (TypeORM CLI runs via `tsc` 6 under tsx); Node
`24.21.0` (`.nvmrc`) with `engines >= 24.15.0`.

**Primary Dependencies**: NestJS 12 (`@nestjs/common|core|cli|schematics@^12`), Necord 7,
discord.js 14, TypeORM 0.3.x (installed: `typeorm@0.3.31`), PostgreSQL (`pg`), zod. Toolchain
targets: Vitest 4 + `@vitest/coverage-v8`, `oxlint` + `oxlint-tsgolint`, `tsx`, Prettier (kept
unchanged). Explicitly NOT adopted: bundlers, `vite-tsconfig-paths`, `@nestjs/mau`,
`fork-ts-checker-webpack-plugin`.

**Storage**: PostgreSQL via TypeORM, hardcoded schema `steammy_bot`. No schema change, no
migration added; the only permitted migration edit is FR-002's one-line `import type`
marking (FR-011).

**Testing**: Vitest — unit config (`vitest.config.ts`, `root: './'`, `**/*.spec.ts`) and e2e
config (`vitest.config.e2e.ts`, `**/*.e2e-spec.ts`), with explicit cross-suite and
dist/build excludes (SC-004). `tsc --noEmit` remains the type authority for all files
including specs (FR-006).

**Target Platform**: Linux container (multi-arch `linux/amd64`, `linux/arm64`) on Node 24;
Windows for local development. CI on GitHub Actions.

**Project Type**: web-service (Discord bot) — tooling migration; no new external interfaces.

**Performance Goals**: N/A — no runtime performance change permitted; tooling-only change.

**Constraints**: FR-011 (zero behavior change), FR-013 (every phase green through the full
six-step gate; specifier/type-only/anchor changes land together), FR-004 (no path aliases),
FR-008/009/010 (migrations emitted by the single standard build, standalone-loadable, absence
= failed build), FR-012 (envSchema passthrough, no `NODE_ENV` default, hardcoded schema,
`loadEnv()` split preserved), SC-009 (scratch resources only).

**Scale/Scope**: 37 TypeScript files (36 under `src/`, 1 under `test/`); 69 relative import
specifiers across 29 files (50 concrete — including the 5 `src/shared/constants` sites, which
take a plain `.js` — plus 19 barrel imports: `src/config` 4, `src/database/entities` 10,
`src/shared/types` 5); 15 type-only symbols in 9 statements; 2 test specs; 1 existing
migration. No NEEDS CLARIFICATION — all open questions were resolved in
`/speckit.clarify` (2026-09-29) and by reading the installed packages and the live
`nestjs/schematics` `ts-esm` scaffold templates.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Constitution: `.specify/memory/constitution.md` — **v2.0.0** (ratified 2026-09-27, last
amended 2026-09-28).

| Principle / Constraint | Verdict | Notes |
|---|---|---|
| I — Platform definitions, not platform branches | PASS | No platform code touched; explicitly independent of `easy_add_platform` (FR-018). |
| II — Delivery before durable state | PASS | Broadcast logic untouched; the `broadcasted`-before-`send` defect is explicitly out of scope (FR-011). |
| III — Migrations, never synchronize | PASS | No schema change; migration file unedited; `db:init` prerequisite and `migrationsRun` behavior preserved. The mechanism under `tsc` is unchanged from today, so the current text stays true; CI gains the compiled-migrations assertion (FR-010/014). A clarifying clause (dynamic `import()` under ESM, CI assertion) is staged for the FR-017 amendment. |
| IV — CI gate is the definition of done | **CONFLICT — justified; amendment required before merge (FR-017)** | Step 3 names `npx eslint`; the `--fix` caution, the 22-warning baseline, the quoted-glob caution, and the ts-node bullet all change or become moot under oxlint + tsx. This feature *is* the toolchain swap, so the conflict is inherent, not incidental. Sequencing: implement → `/speckit.analyze` → `/speckit.constitution` (≥3.0.0, bump type maintainer-approved) → merge. Until amendment, every phase still runs all six *current* steps green (FR-013). |
| V — Tests live where Jest can find them | **CONFLICT — justified; same amendment** | The title names Jest (retired); the substance is preserved and strengthened: unit specs stay colocated, e2e stays under `test/`, and explicit include/exclude globs guarantee each suite collects only its own specs (SC-004) — stricter than the old `rootDir` mechanics. |
| TC — Stack additions are constitution-level | COVERED | Vitest, oxlint, tsx are stack additions routed through the FR-017 amendment. |
| TC — `envSchema` passthrough / `NODE_ENV` no default / `loadEnv()` split / hardcoded schema | PASS | Pinned untouched by FR-012. |
| TC — `dotenv` declared dependency | RESOLVED BY PLAN | FR-007 adds `dotenv` to `dependencies`. |
| TC — nodenext + eslint `sourceType: 'commonjs'` | MOOT after swap | `eslint.config.mjs` is deleted; no replacement declares `sourceType: 'commonjs'`. |
| TC — LF/CRLF hygiene, Prettier scope | PASS | `prettier --check` CI step and `.gitattributes` unchanged; eslint's CRLF blind spot (its prettier rule used `endOfLine: 'auto'`) disappears with eslint. |
| Deploy — release chain, Dockerfile, boot migrations | PASS | Dockerfile needs no change under the `tsc` decision; migrations still run at container boot with no deploy-time step (FR-015); no workflow trigger or release-chain changes. |

**Gate result (pre-Phase 0): PASS.** The two conflicts (IV, V) are inherent to the mandated
swap, explicitly scoped, pre-staged in the plan document's *Constitution Impact* section, and
hard-gated on FR-017 before merge — they are justified, not waived.

**Gate result (post-Phase 1 re-check): PASS — unchanged.** The design artifacts introduce no
new principles, patterns, or constraints beyond those tabled above.

## Project Structure

### Documentation (this feature)

```text
specs/002-nest12-esm-toolchain/
├── plan.md              # This file (/speckit.plan command output)
├── spec.md              # Clarified feature specification (input)
├── research.md          # Phase 0 output (/speckit.plan command)
├── data-model.md        # Phase 1 output (/speckit.plan command)
├── quickstart.md        # Phase 1 output (/speckit.plan command)
├── contracts/           # Phase 1 output (/speckit.plan command)
│   └── toolchain-commands.md
├── checklists/
│   └── requirements.md  # 16/16 passing (from /speckit.clarify)
└── tasks.md             # Phase 2 output (/speckit.tasks - NOT created by /speckit.plan)
```

### Source Code (repository root)

```text
src/                          # layout unchanged — specifier + import-type edits only
├── config/                   #   barrel imports → /index.js (4 sites)
├── database/
│   ├── data-source.ts        #   loadEnv() split preserved (FR-012)
│   ├── data-source-options.ts#   __dirname → import.meta.dirname (anchor, FR-003)
│   ├── migrations/           #   type-only imports marked (FR-002)
│   └── scripts/create-schema.ts
├── modules/                  #   broadcast, platforms, subscription, admin, bot, general, health
└── shared/
    ├── constants.ts          #   FILE, not a barrel → plain ".js" (5 sites)
    └── types/                #   pure-type barrel → "/index.js" + import type
test/
└── health.e2e-spec.ts        #   import type INestApplication

# repository-root change surface
+ vitest.config.ts            # NEW — unit suite (excludes e2e, dist, build, node_modules)
+ vitest.config.e2e.ts        # NEW — e2e suite only
+ .oxlintrc.json              # NEW — rules ported 1:1 from eslint.config.mjs, type-aware
- eslint.config.mjs           # DELETED
- test/jest-e2e.json          # DELETED
- build/                      # DELETED — stale gitignored tree (FR-016)
~ package.json                # "type": "module"; scripts; devDeps; dotenv declared
~ tsconfig.json               # types[], verbatimModuleSyntax: true, ts-node block removed
~ nest-cli.json               # unchanged: no builder key, deleteOutDir stays, no assets
~ tsconfig.build.json         # unchanged
~ .github/workflows/build.yml # lint step → npm run lint; migrations-dir assertion added
~ README.md                   # command table; decorator-metadata constraint documented
~ AGENTS.md                   # toolchain section updated (plan dir already revised)
~ Dockerfile                  # unchanged (FR-015 — nothing new to copy)

# authoritative mechanics (already revised for the tsc decision)
~ docs/plans/nest12_esm_toolchain.md
```

**Structure Decision**: Single project, repository-root layout — the directory structure is
deliberately unchanged (Non-Negotiable: no new modules, packages, or path aliases). The change
surface is root config files, CI, docs, and in-place edits inside the existing `src/` and
`test/` trees enumerated above. No new directories are created in source; the only additions
are the two Vitest configs and `.oxlintrc.json` at the root.

## Complexity Tracking

> Filled because the Constitution Check contains two violations that must be justified.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| Constitution Principle IV conflict (retired eslint CI step, `--fix` caution, stale warning baseline, glob caution, ts-node bullet) | The feature *is* the toolchain swap; the current text mandates tools this feature removes | Amending after merge leaves the constitution mandating retired tools against a tree that no longer has them — the governance rule is that amendments take effect exactly when the described state does |
| Constitution Principle V conflict (title names Jest; `rootDir` collection mechanics) | The runner swap necessarily retitles the rule; its substance (colocation + collection guarantees) is preserved and strengthened via explicit include/exclude globs | Keeping Jest to avoid the retitle would abandon the mandated Nest 12 default — the entire point of the feature |
