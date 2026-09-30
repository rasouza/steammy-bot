# Implementation Plan: Easy Add Platform — Generic Platform Lifecycle

**Branch**: `003-easy-add-platform` | **Date**: 2026-09-29 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/003-easy-add-platform/spec.md`

## Summary

Refactor the storefront fetch/sync/announce architecture from per-storefront branches spread
across shared services (`broadcastEpic`/`broadcastXbox` + `cronEpic`/`cronXbox` in
`BroadcastService`, `@Cron` sync methods in `EpicService`/`XboxService`, `if (platform === ...)`
in `AdminCommands`) into **one generic platform lifecycle** driven by a **declarative platform
registry**. Each storefront supplies only three storefront-specific components — API fetch,
mapping, and repository (persistence + eligibility) — composed by Nest factory providers into a
`GenericPlatform` runtime; a single platform-agnostic `PlatformScheduler` iterates the
`PLATFORM_REGISTRY` for both the sync pass and the announcement pass. Alongside the structural
refactor, the known defect is fixed: a game is marked `broadcasted` only **after** Discord
delivery succeeds (per spec FR-009/FR-010, clarification Q1: per-storefront failure isolation),
and a `BROADCAST_ENABLED` flag makes delivery disable-able for safe local development. The
composition root (registration array) and a new integration guide (`docs/` per FR-018) are the
only touch points for adding a future storefront. As the final cutover step, `src/shared/` is
retired: Epic/Xbox DTO types move into `platforms/epic/` and `platforms/xbox/`, `Game` and
`GamePlatform*` move to `platforms/` as the platform-domain vocabulary, dead alias `XboxGame`
is deleted, and the AGENTS/README platform touch-point lists are rewritten (research R11).

## Technical Context

**Language/Version**: TypeScript 6 on Node `>=24.15.0` (`.nvmrc` pins `24.21.0`), native ESM
(`"type": "module"`; relative imports carry explicit `.js`/`/index.js`, `import type` under
`verbatimModuleSyntax`)

**Primary Dependencies**: NestJS 12, Necord + discord.js (bot/commands), `@nestjs/schedule`
(cron), TypeORM 12 + PostgreSQL (storage), zod (`envSchema`, stays `.passthrough()`), axios +
`object-mapper` (platform API fetch/mapping), chalk (log styling), Vitest (tests), type-aware
oxlint + Prettier (lint/format)

**Storage**: PostgreSQL, schema `steammy_bot` hardcoded; **no schema change expected** for this
feature — entities `CatalogEpic`, `CatalogXbox`, `Subscription` already carry every needed
column; migrations only if a surprise change appears (spec FR-017, Constitution III)

**Testing**: Vitest — unit specs colocated `src/**/*.spec.ts` constructed directly
(`new X(...)`, no Nest testing module); e2e `test/**/*.e2e-spec.ts` with a single testing
module, no DB and no Discord token (Constitution V); suites run via `npm test` / `npm run test:e2e`

**Target Platform**: Linux server container (multi-arch Docker image) behind Coolify; local
dev on Windows/macOS/Linux with Node >= 24.15.0

**Project Type**: Discord bot service (long-running scheduled worker + slash commands)

**Performance Goals**: Trivial scale — two storefronts, catalogs in the tens-to-hundreds of
games, hourly schedules; no latency targets. Schedules must stay exactly as today
(`0 * * * *` sync, `10 * * * *` announce) per spec FR-004/A-003.

**Constraints**: Full CI gate is the Definition of Done (6 steps, order fixed: prettier check →
type:check → lint → build → test → test:e2e); `npm run lint` is read-only (no `--fix`); no
platform-identity branching in any shared component (spec FR-005, Constitution I); delivery
before durable state (spec FR-009, Constitution II); `BROADCAST_ENABLED` must default to
**on** so production deploys are not silently muted (see research R4).

**Scale/Scope**: 2 existing storefronts (Epic, Xbox) + the hypothetical Steam integration used
to prove SC-001/SC-006; ~8 new files under `src/modules/platforms/`, 3 shrunk/rewritten files
under `src/modules/broadcast/`, 1 rewritten command class, 1 new docs file, ~5 new spec files;
`src/shared/` deleted (2 files) with ~7 import sites rewritten across `subscription` and
`admin`.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| # | Gate (Constitution) | Status | Evidence in this plan |
|---|---------------------|--------|-----------------------|
| I | Platform Definitions, Not Platform Branches | **PASS** | One `GenericPlatform` lifecycle + declarative `PLATFORM_REGISTRY`; `BroadcastService` loses `Repository<CatalogEpic>`/`Repository<CatalogXbox>`, `broadcastEpic/Xbox`, `cronEpic/Xbox`; `AdminCommands` loses its `if (platform === ...)` branches (in scope per spec A-002); scheduler iterates the registry with zero branching. `docs/plans/easy_add_platform.md` read and followed, including its "Do Not Over-Abstract" §13. |
| II | Delivery Before Durable State | **PASS** | Lifecycle orders `send()` → success → `markBroadcasted()`; failure leaves the game pending for retry (FR-009/FR-010). The known defect at `broadcast.service.ts:65/:103` is removed, not reproduced. |
| III | Migrations, Never synchronize | **PASS** | No schema change expected (spec A-006/FR-017); `synchronize` stays disabled; if a change surprises us it ships as a reviewed migration and both entity registries are checked. Schema literal stays hardcoded. |
| IV | The CI Gate Is the Definition of Done | **PASS** | tasks.md will require all six steps locally, in order, before PR (unit step: `npm run test:cov` per the updated AGENTS.md CI sequence — same suite as `npm test`, plus the informational Codecov upload); lint never run with `--fix`; 0 oxlint errors (22 warnings tolerated). |
| V | Tests Live Where the Include Globs Can Find Them | **PASS** | New specs colocated as `src/**/*.spec.ts` (generic platform, eligibility predicates, retry ordering, embed untouched); e2e only under `test/**/*.e2e-spec.ts`; suites stay disjoint; direct construction — no boot of constructor-injected classes (Vitest emits no `design:paramtypes`, so factory-produced providers are exercised through explicit constructor args). |
| TC | Technical constraints (ESM, envSchema, NODE_ENV, bigint, dotenv, CLI split) | **PASS** | ESM import extensions preserved; `envSchema` stays `.passthrough()` with `BROADCAST_ENABLED` added; `NODE_ENV` default untouched; no touch of `data-source.ts`/`create-schema.ts` (dotenv rule N/A); `Number()` coercion for bigint stays in `game-embed.service.ts`. |

**Gate result: PASS — no violations, Complexity Tracking left empty.**

Re-checked after Phase 1 design: **PASS** — contracts (Phase 1) introduce no platform branching,
no schema change, and no test-glob violations.

## Project Structure

### Documentation (this feature)

```text
specs/003-easy-add-platform/
├── plan.md              # This file (/speckit.plan command output)
├── spec.md              # Input feature specification
├── research.md          # Phase 0 output (/speckit.plan command)
├── data-model.md        # Phase 1 output (/speckit.plan command)
├── quickstart.md        # Phase 1 output (/speckit.plan command)
├── contracts/           # Phase 1 output (/speckit.plan command)
│   └── platform-contracts.md
├── checklists/
│   └── requirements.md  # Spec quality checklist (from /speckit.specify)
└── tasks.md             # Phase 2 output (/speckit.tasks command - NOT created by /speckit.plan)
```

### Source Code (repository root)

```text
src/
├── config/
│   └── env.schema.ts                 # + BROADCAST_ENABLED (default true)
├── shared/                           # DELETE in final cutover step (research R11)
│   ├── constants.ts                  #   → moved to modules/platforms/platform.constants.ts
│   └── types/                        #   → Game to platform.types.ts, Epic/Xbox DTOs to their
│                                     #     platform subfolders, XboxGame (dead alias) deleted
└── modules/
    ├── platforms/
    │   ├── platform.types.ts         # NEW: PlatformApi / PlatformMapper / PlatformRepository / PlatformDefinition / PlatformRuntime + `Game` (moved from shared/types)
    │   ├── platform.constants.ts     # MOVED: GamePlatform / GamePlatformType / GamePlatformName (from shared/constants)
    │   ├── platform.tokens.ts        # NEW: PLATFORM_REGISTRY token
    │   ├── generic-platform.ts       # NEW: the one generic lifecycle
    │   ├── platform.factory.ts       # NEW: createPlatformProvider(definition)
    │   ├── platform.scheduler.ts     # NEW: @Cron sync pass + @Cron announce pass, registry-driven
    │   ├── platform.registry.ts      # NEW: EPIC_PLATFORM / XBOX_PLATFORM definitions + registry provider
    │   ├── platforms.module.ts       # REWIRE: factory providers + registry, exports registry/scheduler
    │   ├── epic/
    │   │   ├── epic.api.ts           # NEW (logic moved from epic.service.ts fetch)
    │   │   ├── epic.mapper.ts        # NEW (MAPPER_SCHEMA + filtering)
    │   │   ├── epic.repository.ts    # NEW (upsert + Epic pending criteria)
    │   │   └── epic.types.ts         # MOVED: EpicApiGame / EpicApiImage / EpicApiPrice / EpicApiPromotionalOffer / FreeGamesPromotionApiResponse / EpicGame
    │   ├── xbox/
    │   │   ├── xbox.api.ts           # NEW (logic moved from xbox.service.ts fetch)
    │   │   ├── xbox.mapper.ts        # NEW (MAPPER_SCHEMA)
    │   │   ├── xbox.repository.ts    # NEW (upsert + Xbox pending criteria)
    │   │   └── xbox.types.ts         # MOVED: XboxApiGame / XboxApiImage / XboxApiPrice / XboxCatalogIdResponse
    │   ├── epic.service.ts           # DELETE (cron removed, fetch/mapping relocated)
    │   └── xbox.service.ts           # DELETE (same)
    ├── broadcast/
    │   ├── broadcast.module.ts       # REWIRE: only Subscription entity; exports BroadcastService
    │   ├── broadcast.service.ts      # SLIM: delivery only — send(message, game, platform) returns outcome; Game/GamePlatformType now `import type` from ../platforms/
    │   ├── game-embed.service.ts     # Game import path only (shared/types → ../platforms/platform.types.ts)
    │   └── game-embed.service.spec.ts # same import path update
    ├── subscription/
    │   ├── subscription.service.ts   # GamePlatformType import path only
    │   ├── subscription.commands.ts  # GamePlatformName import path only
    │   └── dto/platform-option.dto.ts # GamePlatform/GamePlatformType import path only
    └── admin/
        └── admin.commands.ts         # REWRITE: registry lookups, no platform branches; constants import path

docs/
└── platform-integration.md           # NEW: FR-018 integration guide

test/
└── health.e2e-spec.ts                # UNCHANGED

AGENTS.md, README.md                  # UPDATE: platform touch-point lists + retire the
                                      # "shared/constants is a file, not a barrel" hazard note
```

**Structure Decision**: Single NestJS project. Platform integrations stay in the existing
top-level `src/modules/platforms/` module exactly as `docs/plans/easy_add_platform.md`
§"Proposed Directory Structure" requires (no nested `broadcast/platforms/`). The two monolithic
per-storefront services are split into `epic/` and `xbox/` sub-folders of api+mapper+repository;
`broadcast/` shrinks to pure Discord delivery; the registry is the composition root. Module
wiring: `PlatformsModule` imports `BroadcastModule` (factory needs `BroadcastService`);
`AdminModule` imports `PlatformsModule` (registry) and `BroadcastModule` (unchanged) — no cycles.
`src/shared/` is retired as the final cutover step (research R11): every symbol gets a named
owner inside `platforms/`; reverse-direction consumers (`subscription`, `admin`, `broadcast`)
use plain file imports — `broadcast` only ever type-imports, so the one-way `@Module` graph and
runtime ESM initialization order stay untouched.

## Complexity Tracking

No constitution violations to justify — table intentionally empty.
