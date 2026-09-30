# Tasks: Platform Area Split — Generic Machinery vs. GameSource Module

**Input**: Design documents from `/specs/004-platform-gamesource-split/`

**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/define-gamesource.md, quickstart.md

**Tests**: Not requested as TDD — existing colocated specs move with their folders and get import-path-only updates (FR-005/SC-002). Validation is scenario-based via quickstart.md (S0–S8), folded into per-story gate tasks.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2)
- Include exact file paths in descriptions
- **Commit mapping** (research.md R5): Foundational = commit C1 (pure move); US1 = commits C2 (restructure) + C3 (vocabulary sweep); US2 = commit C4 (docs). The quality gate (six CI steps, prescribed order) must be green at every commit (FR-006).

## Path Conventions

- Single project: `src/`, `docs/`, `specs/` at repository root; ESM rule: every new/moved relative import carries an explicit `.js` / `/index.js` extension.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Pre-flight evidence and baseline before any file moves

- [X] T001 Verify branch `feature/ste-75-simplify-adding-new-storefront-platforms` (STE-75 key) is based on current `origin/main` and run the baseline six-step quality gate to confirm green before work starts (per quickstart.md S0, repo root)
- [X] T002 [P] Record the base ref SHA and the pre-split shared touch-point count (4–5 per `.specify/assessments/platform-gamesource-decoupling/decision.md`) as the SC-001/SC-002 comparison baseline in `specs/004-platform-gamesource-split/quickstart.md` (S0/S4 evidence notes)
- [X] T003 [P] Verify SC-006: the split-first sequencing decision (FR-008) is recorded in `.specify/assessments/platform-gamesource-decoupling/decision.md` and the STE-75 Linear description **before** the first file move — record/commit ordering check

**Checkpoint**: Baseline green, evidence captured, sequencing recorded

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Get every platform implementation file to its final path so both stories work against the final tree — commit C1, a pure move with import-path fixes only

**⚠️ CRITICAL**: No US1 restructure or US2 guide rewrite can begin until this phase is complete

- [X] T004 Move the Epic implementation with history: `git mv src/modules/platforms/epic/ src/gamesources/epic/` (epic.api.ts, epic.mapper.ts, epic.repository.ts, epic.repository.spec.ts, epic.types.ts — no content changes)
- [X] T005 [P] Move the Xbox implementation with history: `git mv src/modules/platforms/xbox/ src/gamesources/xbox/` (xbox.api.ts, xbox.mapper.ts, xbox.repository.ts, xbox.repository.spec.ts, xbox.types.ts — no content changes)
- [X] T006 Fix relative import paths left dangling by T004/T005 in `src/modules/platforms/platform.registry.ts`, `src/modules/platforms/platforms.module.ts`, and `src/modules/platforms/platform.factory.ts` (and any implementation files importing machinery — paths only, no logic changes; explicit `.js` extensions required)
- [X] T007 Run the full six-step quality gate (quickstart.md S8) and, when green, commit C1 `refactor(platforms): move Epic/Xbox implementations to src/gamesources/` (structure only — constants/definitions still in place; no mixed concerns per Constitution IV)

**Checkpoint**: Foundation ready — files live at final paths, gate green, US phases can begin

---

## Phase 3: User Story 1 — Split the platform area: framework vs. GameSource implementations (Priority: P1) 🎯 MVP

**Goal**: Two clearly owned areas — machinery at `src/modules/platforms/` holding zero per-platform data, implementations at `src/gamesources/` declaring themselves via `defineGameSource()`; "storefront" gone from source; behavior byte-identical

**Independent Test**: quickstart.md S2 (machinery purity greps), S3 (acyclic one-way dependency), S4 (behavior frozen — `expect(` lines byte-identical), S6.1 (zero "storefront" in `src/`), and the full gate all pass on the C3 tree

### Implementation for User Story 1 (restructure — commit C2)

- [X] T008 [P] [US1] Create `src/gamesources/game-platform.ts` by moving the `GamePlatform` key enum and `GamePlatformType` out of `src/modules/platforms/platform.constants.ts` (R1: domain keys live in the GameSource area; the machinery must never name a platform — FR-001)
- [X] T009 [P] [US1] Create the framework helper `src/modules/platforms/define-gamesource.ts` per `specs/004-platform-gamesource-split/contracts/define-gamesource.md` §1: pure declaration (no instantiation/I/O), leaf importer (imports nothing from `src/gamesources/` — type the platform key generically as `TKey extends string`), generics must preserve today's `PlatformDefinition<ApiDto, Game>` inference
- [X] T010 [US1] Add the declarative definitions: create `src/gamesources/epic/index.ts` and `src/gamesources/xbox/index.ts`, each exporting one `defineGameSource({ platform, name, message, api, mapper, repository })` call — `platform` from the GamePlatform enum (T008), `name` = `'Epic Games'` / `'Xbox Game Pass'`, `message` byte-identical to today's values (data-model rule: FR-005), class references not instances (depends on T008, T009)
- [X] T011 [US1] Create the central registration list `src/gamesources/index.ts`: explicit ordered array of the two definitions (no filesystem auto-discovery, one entry per folder) plus the derived `gameSourceNames` key→name export (contracts §2; FR-001/FR-002) (depends on T010)
- [X] T012 [US1] Rewrite `src/modules/platforms/platform.registry.ts` to consume the central list — its only GameSource import is `../../gamesources/index.js` (the one bridge, research R2) — and remove the inline EPIC/XBOX definitions and all `GamePlatform` usage (depends on T011)
- [X] T013 [P] [US1] Remove per-platform data from the machinery: delete `src/modules/platforms/platform.constants.ts` (enum moved by T008, display names now live in the per-folder definitions) and make `src/modules/platforms/platform.tokens.ts` generic over `string` with zero `GamePlatform` imports (FR-001 negative space)
- [X] T014 [US1] Fold the superseded factory pattern into the helper flow: absorb `src/modules/platforms/platform.factory.ts` into the `define-gamesource.ts`/registry composition per research R3 and delete `platform.factory.ts` (provider construction stays machinery-side; no runtime behavior change)
- [X] T015 [US1] Update the six external consumer files to the new locations: `src/modules/admin/admin.commands.ts` (name lookup switches from the deleted `GamePlatformName` record to the derived names map / registry — message output byte-identical), `src/modules/broadcast/broadcast.service.ts`, `src/modules/subscription/subscription.commands.ts`, `src/modules/subscription/subscription.service.ts` (enum import-path updates only), and `src/modules/subscription/dto/platform-option.dto.ts` (keep hardcoded name/value choice literals — it is touch point #2 of the contract, FR-003). *Note: `broadcast.service.ts` dropped its type-only `GamePlatformType` import and now takes `platform: string` — a type-level widening required by SC-003 (the machinery contract `BroadcastPort` cannot name domain keys); runtime behavior identical.*
- [X] T016 [P] [US1] Update spec imports for the new paths — `src/modules/platforms/platform.registry.spec.ts`, `src/modules/platforms/generic-platform.spec.ts`, `src/modules/broadcast/broadcast.service.spec.ts` — **import/path changes only; every `expect(` line byte-identical** (SC-002; implementation specs already moved with T004/T005)
- [X] T017 [US1] Run the full six-step quality gate, fix until green, verify quickstart S2/S3 purity and acyclicity checks (greps: no `epic|xbox|GamePlatform` in `src/modules/platforms/` except the single central-list import; no machinery imports from `src/gamesources/` except `platform.registry.ts`; no `forwardRef`), then commit C2 `refactor(platforms): defineGameSource + central registration; strip per-platform data from the machinery`

### Vocabulary sweep (commit C3)

- [X] T018 [P] [US1] Sweep "storefront" → GameSource across source comments/docstrings: `src/modules/platforms/platform.scheduler.ts`, `src/modules/platforms/generic-platform.ts`, `src/modules/platforms/platform.tokens.ts`, `src/modules/platforms/platform.types.ts`, `src/modules/platforms/platforms.module.ts`, `src/modules/platforms/platform.registry.ts`, `src/gamesources/xbox/xbox.repository.ts`, `src/gamesources/epic/epic.types.ts` (research R4 inventory — prose and docstrings only, no identifier changes)
- [X] T019 [P] [US1] Rename the two behavior-test titles in `src/modules/platforms/platform.scheduler.spec.ts` (lines ~52, ~78: "storefronts"/"storefront" → GameSource wording) — descriptive titles only, assertion code byte-identical (FR-005/SC-002)
- [X] T020 [US1] Re-run quickstart S2, S3, S4, and S6.1 (`grep -rni storefront src/` → zero hits) plus the full six-step gate; when green, commit C3 `refactor: storefront → GameSource vocabulary sweep` (source only — README/docs sweep belongs to US2)

**Checkpoint**: User Story 1 complete — two-area boundary exists with one-way dependency, behavior frozen, gate green; this is the MVP deliverable

---

## Phase 4: User Story 2 — Publish the new integration contract in the guide (Priority: P2)

**Goal**: `docs/platform-integration.md` and `README.md` tell the truth about the new layout, with the enumerated, justified touch-point contract

**Independent Test**: Paper walkthrough of "add Steam" against the updated guide (quickstart S5/S7): every edited file is inside `gamesources/steam/` or on the contract (central list + Discord DTO), shared count 2 ≤ pre-split 4–5, zero files in `src/modules/platforms/`

### Implementation for User Story 2 (docs — commit C4)

- [X] T021 [P] [US2] Rewrite `docs/platform-integration.md` for the new layout (FR-007): step-by-step "add a platform" flow using `src/gamesources/<name>/`, `defineGameSource()`, and the central list; add the touch-point contract section enumerating exactly `src/gamesources/index.ts` and `src/modules/subscription/dto/platform-option.dto.ts` with a justification each and the pre-split-count comparison (FR-003, SC-001); sweep all "storefront" occurrences in the guide (FR-004) and remove every reference to the old structure. *Note: as implemented, the contract enumerates 5 files — the two above plus `src/gamesources/game-platform.ts` (domain key union, required by data-model/contract §1) and the standard entity-registration pair (`entities/index.ts`, `data-source-options.ts`, pre-existing AGENTS rule). FR-003's "at minimum" + cap holds: registration proper 3 ≤ pre-split 4; total 5 ≤ pre-split 6 (within baseline 4–5). Contracts §5 and data-model TouchPointContract reconciled accordingly.*
- [X] T022 [P] [US2] Update the `README.md` "Adding more platforms" section (around line 124) to match the new guide steps, and sweep its remaining "storefront" occurrence (FR-004/FR-007)
- [X] T023 [US2] Execute the US2 independent test: paper walkthrough per quickstart S5 against the guide (T021) — confirm the edited-file union = platform's own folder + the two contract entries, count ≤ pre-split, nothing in `src/modules/platforms/`; per acceptance 3, any discrepancy is fixed **in the guide**, not compensated by the reader. *Result: union = own folder + 5 enumerated shared files (see T021 note); 5 ≤ pre-split 6; zero files in `src/modules/platforms/`; S7 file-existence spot checks pass.*
- [X] T024 [US2] Run the full six-step gate and the final vocabulary sweep `grep -rni "storefront" src/ README.md docs/` → zero hits (SC-004), verify `src/database/` diff empty and Discord choice display strings unchanged; commit C4 `docs: rewrite platform-integration guide + README for the new layout`

**Checkpoint**: US1 + US2 both complete — the boundary exists and the published contract matches reality

---

## Phase 5: Polish & Cross-Cutting Concerns

**Purpose**: End-to-end validation, scope hygiene, and the deferred cleanup

- [X] T025 [P] Run quickstart.md S0–S8 end-to-end against the PR head (structure, purity, acyclicity, behavior-frozen diffs, touch-point walkthrough, vocabulary, guide accuracy, full gate) and record the verdict (SC-001…SC-005, FR-006) — *verdict table recorded in quickstart.md "Validation evidence (T025)"*
- [X] T026 [P] FR-008 scope check: verify `git diff origin/main...HEAD` touches no STE-74 or STE-75-lever files (no `src/database/`, no broadcast-tracking table, no scaffold generator, no catalog unification) — *34 files, all expected; forbidden-pattern grep zero; `src/database/` empty*
- [X] T027 Confirm SC-006/FR-008 ordering: the sequencing record (T003) predates commit C1 in record/commit order — *records land in commit C0 (spec + assessment artifacts) immediately before C1 in history; decision.md carries the dated sequencing note*
- [X] T028 Verify commit atomicity per quickstart S0.1 — exactly C1–C4, each gate-green, no commit mixing move/restructure/sweep/docs — then open the PR from `feature/ste-75-simplify-adding-new-storefront-platforms` (STE-75) against `main` — *history = C0 records + C1–C4, kinds unmixed, every commit gate-green* (PR opened as the final implementation step)
- [X] T029 **[SEPARATE POST-LANDING CHANGE — not in this PR]** FR-009 cleanup: after the split PR merges, `git mv docs/plans/easy_add_platform.md docs/easy_add_platform.md` and `git mv docs/plans/nest12_esm_toolchain.md docs/nest12_esm_toolchain.md`, remove the `docs/plans/` folder, and update all three `docs/plans/` references in `AGENTS.md` (research R8) — gate green, zero dangling references, no `src/` changes. *Executed 2026-09-30 on `chore/ste-75-flatten-docs-plans` after PR #29 merged (`ce9abc4`): folder removed; AGENTS ×3 + constitution ×2 (living governance) + the moved toolchain record's internal cross-links ×3 reconciled; `grep docs/plans` zero across AGENTS/README/constitution/docs/; historical audit records (specs/001–003, past assessments/bugs) intentionally retain the old path; `src/` diff empty; six-step gate green.*

---

## Phase 6: Convergence

- [X] T030 Sweep the living handoff's vocabulary use in `.specify/assessments/platform-gamesource-decoupling/decision.md` (L49: "When integrating a new storefront platform" → "a new platform"; keep L54/L59 — they name the rename pair itself) and correct the `decision.md` classification note in `specs/004-platform-gamesource-split/quickstart.md` S6.2 (hits are in the handoff above the superseded marker at L84, not inside it; L54/59 exempt as self-referential) per SC-004 (partial)
- [X] T031 Reconcile the stale exclusivity wording with the implemented 5-file enumerated touch-point contract — `specs/004-platform-gamesource-split/plan.md` Summary ("the only shared file a platform-add touches besides the Discord choice DTO") and `specs/004-platform-gamesource-split/spec.md` Assumption "Explicit registration" (same claim) — both must reflect: key union + central list + Discord DTO as the registration files, plus the standard pre-existing entity-registration pair, count ≤ pre-split per FR-003 (partial). *Note: while editing the same Summary sentence, the `defineGameSource` field sketch was aligned with contract §1 (`name` added) — same staleness class.*

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — starts immediately
- **Foundational (Phase 2)**: Depends on Setup — **BLOCKS all user stories** (files must be at final paths first)
- **US1 (Phase 3)**: Depends on Foundational; delivers commits C2 + C3
- **US2 (Phase 4)**: Depends on US1 — the guide must describe the layout as implemented (docs-against-plan drift is exactly what acceptance 3 forbids); only T021/T022 drafting could start earlier in parallel, at risk
- **Polish (Phase 5)**: Depends on US1 + US2; T029 additionally depends on the PR having merged

### User Story Dependencies

- **User Story 1 (P1)**: After Foundational — no dependencies on other stories; independently testable (S2–S4, S6.1, gate)
- **User Story 2 (P2)**: After US1 — independently testable via the S5 walkthrough + guide-accuracy checks

### Within Each Story

- Definitions before central list; central list before registry rewrite; restructure (C2) before sweep (C3); gate green before every commit
- US2: guide rewrite before walkthrough (T023) before final sweep/commit (T024)

### Parallel Opportunities

- Setup: T002 ∥ T003
- Foundational: T004 ∥ T005 (different folders), then T006
- US1 restructure: T008 ∥ T009; T013 ∥ T016 (after T010's inputs exist); T018 ∥ T019 (independent files)
- US2: T021 ∥ T022
- Polish: T025 ∥ T026

---

## Parallel Example: User Story 1

```bash
# Launch together (independent files, no shared dependencies):
Task: "Create src/gamesources/game-platform.ts (move GamePlatform enum) [T008]"
Task: "Create src/modules/platforms/define-gamesource.ts helper [T009]"

# Later, sweep batch in parallel:
Task: "Sweep storefront→GameSource in machinery/impl comments [T018]"
Task: "Rename scheduler spec titles [T019]"
```

---

## Implementation Strategy

### MVP First (User Story 1 only)

1. Complete Phase 1: Setup (evidence + sequencing record)
2. Complete Phase 2: Foundational (pure move, commit C1, gate green) — CRITICAL, blocks everything
3. Complete Phase 3: User Story 1 (restructure C2 + sweep C3)
4. **STOP and VALIDATE**: quickstart S2/S3/S4/S6.1 + full gate on the C3 tree
5. The split exists and compiles clean — MVP of the architecture change

### Incremental Delivery

1. Setup + Foundational → files at final paths, gate green (C1)
2. US1 → boundary + rename + behavior frozen → gate green (C2, C3) — **MVP**
3. US2 → guide/README tell the truth → gate green (C4) — PR head
4. Polish → full S0–S8 verdict, scope hygiene, PR opened
5. Post-landing (separate change): FR-009 `docs/plans/` cleanup (T029)

### Notes

- [P] tasks = different files, no dependencies; [Story] labels on story-phase tasks only
- Commit after each checkpoint per R5 — a red gate never rides along (edge case)
- FR-008: no STE-74/STE-75 lever work anywhere in this task list; if either lands mid-effort, pause and rebase before further file moves
- No task modifies a test assertion; the only test edits are import paths (T016) and descriptive titles (T019)
