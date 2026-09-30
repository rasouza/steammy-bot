# Contract: `defineGameSource` + the Central Registration List

- **Feature**: [spec.md](./spec.md) | **Parties**: the platform machinery
  (`src/modules/platforms/`, provider) and every GameSource folder
  (`src/gamesources/<name>/`, consumer) | **Date**: 2026-09-30
- This is the one *internal* interface this feature creates: the developer-facing API
  for adding a platform. No external/system interface exists (nothing new leaves the
  process).

## 1. `defineGameSource` (provided by the machinery)

```ts
// src/modules/platforms/define-gamesource.ts  (shape sketch — not final code)
function defineGameSource<ApiDto, Game>(spec: {
  platform: GamePlatformType;        // domain key (from src/gamesources/game-platform.ts)
  name: string;                      // display name, e.g. 'Epic Games'
  message: string;                   // announcement template (byte-preserved)
  api: PlatformApiClass<ApiDto>;     // class reference, not instance
  mapper: PlatformMapperClass<ApiDto, Game>;
  repository: PlatformRepositoryClass<Game>;
}): GameSourceDefinition<ApiDto, Game>;
```

**Invariants**

1. The helper is **pure declaration**: it returns data; it never instantiates,
   registers, or performs I/O. Provider construction remains the machinery's job
   (existing factory/registry flow) — no new runtime behavior (FR-005).
2. It is a **leaf importer**: `define-gamesource.ts` imports nothing from
   `src/gamesources/` — this is what makes the import graph acyclic (SC-003, R2).
3. Generics must preserve today's `PlatformDefinition<ApiDto, Game>` inference — adding
   a platform must not weaken type-safety anywhere (no `any` escape hatches).
4. One `defineGameSource` call per platform folder, exported from that folder's entry
   file (`index.ts`) (FR-002).

## 2. Central registration list (provided by the GameSource area)

```ts
// src/gamesources/index.ts  (shape sketch)
export const gameSources = [EpicGameSource, XboxGameSource] as const;  // explicit
export const gameSourceNames: Record<GamePlatformType, string>;         // derived
```

**Invariants**

1. **Explicit only** — no filesystem scanning, no glob imports, no decorators that
   self-register at import time (decision record: auto-discovery rejected).
2. Exactly one entry per platform folder; adding a platform adds one line here —
   this file is touch point #1 (FR-003).
3. Imported by machinery files **only** through `platform.registry.ts` (composition);
   no other machinery file may reach into `src/gamesources/<name>/` directly (R2).

## 3. Machinery → consumers (unchanged contract)

- `PlatformsModule` keeps exporting `PLATFORM_REGISTRY` and `PlatformScheduler`
  exactly as today — `app.module.ts`, `admin.module.ts`, and all `@Inject(PLATFORM_REGISTRY)`
  sites require **no change** (R6).
- `admin.commands` name lookups switch from the deleted `GamePlatformName` record to
  the derived names map / registry (behavior of messages byte-identical, FR-005).

## 4. Direction of dependence (SC-003)

```text
implementation folders  →  define-gamesource, platform.types, game-platform   (public contracts only)
platform.registry       →  gamesources/index                                  (the one bridge)
everything else in machinery → nothing in src/gamesources/
external consumers      →  platforms.module exports (unchanged) + game-platform (path update)
```

Any import violating §4 is a spec failure (SC-003), not a style issue.

## 5. Touch-point contract (FR-003, published in the guide)

A platform-add edits: **(1)** its own folder, **(2)** `src/gamesources/game-platform.ts`
(add the key — the domain union the DTO and name map type against), **(3)**
`src/gamesources/index.ts` (one central-list entry), **(4)** the Discord choice DTO,
plus the standard entity-registration pair — `src/database/entities/index.ts` and
`src/database/data-source-options.ts` — which any new catalog table requires anyway
(AGENTS.md; pre-existing, unchanged by this feature). Registration proper is therefore
**3** shared files (pre-split: 4 — constants, registry, module, dto); total shared
files **5** ≤ pre-split 6, within the recorded baseline 4–5 (SC-001). Anything else
found during a walkthrough is a guide gap to fix or file (US2 acc. 3), and any
addition beyond this list raises the count and must be justified against the
≤ pre-split cap (SC-001).
