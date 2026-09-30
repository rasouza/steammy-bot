# Phase 0 Research: Easy Add Platform — Generic Platform Lifecycle

**Branch**: `003-easy-add-platform` | **Date**: 2026-09-29
**Input**: [spec.md](./spec.md), [plan.md](./plan.md), `docs/plans/easy_add_platform.md`, `.specify/memory/constitution.md`

All Technical Context unknowns were resolvable from the repository, the constitution, the
reference plan, or framework documentation — **no NEEDS CLARIFICATION markers remain**.

---

## R1. Composition mechanism for the generic runtime

**Decision**: Nest **factory providers with explicit tokens**. Each `PlatformDefinition`
yields a provider via `createPlatformProvider(definition)` that provides token
`platformToken(definition.type)` (a `Symbol`/string like `'platform:epic'`), constructed by
`useFactory: (api, mapper, repository, broadcast) => new GenericPlatform(...)` with
`inject: [definition.api, definition.mapper, definition.repository, BroadcastService]`.
A `PLATFORM_REGISTRY` provider aggregates the runtime instances into `PlatformRuntime[]`
through one `useFactory` whose `inject` lists the per-platform tokens.

**Rationale**: TypeScript interfaces cannot be runtime DI tokens; the reference plan §4/§5
requires exactly this shape. Verified against current Nest docs (custom providers,
`useFactory` + `inject`) — the pattern is unchanged in Nest 12. Factory construction also
satisfies Constitution V: specs construct `new GenericPlatform(...)` directly with fakes, no
decorator metadata needed.

**Alternatives considered**:
- *Interfaces as tokens* — impossible at runtime (erased); rejected by plan §4.
- *Abstract `EpicPlatform`/`XboxPlatform` base classes* — explicitly forbidden by plan §13 and
  Constitution I.
- *Manual composition inside `PlatformsModule` without a factory* — works, but repeats wiring
  per storefront; rejected because the factory is what makes registration a one-liner (FR-012).

## R2. Scheduler shape: one scheduler, two passes, per-storefront isolation

**Decision**: A single `PlatformScheduler` with exactly two cron methods preserving today's
timings — `@Cron('0 * * * *')` sync pass and `@Cron('10 * * * *')` announce pass — each
iterating `PLATFORM_REGISTRY`. Every storefront's run inside a pass is wrapped in its own
try/catch: log the failure, continue with the remaining storefronts (spec clarification Q1,
FR-004). The scheduler contains no `if (platform === ...)` and no per-storefront knowledge.

**Rationale**: Today each storefront has an isolated cron (`EpicService.syncEpic`,
`XboxService.syncXbox`, `BroadcastService.cronEpic/cronXbox`), so one failure cannot block
another; a naive shared loop would regress that. Plan §6 requires the scheduler to stay
platform-agnostic and preserve existing schedules; plan §11 forbids a per-storefront cron for
new platforms.

**Alternatives considered**:
- *Abort pass on first failure* — rejected (answer to clarification Q1).
- *Keep sync crons inside per-storefront services* — rejected: a new platform would need its
  own cron (plan §11 forbidden list).
- *Per-storefront retry inside the same pass* — rejected (clarification Q1 option C): adds
  complexity; next hourly run is a sufficient retry horizon.

## R3. Delivery outcome contract (what "success" means to the lifecycle)

**Decision**: `BroadcastService.send(message, game, platform)` returns
`SendOutcome = { delivered: number; subscribers: number }` instead of `void` (type defined in
`platform.types.ts`). The lifecycle marks the game announced iff `delivered > 0 ||
subscribers === 0`; a thrown error from `send` itself (e.g. embed building) is caught by the
lifecycle and leaves the game pending. Per-channel failures are caught and logged **inside**
`send` (preserving today's semantics), but successes are now counted rather than swallowed
silently.

**Rationale**: Spec FR-010 fixes the decision table: ≥1 channel received ⇒ announced; all
attempted deliveries failed ⇒ pending for retry; zero subscribers ⇒ announced (A-005). Today
`send()` swallows every channel error and returns `void`, so the caller cannot distinguish
total failure — and a bare count would still conflate "0 subscribers" (mark) with "N failed
sends" (leave pending), so both numbers travel together in one return value.

**Alternatives considered**:
- *`send` throws when all channels fail* — rejected: conflates "no subscribers" with failure
  and forces exception-driven control flow for an expected case.
- *Bare delivered count* — rejected: cannot distinguish zero-subscriber success from total
  failure without a second query whose timing could drift from the sends.
- *Return a richer enum* — over-abstraction for two branches (plan §13).

## R4. `BROADCAST_ENABLED` flag: name, shape, and default

**Decision**: Add `BROADCAST_ENABLED` to `envSchema` using the existing `booleanish` helper
(`'true'|'false'`, anything else ⇒ false) but with **default `'true'`**, and document
`BROADCAST_ENABLED=false` for local development in `.env.example`. When disabled, the announce
pass skips `send` entirely and marks nothing (spec A-007); the sync pass still runs. The flag
is **not** added to `docker-compose.yml`'s environment list.

**Rationale**: Spec FR-013 requires disable-ability; A-007 defines semantics. Default `true`
is required because production behavior must be preserved with no deploy-time env change —
`docker-compose.yml` injects only explicitly listed variables, and an unset list entry would
deliver an empty string that the enum rejects (boot failure) or, with a `false` default, would
**silently mute all announcements on the next production deploy** — a direct SC-002/Story 3
regression. Dev safety comes from the dev setting it false explicitly, which matches the
reference plan §16 ("Prefer an explicit configuration flag such as
`BROADCAST_ENABLED=false` during initial development").

**Alternatives considered**:
- *Default `false`* — safe-for-dev but dangerous-for-prod; rejected (silent production outage).
- *Add to compose env list* — an unset host `.env` yields `''`, which `booleanish` rejects and
  blocks boot; rejected. Prod override remains possible via Coolify env if ever needed.
- *Reuse `NODE_ENV !== 'production'`* — rejected: spec wants an explicit deliberate switch
  (Story 4 scenario 3), and `NODE_ENV` deliberately has no default (constitution).

## R5. Making eligibility rules unit-testable without a database

**Decision**: Each storefront repository exposes its pending-selection criteria as a **pure
function** used by `findPending()` — e.g. `epicPendingCriteria(now: Date)` returning the
`where` object (`broadcasted: false`, `offer_start_at ≤ now`, `offer_end_at ≥ now`) and
`xboxPendingCriteria(now)` (`broadcasted: false`). The repository's `findPending()` passes
these to `repository.find({ where })`. Unit specs test the pure functions directly with
constructed dates — `new EpicRepository(fakeDbRepo)` style construction where the injected
TypeORM repository is a hand-rolled object literal.

**Rationale**: Constitution V forbids DB-backed unit tests (specs construct services directly;
e2e needs no DB) and plan §15 demands per-storefront eligibility tests (started/not-started/
expired/announced combinations). A pure criteria function is the smallest seam that makes
those tests possible without inventing a generic repository abstraction (plan §13).

**Alternatives considered**:
- *Full in-memory TypeORM fake* — heavy and brittle; rejected (over-abstraction).
- *Move eligibility tests to e2e with a real database* — forbidden: e2e must need neither DB
  nor Discord token (Constitution V).
- *Predicate over already-loaded rows* — changes the query semantics (loads everything);
  rejected: current behavior is a filtered query.

## R6. Sync persistence semantics on re-fetch

**Decision**: Preserve today's upsert: `repository.upsert(mappedGames, ['id'])` per storefront
(`epic.service.ts:106`, `xbox.service.ts:60` today), keyed by the storefront's game id, with
the mapped payload not carrying `broadcasted` so the column is never written by sync.
Wrapped as `PlatformRepository.saveAll(games)` in the contract.

**Rationale**: Clarification Q2 fixed this at spec level (FR-001: update in place, never
duplicate, never reset announced state). The existing code already behaves this way, so the
refactor moves the call, not the semantics — SC-002 zero-diff requires exactly that.

**Alternatives considered**: insert-only (duplicates, re-announcements), replace-and-reset
(re-announces old games) — both rejected by spec Q2.

## R7. File and module layout

**Decision**: Follow plan §"Proposed Directory Structure" adapted to this repo: contracts +
runtime + registry + scheduler + factory at `src/modules/platforms/` root; `epic/` and `xbox/`
sub-folders each with `*.api.ts`, `*.mapper.ts`, `*.repository.ts`; delete `epic.service.ts` /
`xbox.service.ts` after their contents are relocated. `BroadcastModule` stops importing
`CatalogEpic`/`CatalogXbox`; `PlatformsModule` imports `BroadcastModule`.

**Rationale**: The reference plan explicitly says to keep platform integrations in the existing
top-level `platforms` module and **not** create `broadcast/platforms/`. Splitting by concern
(api/mapper/repository) is the developer experience the spec's Story 1 measures.

**Alternatives considered**: keeping `EpicService` as a thin wrapper over the three components
— rejected: a service that only delegates one method is on plan §13's forbidden list.

## R8. Admin command behavior after de-branching

**Decision**: `/sync` and `/broadcast` resolve the runtime from `PLATFORM_REGISTRY` by the
`platform` option value and call `sync()` / `broadcastPending()`; replies keep their exact
wording (`GamePlatformName`, `Broadcasted ${count} games...`, error replies). `count` becomes
the number of games **successfully announced** (the lifecycle's return value) rather than
"pending found"; failure replies and ephemeral flags are untouched.

**Rationale**: Spec A-002 puts admin commands in scope; FR-011 requires registry-driven,
branch-free commands; FR-015 requires response wording unchanged. Returning the announced
count is the honest reading of "Broadcasted N games" now that a game can fail — today's
`games.length` would claim games were broadcast when delivery failed (masked by the old
mark-before-send defect).

**Alternatives considered**: returning pending-found count to be byte-identical — rejected:
byte-identical only matters when every delivery succeeds, and the old value was misleading by
construction; the reply *format* stays identical either way.

## R9. Migration / cutover sequence (plan §17, incremental)

**Decision**: Nine-step sequence, each step keeping the gate green: (1) contracts
(`platform.types.ts`, `platform.tokens.ts`) — no behavior change; (2) `GenericPlatform` +
unit tests with fakes; (3) Epic components + registry entry + factory provider, switch admin
`/sync`+`/broadcast` Epic path to registry, delete nothing yet; (4) same for Xbox; (5)
`PlatformScheduler` with two passes, remove four old crons; (6) slim `BroadcastService`
(delivery only, outcome return, ordering fix) + retry tests; (7) remove obsolete code
(`epic.service.ts`, `xbox.service.ts`, catalog injections, old broadcast methods); (8)
`BROADCAST_ENABLED`, `.env.example`, `docs/platform-integration.md`; (9) retire
`src/shared/` (R11 below).

**Rationale**: Plan §17 mandates incremental migration with no long-lived parallel
architecture; spec A-008 forbids old+new paths running in parallel at the end. Each step is an
atomic commit (AGENTS.md) and keeps the six-step CI gate passable.

**Alternatives considered**: big-bang rewrite — rejected by plan §17/§19 ("Prefer small,
incremental changes").

## R10. Where the FR-018 integration guide lives

**Decision**: `docs/platform-integration.md` — steps: create `platforms/<name>/` components,
add the definition to `platform.registry.ts`, verify with the named test commands. Linked from
the README only if a docs section already exists (it does not — README untouched).

**Rationale**: FR-018 requires a committed guide sufficient for a non-author to perform the
Story 1 independent test. `docs/` already holds `plans/`, so it is the established home.

**Alternatives considered**: README section — rejected: README is contributor-setup oriented
and this is a multi-step procedure; a dedicated file keeps the README stable.

## R11. Retiring `src/shared/` — every symbol gets a named owner

**Decision**: As cutover step 9, delete `src/shared/` entirely (2 files, 114 lines) by moving:
(a) Epic-only types (`EpicGame`, `EpicApiGame`, `EpicApiImage`, `EpicApiPrice`,
`EpicApiPromotionalOffer`, `FreeGamesPromotionApiResponse`) →
`src/modules/platforms/epic/epic.types.ts`; (b) Xbox-only types (`XboxApiGame`,
`XboxApiImage`, `XboxApiPrice`, `XboxCatalogIdResponse`) →
`src/modules/platforms/xbox/xbox.types.ts`; (c) `Game` →
`src/modules/platforms/platform.types.ts` (it is the `TGame` of the contracts — the producer
side owns the model); (d) `GamePlatform`, `GamePlatformType`, `GamePlatformName` →
`src/modules/platforms/platform.constants.ts`, sitting next to the registry; (e) `XboxGame`
deleted (dead alias, zero references). ~7 import statements in `subscription` (3 files),
`admin`, and `broadcast` (2 files, both **type-only** after `broadcastEpic/Xbox` die) are
rewritten. AGENTS.md's "Adding a platform" touch-point list and its
"`shared/constants` is a file, not a barrel" hazard note, plus the README's matching step 5,
are updated in the same change.

**Rationale**: Today `src/shared/` is an ownerless grab-bag; the restructure creates natural
owners (epic/, xbox/, and `platforms/` for the platform-domain vocabulary) and this decision
makes the retirement complete rather than leaving a two-file zombie folder. Dependency
direction stays sound: consumers import *platform-owned* files — `subscription`/`admin` as
plain value/type imports (no `@Module` edge), `broadcast` type-only (erased at runtime), so
the one-way `PlatformsModule → BroadcastModule` module graph and ESM initialization order are
unaffected. It also consolidates the platform touch points: registration-layer edits
(constants + DTO choices + registry) all live under `modules/platforms/` and the subscription
DTO.

**Alternatives considered**:
- *Leave `Game`/`GamePlatform*` in `shared/`, move only Epic/Xbox DTOs* — rejected: folder
  survives with exactly the two ownerless symbols the question targets.
- *Move `Game` into `broadcast/` (consumer side)* — rejected: mappers and repositories
  produce/consume it first; delivery would become a dependency of the platform layer.
- *Fold `GamePlatformName` into `PlatformDefinition.displayName` and derive it from the
  registry* — deferred: the DTO `choices` array is evaluated at class-decoration time, so
  deriving it would pull the whole registry (api/mapper modules) into the subscription import
  graph for zero user-visible gain; keeps today's touch-point count (research scope guard,
  plan §13).
- *Separate follow-up feature* — rejected (chosen scope): two import sweeps and two PRs for
  one mechanical change; the Epic/Xbox moves are inherent to this restructure anyway.

**Doc-ripple note**: `docs/plans/nest12_esm_toolchain.md` and `specs/002-*` reference
`src/shared/` but are historical records of merged work — left untouched. Only AGENTS.md,
README.md, and this feature's artifacts are updated.

---

## Environment & toolchain notes (no open questions)

- ESM: every new relative import carries `.js` / `/index.js`. The old `src/shared/constants`
  "file, not a barrel" trap retires with R11; the rule survives at its new home —
  `platform.constants.ts` takes a plain `.js`, and the `*.types.ts` files are type-only so
  `import type` remains mandatory under `verbatimModuleSyntax`.
- `oxlint --type-aware` runs read-only; `no-unsafe-*` warnings (22 on a clean tree) are
  tolerated — do not "fix" `object-mapper`'s untyped schema.
- Prettier check covers `src/**/*.ts` and `test/**/*.ts`; `.gitattributes` enforces LF.
- `strictNullChecks` + `noImplicitAny` on, `strict: false` overall — contracts must compile
  under that mix.
- Verification: all six CI steps locally, in order, before PR (Constitution IV).
