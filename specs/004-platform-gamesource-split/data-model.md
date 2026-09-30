# Phase 1 Data Model: Platform Area Split — Framework vs. GameSource

- **Feature**: [spec.md](./spec.md) | **Date**: 2026-09-30
- This is a structural refactor: entities are **code structures and contracts**, not
  persisted data. No database entities change (nothing in `src/database/` is touched).
  Validation rules trace to FRs/SCs and are what [quickstart.md](./quickstart.md) checks.

## GameSourceDefinition *(one per platform folder)*

| Field | Shape | Validation rule |
|-------|-------|-----------------|
| `platform` | literal key from the `GamePlatform` enum (`'epic'`, `'xbox'`, …) | Must be a declared enum member (compile-time); key enum lives in `src/gamesources/game-platform.ts` (R1) |
| `name` | display string (`'Epic Games'`, `'Xbox Game Pass'`) | Owned by the platform folder (Clarify Q2); consumed via the names map derived from the central list |
| `message` | announcement template string | Existing behavior data — value must be byte-identical to today's (FR-005) |
| `api` / `mapper` / `repository` | class references | Referenced, never instantiated, by the definition (machinery instantiates via existing factory flow) |
| Types | generics over API-DTO and game types | Must preserve today's `PlatformDefinition<ApiGame, Game>` inference — no type-safety regression (R3) |

**Relationships**: aggregated by the central registration list → consumed by
`platform.registry.ts` → exposed as `PlatformRuntime[]` through `PLATFORM_REGISTRY`.

## GamePlatform *(shared domain keys — `src/gamesources/game-platform.ts`)*

| Field | Shape | Validation rule |
|-------|-------|-----------------|
| `GamePlatform` | `as const` enum-like object of platform keys | **Must not be imported by any machinery file** (FR-001: the machinery never names a platform — tokens become generic over `string`) |
| `GamePlatformType` | union of the keys | Imported by implementation folders and external consumers (subscription, broadcast, admin) by path update only |

## CentralRegistrationList *(`src/gamesources/index.ts`)*

| Field | Shape | Validation rule |
|-------|-------|-----------------|
| definitions | explicit ordered array of `defineGameSource(...)` exports | Exactly one entry per platform folder; **explicit only — no filesystem auto-discovery** (Clarify: rejected alternative) |
| names map | derived export (`key → name`) | Must agree with each definition's `name`; used by `admin.commands` (R6) |

**Relationships**: the single bridge crossing the boundary — imported *only* by the
machinery's registry/composition file (R2). It is touch point #1 of the contract.

## PlatformMachinery *(`src/modules/platforms/` — the only Nest module of the area)*

| Member | Responsibility | Validation rule |
|--------|----------------|-----------------|
| `platform.types.ts` / `platform.tokens.ts` | public contracts + DI tokens | No per-platform imports; `platformToken` generic (no `GamePlatformType` dependency) |
| `generic-platform.ts` / `platform.scheduler.ts` / `platform.factory.ts` flow | runtime lifecycle, scheduling, provider construction | Logic byte-identical (FR-005); factory absorbed by `define-gamesource.ts` (R3) |
| `define-gamesource.ts` | **new** — the framework's declarative definition helper | Imports nothing from `src/gamesources/` (leaf node of the import graph, R2) |
| `platform.registry.ts` | composition: builds providers/registry from the central list | Its *only* GameSource import is `../../gamesources/index.js` |
| `platforms.module.ts` | Nest composition root; exports `PLATFORM_REGISTRY` + `PlatformScheduler` | Export set unchanged → `app.module`/`admin.module` untouched (R6) |
| **Negative space** | — | Zero occurrences of `epic`, `xbox`, `GamePlatform`, `storefront` in this folder (FR-001, FR-004, SC-001/SC-004) |

## TouchPointContract *(published in `docs/platform-integration.md`, FR-003)*

| Entry | Justification | Count rule |
|-------|---------------|------------|
| `src/gamesources/game-platform.ts` (add key to `GamePlatform`) | domain key union the DTO, admin commands, and derived name map type against — the new key stays compile-checked everywhere (data-model rule above) | registration proper = **3** files (pre-split: 4 — constants, registry, module, dto) |
| `src/gamesources/index.ts` (add definition entry) | explicit registration — the one deliberate central edit; touch point #1 (contracts §5) | |
| `src/modules/subscription/dto/platform-option.dto.ts` (Discord choices) | static decorator declarations cannot be derived without magic — enumerated touch point #2 | |
| `src/database/entities/index.ts` (entity export) + `src/database/data-source-options.ts` (entity array) | the standard entity-registration workflow any new catalog table requires (AGENTS.md) — pre-existing, unchanged by this feature | +2 DB files on both sides; post-split total **5** ≤ pre-split 6 (within the recorded baseline 4–5) |

## Delivery lifecycle *(commit sequence — R5, each state gate-green per FR-006)*

```text
base (origin/main, gate green)
  → C1 pure move (epic/xbox → src/gamesources/, import paths fixed, gate green)
  → C2 restructure (defineGameSource, central list, data stripped from machinery,
     consumer updates, gate green)
  → C3 vocabulary sweep (source text only, assertions byte-identical, gate green)
  → C4 docs (guide + README + touch-point contract, gate green)  = PR head
  → [post-landing, separate change] FR-009: docs/plans/ records deleted, AGENTS/constitution links retired
```
