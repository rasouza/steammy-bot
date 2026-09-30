# Feature Specification: Platform Area Split — Generic Machinery vs. GameSource Module

**Feature Branch**: `feature/ste-75-simplify-adding-new-storefront-platforms` (Linear **STE-75**; branch already exists)

**Created**: 2026-09-30

**Status**: Draft

**Input**: User description: "I want to have the architecture change — the friction is already validated. Restructure the platform area so the generic platform machinery lives in one module and the per-platform implementations in a separate GameSource module, including the storefront → GameSource rename." Source of record: assessment decision handoff, `.specify/assessments/platform-gamesource-decoupling/decision.md` (revised 2026-09-30 — Option B, measurement gate lifted by maintainer).

## Clarifications

### Session 2026-09-30

- Q: How strict must the "adding a platform" boundary be — may shared registration points
  still exist outside the platform's own module, or must a platform-add touch nothing
  outside it at all? → A: Enumerated contract — shared registration may remain outside
  the module, but every point must be listed and justified in the guide, and the total
  must not exceed the pre-split count (FR-003 stands as written; registration is not
  redesigned out of existence).
- Q: Should the split land while STE-74 and the STE-75 levers (generator, catalog
  unification) stay untouched, or must one of those land first? → A: Split first —
  STE-74 and the STE-75 levers stay untouched throughout this effort and are explicitly
  sequenced after the split (recorded decision, satisfies FR-008).
- Q: What exactly must the storefront → GameSource rename cover — which of these must end
  up with zero "storefront" occurrences? → A: Source + living docs — source identifiers,
  README, `docs/`, and living records (this spec, the assessment's decision record);
  excludes database schema, user-visible Discord strings, and historical spec/assessment
  records.
- Q: Where should the generic platform machinery and the per-platform implementations
  live once the split is done? → A: Implementations move only — machinery stays in
  `src/modules/platforms/` (generic files in place); Epic and Xbox move to a new
  `src/modules/gamesources/{epic,xbox}/` module. No second pure-move diff for the
  machinery; a machinery-folder rename may still happen later as a cosmetic follow-up.
- Q: Where should the per-platform registration data — the Epic/Xbox definitions,
  platform keys, and display names currently mixed into `platform.registry.ts` and
  `platform.constants.ts` — live after the split? → A: Inside each platform's folder —
  every `gamesources/<name>/` folder owns its definition entry, constants slice, and
  display name; the GameSource area exposes one aggregated/central list the machinery
  consumes. The machinery never names a platform.
- Q: Which module acts as the composition root that wires definitions into the registry
  and scheduler, and which direction do imports flow? → A: Reference architecture adopted
  (maintainer-supplied, Storefront→GameSource applied): `platforms/` stays the only Nest
  module and the composition root — it consumes a central, explicitly registered list of
  GameSource definitions (no filesystem auto-discovery). The GameSource area is **not** a
  Nest module: plain implementation folders whose only framework API is a declarative
  `defineGameSource()` helper owned by the machinery. Implementations depend only on
  public contracts (types + helper); runtime internals never import platform folders
  except through the central registration list.
- Q: Should the GameSource implementations live at `src/gamesources/` as the reference
  shows, or at `src/modules/gamesources/` as chosen earlier? → A: `src/gamesources/`
  (sibling of `modules/`; supersedes the earlier answer) — `modules/` holds Nest runtime
  wiring only; GameSource folders are application implementations, consistent with
  `src/config/` and `src/database/` living outside `modules/`.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Split the platform area: framework vs. GameSource implementations (Priority: P1)

A developer opens the repository and sees two clearly owned areas: the **platform machinery** — the lifecycle, registry, scheduler, and shared contracts every platform shares — as the one Nest module providing runtime infrastructure ("don't touch this when adding a platform"), and a **GameSource area** at `src/gamesources/` (plain folders, explicitly not a Nest module) holding the per-platform implementations (Epic, Xbox, future platforms), each declaring itself with a single `defineGameSource()` definition. The word "storefront" is gone from code and documentation; the boundary has a name: GameSource. Nothing the bot does changes: same broadcasts, same schedules, same Discord delivery, same migration behavior; the full quality gate passes.

**Why this priority**: This *is* the feature — the revised assessment decision chose the structural split directly; without it there is no boundary to show, document, or validate.

**Independent Test**: Can be fully tested alone: verify the two-module boundary exists with a one-way dependency, the vocabulary rename is complete, every existing behavior test passes unmodified (import/path updates aside), and the full quality gate is green on the final tree.

**Acceptance Scenarios**:

1. **Given** the current single-module platform layout, **When** the split is performed, **Then** each platform's implementation artifacts (including its declarative definition) live only in its own subfolder under `src/gamesources/`, the GameSource area is not a Nest module, and the machinery module contains no platform-specific implementation or data.
2. **Given** the split, **When** the import graph is inspected, **Then** implementation folders depend only on the machinery's public contracts (types + the `defineGameSource` helper), runtime-internal files import platform folders only through the central registration list, and no import cycle exists.
3. **Given** the restructured tree, **When** the full quality gate runs, **Then** every step passes and no test asserting behavior was modified — only the import/path updates required by the move.
4. **Given** the restructure, **When** broadcast, sync, schedule, and Discord delivery paths execute (directly or through their tests), **Then** behavior — including the delivery-before-durable-state ordering — is unchanged.
5. **Given** the rename, **When** source identifiers, the README, `docs/`, and living records are searched for "storefront", **Then** no occurrences remain — while historical records, database schema, and user-visible Discord strings are untouched.

---

### User Story 2 — Publish the new integration contract in the guide (Priority: P2)

The integration guide and README describe the new layout, and every file a platform-add must edit outside its own module is enumerated with a justification — the **touch-point contract**. A walkthrough against the updated guide confirms the list matches reality.

**Why this priority**: The split's value is legible only if the published guide tells the truth about where a new platform goes; without it the boundary exists but contributors cannot rely on it.

**Independent Test**: Walk the updated guide for a hypothetical platform (a paper walkthrough is acceptable) and check that every file it says to edit is either inside the platform's own area or on the enumerated touch-point contract — and that the walk produces no files outside that union.

**Acceptance Scenarios**:

1. **Given** the updated guide, **When** a platform-add is walked, **Then** every edited file is either inside the platform's own area or on the enumerated touch-point contract.
2. **Given** the pre-split count of shared touch points, **When** counted after the split, **Then** it has not increased, and every remaining point is justified in the guide.
3. **Given** a discrepancy between the guide and reality, **When** it is found, **Then** the guide is fixed rather than the reader compensating from memory.

---

### Edge Cases

- The machinery and the GameSource implementations need each other (the runtime hands off delivery, implementations call back) — the design must break the cycle without changing behavior; if no acyclic design exists without a behavior change, the split halts and the assessment record is updated instead of shipping a cycle.
- STE-74 (broadcast-tracking table) or the STE-75 levers (scaffold generator, catalog-table unification) land mid-effort — work pauses and rebases before further file moves so no file moves twice.
- A shared registration point (such as the Discord command-choice list) has no natural home inside the platform's area — it stays on the enumerated touch-point contract rather than being forced into an unnatural location; the contract, not elimination, is the promise.
- A behavior discrepancy surfaces during the move (a test reveals different ordering than assumed) — it is a defect of the move, not a behavior change to adopt; the gate staying green per commit is the tripwire.
- The scaffold generator (STE-75 backlog, not yet built) will later write files — its targets change with the layout, so the sequencing decision is recorded before file moves (FR-008); building the generator itself is out of scope.
- A rename candidate collides with names outside the agreed scope (database schema, user-visible strings) — the out-of-scope names stay untouched; in code and documentation the new vocabulary wins.
- A commit mid-move fails the quality gate — that commit is fixed or dropped before work continues; a red gate never rides along to the merge.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The generic platform machinery MUST live in its own Nest module — staying at `src/modules/platforms/`, acting as the sole platform-area composition root and runtime (lifecycle, registry, scheduler, DI). The machinery MUST expose the single declarative definition helper (`defineGameSource`) through which platforms declare themselves, MUST consume the central GameSource registration list (explicit registration, no filesystem auto-discovery), and MUST hold no per-platform data or imports (no platform keys, display names, definitions, or component imports remain in it — adding a platform never edits runtime-internal files except by adding an entry to the central list, which lives in the GameSource area).
- **FR-002**: Per-platform implementations MUST live in a separate GameSource area at `src/gamesources/` — plain folders, explicitly **not** a Nest module — each platform in its own subfolder (`epic/`, `xbox/`, future) containing its full artifact set (api, mapper, repository, tests, constants/registration data) plus one declarative definition exported from the subfolder's entry file via `defineGameSource({ ... })`; every implementation artifact a platform owns MUST be created and modified only inside that subfolder.
- **FR-003**: Files edited when adding a platform **outside its own platform subfolder** MUST be enumerated in the integration guide as an explicit touch-point contract, each with a justification — at minimum the central GameSource registration list and the Discord command-choice registration; the post-split count MUST NOT exceed the pre-split count (4–5 recorded by the assessment).
- **FR-004**: The "storefront" vocabulary MUST be renamed to "GameSource" across source identifiers, the README, `docs/`, and living records (this spec and the assessment's decision record); database schema names, user-visible Discord strings, and historical spec/assessment records MUST NOT change.
- **FR-005**: The effort MUST NOT change runtime behavior — broadcast marking, sync, scheduling, migration, and Discord delivery semantics stay identical, and the delivery-before-durable-state ordering MUST be preserved; no test asserting behavior may be modified beyond the import/path updates required by the move.
- **FR-006**: The repository's full quality gate MUST pass on every commit and on the final tree (the six CI steps, in their prescribed order).
- **FR-007**: The integration guide (`docs/platform-integration.md`) and the README MUST be updated to the new layout; no guide step may reference the old structure.
- **FR-008**: The effort MUST NOT perform STE-74 work (broadcast-tracking table) or the STE-75 levers (scaffold generator, catalog-table unification). Sequencing is decided and recorded (Clarifications, 2026-09-30): this split lands first, and those efforts are explicitly sequenced after it; if either lands anyway mid-effort, work pauses and rebases before further file moves.
- **FR-009**: Once this effort's changes have landed, the `docs/plans/` folder MUST be removed as a follow-up cleanup. Because AGENTS.md still references its records (the STE-1 plan record — whose "Do Not Over-Abstract" section remains active governance — and the toolchain migration record), every reference MUST be reconciled before removal: relocate the still-referenced content to its new home or explicitly retire the reference, then update all links. No dangling references may remain. `docs/platform-integration.md` is NOT affected and stays.

### Key Entities *(structural, no data model)*

- **Generic Platform Machinery** (`src/modules/platforms/`, the only Nest module of the platform area): framework/runtime code — lifecycle (`generic-platform`), registry, scheduler, factory/DI tokens, shared contracts (`platform.types`), and the `defineGameSource` helper. It is the composition root: it consumes the central registration list and exports `PLATFORM_REGISTRY`/scheduler to existing consumers (which do not change). By FR-001 it holds no per-platform data and never names a platform except through entries in the central list.
- **GameSource area** (`src/gamesources/`, not a Nest module): the home of all per-platform implementations (`epic/`, `xbox/`, future), each subfolder owning its full artifact set **including its registration data** (declarative `defineGameSource` definition, keys, display names), plus the central registration list that the machinery consumes; the only place platform-specific code and data live. Mental model: "this is where I implement a new game source" — `platforms/` is "infrastructure, don't touch when adding a platform."
- **Touch-point contract**: the enumerated, justified list of files outside a platform's subfolder that a platform-add must edit — the boundary promise expressed as something checkable by walkthrough.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A hypothetical platform-add touches zero generic-machinery implementation logic; every file edited outside the platform's own area appears in the touch-point contract, and that list is no longer than the pre-split count.
- **SC-002**: The full quality gate passes on the final tree, with zero behavior-asserting test changes — import/path updates only (verified by diffing test assertions against the pre-split tree).
- **SC-003**: The dependency direction holds as specified — implementation folders depend only on the machinery's public contracts (types + `defineGameSource`), runtime-internal files (registry, scheduler, lifecycle, module) import platform folders only via the central registration list, and the import graph contains no cycle.
- **SC-004**: Zero occurrences of "storefront" remain in source identifiers, the README, `docs/`, and living records (this spec + the assessment decision record), while database schema, user-visible Discord strings, and historical spec/assessment records are unchanged (Discord command options render identically before and after).
- **SC-005**: The updated guide's steps match reality: a walkthrough (paper acceptable) produces exactly the union of the platform's own area and the touch-point contract — no extras, no omissions.
- **SC-006**: The sequencing decision re STE-74/STE-75 is recorded (assessment record or Linear) before the first file move — verifiable by record/commit ordering.

## Assumptions

- **Rename scope** (clarified 2026-09-30): "storefront" → "GameSource" applies to source
  identifiers, README, `docs/`, and living records only; database table/column names,
  user-facing Discord strings, and historical spec/assessment records stay as-is —
  schema renames would collide with the STE-74/STE-75 catalog work, and rewriting
  history would falsify the audit trail.
- **Target structure** (clarified 2026-09-30, reference architecture adopted with
  Storefront→GameSource applied): machinery stays at `src/modules/platforms/` as the
  only Nest module and composition root; implementations live at `src/gamesources/`
  (sibling of `modules/`, not a Nest module) with one subfolder per platform — not a
  module per platform, not filesystem auto-discovery.
- **Explicit registration**: registration proper is three shared files — the domain key
  union in the GameSource area, the central registration list, and the Discord
  command-choice DTO — plus the standard pre-existing entity-registration pair; the
  enumerated, justified contract totals five files, ≤ pre-split (FR-003, published in the
  guide); auto-discovery is explicitly rejected (type-safe, understandable, no runtime
  filesystem machinery in a small app).
- **`defineGameSource` scope**: the helper is the new developer-facing framework API
  (absorbing today's `createPlatformProvider` + definition-entry pattern); its
  implementation lives entirely in the machinery. Machinery file changes are
  responsibility-driven only: per-platform data moves out of `platform.constants.ts`,
  and the factory/definition pattern is superseded by `define-gamesource.ts`; other
  machinery filenames stay as-is (cosmetic renames are out of scope).
- **Vocabulary layering** (from the reference): `GamePlatform` remains the *domain* enum
  (it names the domain concept), "GameSource" is the *integration* term (per FR-004),
  and "platform" in machinery file names means the *runtime*; where the domain key
  type/enum physically lives (derived from definitions vs. a shared domain file) is a
  plan-level decision — the constraint is FR-001 (the machinery never names a platform).
- **Registration stays possible**: shared registration points (e.g., the Discord command-choice list) may remain outside the module as long as they are enumerated and justified (FR-003); eliminating them entirely is not required.
- **STE-74 / STE-75 sequencing**: decided 2026-09-30 (see Clarifications) — this split
  lands first; STE-74 (broadcast-tracking table) and the STE-75 levers (generator,
  catalog unification) remain untouched during the effort and are explicitly sequenced
  after it.
- **Dependency-direction design** (who owns the delivery/broadcast port — concept Option B's known risk) is resolved at plan time without behavior change; the halt condition lives in the edge cases.
- **STE-76** (non-author guide review) stays open and untouched; no independent review gates this feature.
- The feature is tracked on the existing Linear **STE-75** with the existing `STE-75`-keyed branch; no new Linear issue is created.
- **Post-landing cleanup (FR-009)**: the `docs/plans/` removal happens *after* this
  feature's changes have landed — as a separate follow-up change, never inside the split
  PR (the split must stay reviewable on its own; a mixed commit is unreviewable per
  AGENTS.md). The two plan records are not simply deleted: their still-referenced content
  is relocated or the references are retired first.
- No new dependencies or toolchain changes are introduced; the constitution is not amended.
