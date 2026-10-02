# Implementation Plan: Guild-Scoped Dev Smoke Commands

**Branch**: `STE-185-006-dev-smoke-commands` | **Date**: 2026-10-02 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/006-dev-smoke-commands/spec.md`

## Summary

Four commands (`/sync`, `/broadcast`, `/dev sync`, `/dev broadcast`) become reachable only in
`TEST_GUILD_ID`, the two `/dev` commands exist only during a local development run, and both dev
commands drive the _existing_ sync/broadcast pipeline rather than a parallel one: `/dev sync` resets
a platform's catalog to a fresh storefront snapshot and marks it announced, `/dev broadcast` picks
one row per platform, suppresses the surplus, and delivers it to the channel the command was typed
in — never to a subscription row.

Technically the feature is three scoped changes, none of which alters the database schema:

1. **A runtime command-scope hook** (`CommandScopeService.onModuleInit`) that reads `TEST_GUILD_ID`
   and `NODE_ENV` through `ConfigService` and decides, per command, whether it is removed from
   Necord's registry or pinned to the test guild. It runs in the `onModuleInit` phase — after
   Necord has populated its command cache and before `client.login()` — so the outcome does not
   depend on import-time environment variables (research R1).
2. **Five new `PlatformRepository` primitives** per platform (`findDevCandidate`,
   `markBroadcastedExcept`, `markPending`, `clear`, `markAllBroadcasted`), reached through the
   interface rather than raw SQL, plus two `PlatformRuntime` methods (`reset`, `devBroadcast`) on
   `GenericPlatform`.
3. **An optional recipient argument on the existing `BroadcastService.send`**, so `/dev broadcast`
   supplies the invocation channel while the scheduled pass and `/broadcast` keep supplying
   subscriptions — one send, one embed, no second sender (FR-012, Clarification 3).

## Technical Context

**Language/Version**: TypeScript under `tsc` (Nest builder), Node `24.21.0` (`.nvmrc`, engines
`>=24.15.0`), native ESM — every relative import carries an explicit `.js` / `/index.js` extension.

**Primary Dependencies**: NestJS 12, Necord (slash-command discovery and registration), discord.js,
TypeORM 0.3 + PostgreSQL, Zod (`envSchema`, unchanged), `chalk`, Vitest, type-aware oxlint, Prettier.

**Storage**: PostgreSQL, schema `steammy_bot`. Existing tables `catalog_epic`, `catalog_xbox`,
`subscription`, `guild`. **No schema change and no migration** — the feature only rewrites the
`broadcasted` column and deletes rows already in scope (research R9).

**Testing**: Vitest. Unit specs colocated as `src/**/*.spec.ts` and constructed directly
(`new GenericPlatform(...)`, no Nest testing module); e2e specs as `test/**/*.e2e-spec.ts` against
the disposable `steammy_test` database. The two globs stay disjoint (Principle V).

**Target Platform**: Linux container (multi-arch image built by `deploy.yml`) for production;
local Windows/macOS development through `npm run start:dev` (`cross-env NODE_ENV=development`).

**Project Type**: Discord bot service (single Nest application), not a library.

**Performance Goals**: No throughput target. The one timing constraint is Discord's roughly
three-second interaction window (FR-017 / SC-011), met by deferring the reply on entry rather than
by any optimisation — storefront latency is out of our control.

**Constraints**:

- No new `if (platform === ...)` branching in generic code (Principle I); everything platform
  specific goes through the registry and the per-platform repository (FR-011).
- Delivery-before-state ordering stays intact for the production pipeline (Principle II); the two
  places that deliberately mark rows announced without sending are covered by the ratified MAJOR
  carve-out and must report their suppression count (FR-015).
- `synchronize` stays disabled; with no schema change there is nothing to migrate (Principle III).
- All six CI steps must pass locally and in order (Principle IV); specs live where the include
  globs find them (Principle V).
- `envSchema` stays `.passthrough()`, `NODE_ENV` keeps having no default, and no `.env` value is
  read outside `ConfigService` in the Nest path.

**Scale/Scope**: 2 registered platforms, 4 in-scope commands (3 root commands, `/dev` carrying two
subcommands), 1 new service, 1 new command class, 5 new repository primitives per platform, 0
migrations, 0 new entities.

**NEEDS CLARIFICATION**: none. Every open technical question raised by the spec is resolved with a
decision, a rationale, and rejected alternatives in [research.md](./research.md).

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

| #   | Gate                                                               | Status                 | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                   |
| --- | ------------------------------------------------------------------ | ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| I   | Platform definitions, not platform branches                        | **PASS**               | `/dev sync <platform>` resolves through `PLATFORM_REGISTRY` exactly as `/sync` does; no new `platform === ...` branch is added anywhere; the five new repository primitives are members of `PlatformRepository`, so both platforms get them through their own definition.                                                                                                                                                  |
| II  | Delivery before durable state                                      | **PASS (conditional)** | `GenericPlatform.broadcastPending` still marks only after `send()` reports success. FR-006/FR-009 do mark without sending — permitted only by the carve-out the maintainer ratified as **MAJOR** (3.1.2 → 4.0.0, Clarification 4), whose condition (report the suppressed count, FR-015) is designed in from the start. **The amendment must be merged before this feature**; it is tracked as Task 0 and blocks the rest. |
| III | Migrations, never `synchronize`                                    | **PASS**               | No entity, column, or table changes; no migration file is added and `synchronize` is not touched.                                                                                                                                                                                                                                                                                                                          |
| IV  | The CI gate is the definition of done                              | **PASS**               | quickstart.md and Task-last require all six steps locally in order; `npm run lint` is never given `--fix`.                                                                                                                                                                                                                                                                                                                 |
| V   | Tests live where the include globs find them                       | **PASS**               | New unit specs colocated under `src/` (scope hook, repository primitives, `GenericPlatform.reset` / `devBroadcast`, recipient send); e2e additions stay under `test/`. No Nest testing module is introduced for unit specs.                                                                                                                                                                                                |
| —   | Technical constraints (ESM, `envSchema`, `NODE_ENV`, dotenv split) | **PASS**               | Scope decisions are read through `ConfigService`, never from `process.env` at import time; `envSchema` is not modified (no new variable is needed); no CLI entrypoint is touched, so the `loadEnv()` split is unaffected.                                                                                                                                                                                                  |
| —   | Issue tracking                                                     | **PASS**               | Linear `STE-185` exists and the branch name carries the key.                                                                                                                                                                                                                                                                                                                                                               |
| —   | Compliance review expectations                                     | **PASS**               | No partial-gate pass, no new platform branching, delivery ordering preserved, tracker respected, and the MAJOR bump carries the explicit maintainer sign-off the constitution requires.                                                                                                                                                                                                                                    |

**Gate result: PASS.** The one condition — the Principle II amendment landing first — is a
sequencing prerequisite recorded as Task 0, not an unjustified violation, so nothing is entered in
Complexity Tracking.

### Post-design re-check (after Phase 1)

Re-run against the delivered design in [research.md](./research.md), [data-model.md](./data-model.md)
and [contracts/](./contracts/dev-command-contracts.md):

| Gate                                    | Post-design                       | Evidence added by the design                                                                                                                                                                                                                                                                                                                                                           |
| --------------------------------------- | --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| I                                       | **PASS**                          | R4 keeps both new eligibility-bearing primitives inside each platform's repository; `selectCommandScope` and `GenericPlatform` name no platform.                                                                                                                                                                                                                                       |
| II                                      | **PASS (conditional, unchanged)** | R5/R6 sequence the mark-after-suppress decision inside `GenericPlatform`, where Principle II already expects it; contracts R-4.5 confines the carve-out to exactly two methods, both of which must return a count. Task 0 still gates the code.                                                                                                                                        |
| III                                     | **PASS (strengthened)**           | R9 confirms there is no column, table or entity to migrate — no file under `src/database/` changes at all.                                                                                                                                                                                                                                                                             |
| IV                                      | **PASS**                          | quickstart.md lists all six steps in order and warns that a partial run is not a pass.                                                                                                                                                                                                                                                                                                 |
| V                                       | **PASS (strengthened)**           | R10 fixes the split: decision function unit-tested directly, hook ordering tested in e2e with the real `SlashCommandsModule`; both globs stay disjoint and no unit spec gains a Nest testing module.                                                                                                                                                                                   |
| Manual-registration convention          | **PASS**                          | The design never calls `application.commands.set` itself — it edits Necord's registry through `setGuilds`/`remove`, the same API Necord's own `development` option uses, and lets Necord perform registration. The repo convention ("no manual slash-command registration") therefore still holds; §1 records what changed, which is _which commands exist_, not _who registers them_. |
| `envSchema` / `NODE_ENV` / dotenv split | **PASS (strengthened)**           | R1 shows every scoped read goes through `ConfigService` in `onModuleInit`, after `ConfigModule.forRoot()` has assigned `.env` — no import-time `process.env` read anywhere, and no new variable.                                                                                                                                                                                       |
| Compliance review expectations          | **PASS**                          | R8 discharges the stale-global question, R11 records the MAJOR sign-off, and contracts §5 makes FR-015's reporting condition an assertable obligation rather than prose.                                                                                                                                                                                                               |

**Post-design gate result: PASS.** No new violation surfaced; the two conditional rows are
unchanged in substance and now carry the evidence that discharges them.

## Project Structure

### Documentation (this feature)

```text
specs/006-dev-smoke-commands/
├── plan.md                    # this file
├── research.md                # Phase 0 — R1…R10, all unknowns resolved
├── data-model.md              # Phase 1 — row-state model, no schema change
├── quickstart.md              # Phase 1 — runnable validation scenarios
├── contracts/
│   └── dev-command-contracts.md   # Phase 1 — registration, pipeline, reply contracts
├── checklists/requirements.md # validated 16/16 before planning
├── spec.md                    # the clarified specification
└── tasks.md                   # Phase 2 — created by /speckit.tasks, NOT by this command
```

### Source Code (repository root)

```text
src/modules/bot/
├── bot.module.ts                  # + provide CommandScopeService
├── bot.service.ts                 # unchanged
└── command-scope.service.ts       # NEW — FR-001, FR-002, FR-003, FR-013, FR-014

src/modules/admin/
├── admin.module.ts                # + provide DevCommands
├── admin.commands.ts              # unchanged (/sync, /broadcast behaviour untouched)
└── dev.commands.ts                # NEW — /dev sync, /dev broadcast (FR-005…FR-010, FR-015…FR-017)

src/modules/platforms/
├── platform.types.ts              # + PlatformRepository primitives, + PlatformRuntime reset/devBroadcast
├── generic-platform.ts            # + reset(), devBroadcast()
├── platform.registry.ts           # unchanged — no new platform, no new provider shape
└── (scheduler / tokens / definitions) unchanged

src/modules/broadcast/
└── broadcast.service.ts           # send(message, game, platform, recipient?)

src/gamesources/epic/
├── epic.repository.ts             # + 5 primitives, epicPendingCriteria reused
└── (api / mapper / types / index) unchanged

src/gamesources/xbox/
├── xbox.repository.ts             # + 5 primitives, xboxPendingCriteria reused
└── (api / mapper / types / index) unchanged

src/modules/subscription/
└── dto/platform-option.dto.ts     # unchanged — reused by /dev sync for its platform choices

test/
└── command-scope.e2e-spec.ts      # NEW — registration counts against a real Discord-shaped fake
```

**Structure Decision**: single-project layout stays as-is. The change is additive and follows the
existing module boundaries: command scoping belongs to `modules/bot` (it configures the gateway),
the dev commands belong beside the admin commands they shadow, and the lifecycle primitives belong
in the two files that already own them — `platform.types.ts` (the seam) and each platform's
repository (the rules). No new top-level directory, no new module, no new entity.

## Complexity Tracking

> No constitution violations require justification. The Principle II carve-out is already authorised
> by a ratified MAJOR amendment, so it is a prerequisite rather than a deviation, and every
> abstraction added here (one service, two lifecycle methods, five repository primitives) is
> exercised by both platforms — the "Do Not Over-Abstract" bar.
