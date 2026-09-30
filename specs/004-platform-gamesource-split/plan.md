# Implementation Plan: Platform Area Split — Framework vs. GameSource

**Branch**: `feature/ste-75-simplify-adding-new-storefront-platforms` (**STE-75**) | **Date**: 2026-09-30 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/004-platform-gamesource-split/spec.md` (clarified 2026-09-30, incl. adopted reference architecture)

## Summary

Split the platform area into a **framework** and an **extension point**. The generic
machinery stays at `src/modules/platforms/` as the only Nest module and composition
root (lifecycle, registry, scheduler, DI, plus a new `defineGameSource` helper),
holding zero per-platform data. The platform implementations (Epic, Xbox) move to
`src/gamesources/<name>/` — plain folders, explicitly not a Nest module — each owning
its full artifact set plus one declarative `defineGameSource({ platform, name, message, api,
mapper, repository })` definition. Registration proper is three shared files — the domain
key union (`game-platform.ts`), the central registration list (explicit, no
auto-discovery), and the Discord choice DTO — plus the standard pre-existing
entity-registration pair; the enumerated, justified contract totals five files, ≤
pre-split (FR-003, published in the guide). The "storefront" vocabulary becomes
"GameSource" across source text, README,
`docs/`, and living records. Zero runtime behavior change; the six-step gate stays green
on every commit.

## Technical Context

**Language/Version**: TypeScript on Node 24.21.0 (`.nvmrc`; `engines >=24.15.0`); native
ESM — every new/moved relative import carries an explicit `.js` / `/index.js` extension.

**Primary Dependencies**: None added or removed. Existing stack (NestJS 12, Necord,
TypeORM, Vitest, oxlint, Prettier) unchanged; `defineGameSource` is first-party code
absorbing today's `createPlatformProvider` pattern.

**Storage**: None touched — no entities, no migrations, `src/database/` untouched
(Constitution III trivially satisfied).

**Testing**: Existing colocated suites move with their folders (`src/**/*.spec.ts` glob
covers `src/gamesources/`); assertions unchanged (import-path + test-title updates only
— SC-002). Validation is scenario-based: [quickstart.md](./quickstart.md) S0–S9.

**Target Platform**: Developer workstation + GitHub Actions CI; production untouched.

**Project Type**: Internal structural refactor (no external interface; one internal
framework API — [contracts/define-gamesource.md](./contracts/define-gamesource.md)).

**Performance Goals**: N/A (no runtime paths change).

**Constraints**: No runtime behavior change (FR-005); gate green per commit (FR-006);
no STE-74/STE-75 interleave (FR-008, decided: split first); rename scope fixed by
clarification (FR-004); touch-point contract ≤ pre-split count (FR-003); STE-75 branch
and Linear tracker per constitution.

**Scale/Scope**: ~12 machinery/consumer source files edited, 2 platform folders moved
(10 files), 1 new folder tree (`src/gamesources/`), 1 new helper file
(`define-gamesource.ts`), 1 central list file, docs (`docs/platform-integration.md`,
`README.md`), post-landing cleanup of `docs/plans/` (FR-009, separate change).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| # | Principle / Rule | Status | Evidence |
|---|------------------|--------|----------|
| I | Platform Definitions, Not Platform Branches | **PASS** | The feature *is* the boundary work; `defineGameSource` abstracts exactly what the two existing platforms + the expected third need (no speculative generality); no `if (platform === …)` introduced; the reference's explicit-registration choice avoids magic. |
| II | Delivery Before Durable State | **PASS** | `broadcast.service`/`game-embed` receive import-path-only edits; pending → send → mark ordering logic byte-identical; no broadcast control flow touched. |
| III | Migrations, Never Synchronize | **PASS (N/A)** | No entity, migration, or `src/database/` change at all. |
| IV | The CI Gate Is the Definition of Done | **PASS** | R5 commits each gate-green; SC-002/quickstart S7 runs all six steps on the final tree. |
| V | Tests Live Where the Include Globs Can Find Them | **PASS** | All moved specs stay under `src/**` (tsconfig `include` + Vitest globs verified); no new test files outside the globs. |
| Technical constraints (ESM `.js` extensions, `--ignore-scripts`, `eol=lf`, no new toolchain) | **PASS** | Moved code crosses directory depth (`src/gamesources/` ↔ `src/modules/platforms/`) — extensions enumerated in R5; Prettier/type-check cover `src/**` including the new tree; zero dependency changes → no amendment. |
| Workflow & Governance (Linear tracker, STE-x branch, atomic commits, PR review) | **PASS** | STE-75 branch exists and carries the key; commits split per R5 so no commit mixes structural moves with docs; FR-009 cleanup explicitly deferred to a separate post-landing change. |

**Gate result: all PASS — no violations, Complexity Tracking not applicable.**

**Re-check after Phase 1 design (research/contracts/data-model/quickstart): PASS,
unchanged.** The design adds one first-party helper and one folder tree — no new
dependencies, no toolchain change, no migration surface; R5 commits each gate-green;
R7 keeps every spec inside the existing globs; R6/R4 confine edits to import paths and
non-behavioral text (quickstart S4 mechanically diffs `expect(` lines to prove it).
No gate passed pre-research is weakened post-design.

## Project Structure

### Documentation (this feature)

```text
specs/004-platform-gamesource-split/
├── plan.md              # This file (/speckit.plan output)
├── research.md          # Phase 0 output — R1–R8 decisions
├── data-model.md        # Phase 1 output — structural entities + validation rules
├── contracts/
│   └── define-gamesource.md   # Internal API contract (machinery ⇄ GameSource)
├── quickstart.md        # Phase 1 output — S0–S9 validation scenarios
├── spec.md              # Feature specification (clarified 2026-09-30)
├── checklists/
│   └── requirements.md  # Spec quality checklist (16/16)
└── tasks.md             # Phase 2 output (/speckit.tasks — NOT created by /speckit.plan)
```

`data-model.md` covers structural entities; `contracts/` exists because this feature
*does* expose an internal interface (`defineGameSource` + central list) — unlike the
previous (rolled-back) docs-only feature.

### Source Code (target tree after the change)

```text
src/
├── modules/
│   ├── platforms/                    # THE framework (only Nest module of the area)
│   │   ├── platform.types.ts         #   public contracts (unchanged content)
│   │   ├── platform.tokens.ts        #   DI tokens (unchanged content)
│   │   ├── generic-platform.ts       #   runtime lifecycle (unchanged content)
│   │   ├── platform.registry.ts      #   consumes central list (no per-platform imports)
│   │   ├── platform.scheduler.ts     #   unchanged logic
│   │   ├── platform.factory.ts       #   superseded → folded into define-gamesource.ts
│   │   ├── define-gamesource.ts      #   NEW: declarative definition helper (framework API)
│   │   ├── platforms.module.ts       #   composition root (wiring only; no per-platform data)
│   │   └── *.spec.ts                 #   colocated machinery specs
│   ├── admin|broadcast|subscription|… # import-path (and admin name-lookup) updates only
│   └── …
├── gamesources/                      # THE extension point (NOT a Nest module)
│   ├── game-platform.ts              #   domain key enum + type (shared, per R1)
│   ├── index.ts                      #   central registration list (explicit)
│   ├── epic/                         #   epic.api/mapper/repository/types (+specs) + definition
│   └── xbox/                         #   xbox.* + definition
└── config|database|…                 # untouched
docs/platform-integration.md          # rewritten for the new layout + touch-point contract (FR-007)
README.md                             # "Adding more platforms" section updated (FR-007)
# post-landing, separate change (FR-009): docs/plans/* records deleted, AGENTS/constitution links retired
```

**Structure Decision**: Machinery stays put (folder-wise) — the diff's movement cost is
paid once, on the implementation side only. GameSource is deliberately *not* a Nest
module (reference architecture): composition stays in `PlatformsModule`, which imports
the central list directly — one plain TS import, acyclic by construction (R2).

## Complexity Tracking

No constitution violations — all gates pass (see Constitution Check); table not applicable.
