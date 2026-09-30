# Phase 0 Research: Platform Area Split — Framework vs. GameSource

- **Feature**: [spec.md](./spec.md) | **Date**: 2026-09-30 | **Tracker**: Linear STE-75
- No `NEEDS CLARIFICATION` markers existed in Technical Context; unknowns below were
  extracted as research tasks. Consumer inventory verified by grep on `origin/main` state.

## R1. Where do the domain keys and display names live? (FR-001 vs. external consumers)

- **Decision**: The `GamePlatform` key enum + `GamePlatformType` move to **`src/gamesources/game-platform.ts`**
  (a shared domain file at the GameSource area root). Display names move **into each
  platform's `defineGameSource` definition** (`name` field), with a names map derived
  from the central list exported by `src/gamesources/index.ts` for lookup. The old
  `platform.constants.ts` is deleted; `GamePlatformName` as a static record is deleted.
  Consumers switch: `admin.commands` (name lookup → derived map / registry),
  `subscription` + `broadcast` (enum import path only), specs (import path only).
- **Rationale**: FR-001 forbids platform keys/names in the machinery (clarified Q2: the
  machinery "never names a platform"); the reference layers *Domain* (`GamePlatform`)
  separately from *Runtime*; keys must remain static literals for Necord decorator
  choices, so a plain shared file beats type-derivation magic (the reference itself
  prefers explicit over magical). Display names per definition honor Q2 ("each folder
  owns its display name") while the key union is genuinely shared by all folders.
- **Alternatives considered**: deriving keys/names entirely from the central list
  (elegant, but makes decorator-static choices and `GamePlatform.XBOX` fixtures depend
  on inference — too magical for a small app); keeping `platform.constants.ts` in the
  machinery (violates FR-001 verbatim); a new `src/domain/` folder (over-structure for
  one file).

## R2. How does `PlatformsModule` consume the registrations without a cycle?

- **Decision**: **Plain import, not DI.** A single file in the machinery (the rewritten
  `platform.registry.ts`) imports `../../gamesources/index.js` (the central list) and
  builds the providers/registry exactly as today's factory flow does. Import graph:
  `platforms.module → platform.registry → gamesources/index → gamesources/<name>/index →
  define-gamesource` (leaf: types + helper only, no reverse edge into registry/scheduler/
  runtime). GameSource folders are not Nest modules, so there are no Nest module edges to
  cycle — `forwardRef` is never needed. Consumers (`app.module`, `admin.module`,
  `PLATFORM_REGISTRY`/scheduler injectors) are untouched.
- **Rationale**: The reference ("platform module consumes storefronts via a central
  composition file"); simplest possible wiring; acyclic *by construction* (SC-003);
  zero consumer churn.
- **Alternatives considered**: DI token for the definition list (needs a provider of
  that token — but no module exists to provide it without re-introducing the cycle);
  root-level composition (scatters wiring into `app.module`); `forwardRef` (smell, and
  the halt-condition edge case says stop rather than paper over cycles).

## R3. What does `defineGameSource` actually do?

- **Decision**: A function in the machinery that takes a declarative spec
  (`{ platform, name, message, api, mapper, repository }`, generic over the API DTO and
  game types) and returns the **definition object the registry already consumes**
  (`PlatformDefinition`-shaped) — i.e. it *absorbs* `createPlatformProvider`'s
  definition-half plus today's hand-written `EPIC_PLATFORM`/`XBOX_PLATFORM` literals.
  Provider construction stays in the machinery (registry/factory flow). The helper
  validates nothing at runtime (compile-time types only) — no new runtime behavior
  (FR-005).
- **Rationale**: The reference's developer-facing API; today's pattern (definition
  literal + factory call) is already 90% of it, so the helper is a rename+unify, not a
  new abstraction; generics preserve the existing `PlatformDefinition<ApiGame, Game>`
  typing (no type-safety regression).
- **Alternatives considered**: a class/decorator-based definition (heavier, Nest-idiom
  but unnecessary); returning a Nest `Provider` directly from the helper (mixes
  definition data with DI mechanics — registry stays the composition expert).

## R4. What is the exact scope of the "storefront" → "GameSource" sweep? (FR-004)

- **Decision**: Inventory (grep-verified): 12 files — 10 machinery/implementation source
  files (comments/docstrings + 2 test-title strings in `platform.scheduler.spec.ts`),
  `README.md` (L124 prose), and `docs/platform-integration.md` (prose). **Zero identifiers**
  contain "Storefront" today (verified: no capital-S identifier matches). Sweep scope =
  source text (comments, docstrings, test titles) + README + `docs/` + living records
  (this spec's Input quote and historical Clarification bullets are *historical records*
  of what was said — left verbatim; the assessment's `decision.md` already says
  GameSource). Test *assertions* untouched (FR-005) — only descriptive titles change,
  which is non-behavioral.
- **Rationale**: FR-004's "source identifiers" is read as "source code text" because the
  entire in-code inventory *is* comments/titles — reading it as identifiers-only would
  make SC-004 vacuous while leaving the vocabulary debt in place; that reading matches
  the intent recorded in Clarifications (Q3, rename session).
- **Alternatives considered**: literal identifiers-only sweep (vacuous pass, debt kept —
  rejected); rewriting historical spec/Clarification quotes (falsifies the audit trail —
  explicitly excluded by the rename clarification).

## R5. How is the work sequenced so every commit is gate-green? (FR-006, Constitution IV)

- **Decision**: Four atomic commits, each green before the next:
  1. `refactor(platforms): move Epic/Xbox implementations to src/gamesources/` — pure
     move + import-path fixes (registry/module still reference them at new paths;
     constants still in place). Specs move with folders.
  2. `refactor(platforms): defineGameSource + central registration; strip per-platform
     data from the machinery` — new helper, central list, `game-platform.ts`, delete
     `platform.constants.ts`, registry/module rewrite, consumer import updates
     (admin/broadcast/subscription), factory folded away.
  3. `refactor: storefront → GameSource vocabulary sweep` — source comments/titles +
     test titles (assertions byte-identical).
  4. `docs: rewrite platform-integration guide + README for the new layout` — FR-007,
     touch-point contract section (US2).
  The PR is commits 1–4; the FR-009 `docs/plans/` cleanup is explicitly **not** in this
  PR (separate post-landing change, per spec assumption).
- **Rationale**: Constitution requires atomic, reviewable commits and a green gate at
  every commit; move-then-restructure keeps each diff one-kind-of-change.
- **Alternatives considered**: one big-bang commit (unreviewable — AGENTS explicitly
  forbids mixed-commit reviews); restructuring in place before moving (would leave two
  half-locations mid-history).

## R6. What do the external consumers need? (grep-verified inventory)

- **Decision**: Six files outside `platforms/` reference platform symbols:
  `app.module.ts` + `admin.module.ts` (import `PlatformsModule` — **no change**, module
  stays/export set unchanged); `admin.commands.ts` (enum/type/token imports +
  `GamePlatformName` lookups → name lookup switches to the derived map/registry);
  `broadcast.service.ts` + `broadcast.service.spec.ts`, `subscription.{commands,service}.ts`,
  `subscription/dto/platform-option.dto.ts` (enum import path + choice literals — the DTO
  keeps hardcoded name/value pairs as an **enumerated touch point** per FR-003/Clarify Q1).
- **Rationale**: Keeping the module's export contract identical is what makes commit 2
  consumer-safe; the DTO deliberately stays explicit (Necord choices are static
  declarations; deriving them would remove a contract member the spec lists as required).
- **Alternatives considered**: deriving Discord choices from the central list (would
  shrink the touch point below the contract — rejected by FR-003's "at minimum" list);
  moving display names into a record the machinery re-exports (violates FR-001).

## R7. Do tests move cleanly? (SC-002, Constitution V)

- **Decision**: Colocated specs (`epic.repository.spec`, `xbox.repository.spec`) move
  with their folders — still under `src/**` (tsconfig `include: ["src/**/*"]` and Vitest
  globs verified, so both type-check and test discovery cover `src/gamesources/` with no
  config change). Machinery specs stay. Consumer specs (`broadcast.service.spec`) get
  import-path updates only; assertion code byte-identical (verified as a diff rule in
  quickstart S4). Two scheduler test *titles* change in R3's sweep (non-behavioral).
- **Rationale**: Constitution V's globs already reach the new tree; SC-002's
  "import/path updates only" is mechanically checkable via `git diff` on `*.spec.ts`.
- **Alternatives considered**: excluding moved specs (would violate V); renaming spec
  file names (unnecessary churn — prefix convention `epic.*` stays).

## R8. Where do the `docs/plans/` records go when the folder is removed? (FR-009)

- **Decision**: **Retire** — delete both records and the `docs/plans/` folder, and retire
  every living reference instead of repointing it (AGENTS.md ×3, constitution ×2).
  Supersedes the earlier *flatten* decision of the same day: maintainer correction
  2026-09-30 — "I don't want to flatten these 2 docs. I want them gone. They are already
  implemented and their details are present in specs." The STE-1 plan's content persists
  as `specs/003-easy-add-platform`, the toolchain migration's as
  `specs/002-nest12-esm-toolchain`. Executed as a separate change *after* the split PR
  lands (spec assumption; AGENTS' "a commit containing both is unreviewable" rule).
- **Rationale**: Both plans are fully implemented; the living guidance already lives in
  specs, AGENTS, the integration guide, and the actual config files — the records are
  history, not references. The one piece FR-009 called "active governance" (the STE-1
  plan's §13 "Do Not Over-Abstract") was offered three homes (integration guide /
  specs/003 / retire) and the maintainer chose **full retirement**: the constraint
  survives as constitution Principle I's "abstraction MUST stop at what the second
  platform actually needs" plus the AGENTS sentence.
- **Alternatives considered**: flattening into `docs/` (initial decision — rejected by
  the maintainer as keeping dead weight); relocating §13 into
  `docs/platform-integration.md` or `specs/003-easy-add-platform` (FR-009's relocate
  option — offered, declined); moving records into their `specs/00X-*/` directories
  (associative but risks confusion with speckit's generated `plan.md`).

## Open items carried (none blocking)

- None. All Technical Context unknowns resolved; domain-enum location (deferred at
  clarify) is fixed in R1.
