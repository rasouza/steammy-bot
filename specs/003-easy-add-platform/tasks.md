---

description: "Task list template for feature implementation"
---

# Tasks: Easy Add Platform — Generic Platform Lifecycle

**Input**: Design documents from `/specs/003-easy-add-platform/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/platform-contracts.md](./contracts/platform-contracts.md), [quickstart.md](./quickstart.md)

**Tests**: INCLUDED — explicitly requested by spec FR-016 ("The system MUST have tests proving
the architecture: generic lifecycle behavior (success, failure-does-not-mark, empty queue),
each storefront's eligibility rules, and delivery failure/retry"). Unit specs are colocated
`src/**/*.spec.ts`, constructed directly — no Nest testing module, no DB, no Discord token
(Constitution V).

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

Single project: `src/`, `test/` at repository root. All relative imports carry explicit ESM
extensions (`.js`; `/index.js` only for barrels — `src/shared/constants` is a file, until
Polish retires it). `import type` for type-only imports under `verbatimModuleSyntax`.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Confirm a green baseline before touching the architecture

- [X] T001 Confirm the working branch and clean tree; rename it to carry the Linear key per AGENTS.md (`git branch -m STE-1-003-easy-add-platform`) so the after_tasks Linear hook and GitHub integration resolve parent issue STE-1 instead of falling back to the project — created fresh as `STE-1-easy-add-platform` (no `003-easy-add-platform` existed to rename; matches the spec's recorded branch name), tree clean off latest main `ffa0648`
- [X] T002 Install dependencies with `npm ci --ignore-scripts` and run the full six-step CI gate as baseline (`npx prettier --check "src/**/*.ts" "test/**/*.ts"` → `npm run type:check` → `npm run lint` → `npm run build` → `npm run test:cov` → `npm run test:e2e`) — confirm green before any refactor — ✅ green at `ffa0648` (9 unit + 1 e2e, 0 lint errors)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The platform contracts and tokens every user story builds on

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [ ] T003 Create the platform contracts in `src/modules/platforms/platform.types.ts`: `PlatformApi<TSource>`, `PlatformMapper<TSource, TGame>`, `PlatformRepository<TGame>` (`saveAll`, `findPending(now)`, `markBroadcasted`), `PlatformDefinition<TSource, TGame>`, `PlatformRuntime` (`type`, `sync()`, `broadcastPending()`), plus `SendOutcome = { delivered: number; subscribers: number }` and the minimal delivery-port `send` signature — exactly as specified in `contracts/platform-contracts.md` §§1–4; type-only imports, ESM `.js` extensions
- [ ] T004 [P] Create the DI tokens in `src/modules/platforms/platform.tokens.ts`: `PLATFORM_REGISTRY` (symbol) and `platformToken(type)` returning the per-definition provider token (e.g. `'platform:epic'`), per `contracts/platform-contracts.md` §3

**Checkpoint**: Foundation ready — user story implementation can now begin

---

## Phase 3: User Story 1 - Add a new storefront with only storefront-specific work (Priority: P1) 🎯 MVP

**Goal**: One generic lifecycle + declarative registry drives sync and announcement for Epic and
Xbox; admin commands and schedules are platform-agnostic; a new storefront needs only its three
components plus one registration entry (spec FR-001…FR-006, FR-011, FR-012, FR-018)

**Independent Test**: Follow `docs/platform-integration.md` for a hypothetical storefront: the
steps touch only new platform files + the registry entry; structural greps show no shared file
edits; `/sync` and `/broadcast` work for both storefronts with unchanged reply wording

### Tests for User Story 1

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation** (FR-016, plan §14–§15)

- [X] T005 [P] [US1] Eligibility spec for Epic in `src/modules/platforms/epic/epic.repository.spec.ts` — four cases verbatim from plan §15: `broadcasted = false` + offer hasn't started → not pending; `broadcasted = false` + offer expired → not pending; `broadcasted = false` + offer active → pending; `broadcasted = true` + offer active → not pending (criteria: `broadcasted = false AND offer_start_at <= now AND offer_end_at >= now`)
- [X] T006 [P] [US1] Eligibility spec for Xbox in `src/modules/platforms/xbox/xbox.repository.spec.ts` — pending iff `broadcasted = false`; no offer-window condition ever applies
- [X] T007 [P] [US1] Generic lifecycle spec in `src/modules/platforms/generic-platform.spec.ts` — sync: API returns sources → mapper called per source → `saveAll` receives mapped games; announce: repository returns pending → `send(definition.message, game, definition.type)` called → `markBroadcasted` called after send → count returned; send throws → `markBroadcasted` NOT called; empty queue → no send, returns 0 (fake api/mapper/repository/broadcast constructed by hand)
- [X] T008 [P] [US1] Scheduler isolation spec in `src/modules/platforms/platform.scheduler.spec.ts` — one registry runtime throws → remaining storefronts still invoked in the same pass; both passes iterate the entire registry (spec clarification Q1 / FR-004)

### Implementation for User Story 1

- [X] T009 [P] [US1] Create `src/modules/platforms/epic/epic.api.ts` — fetch + parse the Epic free-games promotions endpoint, returning `EpicApiGame[]` (logic from `fetchCatalog()` in `src/modules/platforms/epic.service.ts`; native DTOs imported from `src/shared/types/index.ts` until the Polish move)
- [X] T010 [P] [US1] Create `src/modules/platforms/epic/epic.mapper.ts` — move `MAPPER_SCHEMA` and the upcoming/discount filter from `src/modules/platforms/epic.service.ts`; `toGame(source): EpicGame`; no persistence logic
- [X] T011 [US1] Create `src/modules/platforms/epic/epic.repository.ts` — `saveAll` = `upsert(games, ['id'])` with the `broadcasted` column never written (data-model.md persistence rules); `findPending(now)` delegates to a pure exported `epicPendingCriteria(now)` matching T005's four cases; `markBroadcasted(game)` sets the flag and saves (depends: T005)
- [X] T012 [P] [US1] Create `src/modules/platforms/xbox/xbox.api.ts` — id-list fetch + product enrichment from `src/modules/platforms/xbox.service.ts` `fetchAllIds()`/`enrichGameCatalog()`, returning `XboxApiGame[]`
- [X] T013 [P] [US1] Create `src/modules/platforms/xbox/xbox.mapper.ts` — move `MAPPER_SCHEMA` (price string → cents via `Math.round(Number(...) * 100) || null`); `toGame(source): Game`
- [X] T014 [US1] Create `src/modules/platforms/xbox/xbox.repository.ts` — same persistence rules as T011; `xboxPendingCriteria(now)` = `{ broadcasted: false }` only (depends: T006)
- [X] T015 [US1] Create the one generic lifecycle `src/modules/platforms/generic-platform.ts` — `sync()` (fetch → map → saveAll) and `broadcastPending()` (findPending → send → **then** mark, per-game try/catch logging failures and leaving games pending) implementing `PlatformRuntime`; constructor `(definition, api, mapper, repository, broadcast)` directly constructible in specs (depends: T003, T007)
- [X] T016 [P] [US1] Create `src/modules/platforms/platform.factory.ts` — `createPlatformProvider(definition)` as a Nest factory provider (`useFactory` + `inject: [definition.api, definition.mapper, definition.repository, BroadcastService]`) providing `platformToken(definition.type)` (depends: T003, T004)
- [X] T017 [P] [US1] Create `src/modules/platforms/platform.registry.ts` — `EPIC_PLATFORM` and `XBOX_PLATFORM` definitions with the exact current message literals (`'New free game available on **Epic Games**'`, `'New game available on **Xbox Game Pass**'`), plus the `PLATFORM_REGISTRY` factory provider aggregating the per-platform tokens (depends: T016)
- [X] T018 [US1] Create `src/modules/platforms/platform.scheduler.ts` — exactly two crons preserving current timings: `@Cron('0 * * * *')` sync pass, `@Cron('10 * * * *')` announce pass; each iterates `PLATFORM_REGISTRY` inside a per-storefront try/catch (log, continue — Q1); NO platform branching; injects `PLATFORM_REGISTRY` (depends: T016, T017; MUST ship in the same commit as T022 so `cronEpic`/`cronXbox` cannot double-fire alongside it)
- [X] T019 [US1] Rewire `src/modules/platforms/platforms.module.ts` — register the factory providers from both definitions, the registry provider, and `PlatformScheduler`; import `BroadcastModule` (factory needs `BroadcastService`); keep `TypeOrmModule.forFeature([CatalogEpic, CatalogXbox])` for the platform repositories (depends: T016, T017, T018)
- [X] T020 [US1] Rewrite `src/modules/admin/admin.commands.ts` — `/sync` and `/broadcast` resolve the runtime from `PLATFORM_REGISTRY` by the `platform` option; delete `EpicService`/`XboxService`/`broadcastEpic`/`broadcastXbox` usage and both `if (platform === ...)` branches; reply wording, ephemeral flags, and `GamePlatformName` lookups byte-identical; `count` = games successfully announced (research R8) (depends: T017)
- [X] T021 [US1] Delete `src/modules/platforms/epic.service.ts` and `src/modules/platforms/xbox.service.ts` — fetch/mapping relocated to the new components, sync crons relocated to the scheduler, admin no longer imports them (depends: T009–T014, T018, T020)
- [X] T022 [US1] Slim `src/modules/broadcast/broadcast.service.ts` and `src/modules/broadcast/broadcast.module.ts` — remove `cronEpic()`, `cronXbox()`, `broadcastEpic()`, `broadcastXbox()`, `Repository<CatalogEpic>`, `Repository<CatalogXbox>` and the corresponding `TypeOrmModule.forFeature` entries; keep the delivery loop (`send` + per-channel try/catch + embed) with its current signature for now (US2 reworks the return type); NO `broadcasted = true` write before `send` anywhere (Constitution II) (depends: T018, T020; same commit as T018) — ✅ `send` also made public here (contracts §4 port); the merged soft-deleted-guild spec was adapted from `broadcastXbox()` to direct `send()` calls so its coverage survives the method removal
- [X] T023 [P] [US1] Write `docs/platform-integration.md` (FR-018) — step-by-step: create `src/modules/platforms/<name>/{api,mapper,repository}.ts`, add the definition to `src/modules/platforms/platform.registry.ts`, run the verification commands; must not mention editing `generic-platform`, `broadcast.service`, `platform.scheduler`, Epic, or Xbox files (spec SC-006)

**Checkpoint**: At this point, User Story 1 should be fully functional and testable independently — both storefronts sync and announce through the registry, greps for legacy branching/methods are clean

---

## Phase 4: User Story 2 - Never lose an announcement to a failed delivery (Priority: P2)

**Goal**: A game is recorded as announced only when delivery demonstrably succeeded; failures
leave it pending and a later run retries it (spec FR-009, FR-010, A-004, A-005)

**Independent Test**: Force delivery to fail for every subscriber → game stays un-announced;
restore delivery → next run announces it exactly once (quickstart §4b failure drill)

### Tests for User Story 2

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation** (FR-016, plan §12, §14)

- [X] T024 [P] [US2] Failure/retry spec in `src/modules/platforms/generic-platform.spec.ts` — total failure (`delivered = 0`, `subscribers > 0`) → `markBroadcasted` NOT called; same game retried on a later run with `delivered > 0` → marked, announced exactly once; partial success (`delivered > 0`, `subscribers > delivered`) → marked (A-004, channels already served are not re-sent); zero subscribers (`subscribers = 0`) → marked (A-005); assert ordering: `send` resolves before `markBroadcasted` (FR-009)
- [X] T025 [P] [US2] Delivery outcome spec in `src/modules/broadcast/broadcast.service.spec.ts` — `send` returns `SendOutcome`; one channel failing among several → `delivered` counts successes, failure logged, no throw; every channel failing → `{ delivered: 0, subscribers: N }`; no subscriptions → `{ delivered: 0, subscribers: 0 }`; hand-rolled fake client/channel/subscription repo/embed, constructed directly (Constitution V)

### Implementation for User Story 2

- [X] T026 [US2] Rework `send` in `src/modules/broadcast/broadcast.service.ts` to return `Promise<SendOutcome>` — single subscription query inside `send` yields `subscribers`, per-channel loop counts successes into `delivered`, per-channel try/catch preserved (today's semantics), throws only outside the loop (depends: T025; type from T003)
- [X] T027 [US2] Update the marking rule in `src/modules/platforms/generic-platform.ts` — mark iff `delivered > 0 || subscribers === 0`; otherwise log and leave the game pending for the next scheduled pass (depends: T024, T026)

**Checkpoint**: At this point, User Stories 1 AND 2 both work independently — failed deliveries retry, successes mark exactly once

---

## Phase 5: User Story 3 - Existing subscribers see no change (Priority: P3)

**Goal**: Byte-level preservation of announcement text, schedules, eligibility outcomes,
subscription targeting, and all pre-existing tests (spec FR-007, FR-008, FR-015, SC-002)

**Independent Test**: Lock-in specs + structural greps + full pre-existing suite green — zero
behavioral drift from the pre-refactor bot

- [X] T028 [P] [US3] Message-lock spec in `src/modules/platforms/platform.registry.spec.ts` — assert the registry definitions carry the exact literals `'New free game available on **Epic Games**'` and `'New game available on **Xbox Game Pass**'`, and that `GamePlatformName` still maps `epic → 'Epic Games'`, `xbox → 'Xbox Game Pass'`
- [X] T029 [P] [US3] Verify schedule preservation (A-003): confirm `src/modules/platforms/platform.scheduler.ts` carries exactly `@Cron('0 * * * *')` for sync and `@Cron('10 * * * *')` for announce, matching the pre-refactor timings from `epic.service.ts`/`xbox.service.ts`/`broadcast.service.ts` — ✅ exactly two `@Cron` sites remain in `src/`, both in the scheduler; no other cron anywhere
- [X] T030 [P] [US3] Run structural verification (quickstart §2): `grep -rn "if (platform ===" src/` → no matches; `grep -rn "broadcastEpic\|broadcastXbox\|cronEpic\|cronXbox" src/` → no matches; `grep -rln "CatalogEpic\|CatalogXbox" src/modules/broadcast/` → no matches — ✅ all three clean; quickstart's stale `npm test -- criteria` filter corrected to `npm test -- repository` (matches the pinned spec filenames; runs both eligibility suites — 7 tests). The §2 `shared/` grep stays red until the Polish cutover (T042)
- [X] T031 [US3] Review diffs of `src/modules/subscription/*` and `src/modules/broadcast/game-embed.service.ts` — subscription flow, DTO `choices`, and embed building unchanged apart from import-path moves done later in Polish; fix any behavioral drift found — ✅ `git diff ffa0648...HEAD` over both paths is empty; no drift to fix
- [X] T032 [US3] Run `npm test` and `npm run test:e2e` — every pre-existing spec passes unchanged (`src/modules/broadcast/game-embed.service.spec.ts`, `test/health.e2e-spec.ts`) with no tests removed or skipped (FR-016, SC-004)

**Checkpoint**: All user stories' behavior verified — existing subscribers' experience is identical

---

## Phase 6: User Story 4 - Run and verify locally without production credentials (Priority: P4)

**Goal**: Broadcast delivery can be switched off by configuration; local development never
requires production credentials (spec FR-013, A-007, research R4)

**Independent Test**: Start locally with `BROADCAST_ENABLED=false` and no production credentials
→ boots, sync runs, zero Discord messages, no flag changes (quickstart §4)

- [X] T033 [P] [US4] Add `BROADCAST_ENABLED` to `src/config/env.schema.ts` using the existing `booleanish` helper (`'true'|'false'`) but **default `'true'`** (production-safe per R4 — a `false` default would mute announcements on the next deploy); keep `envSchema` `.passthrough()` and leave `NODE_ENV` untouched
- [X] T034 [US4] Gate the announce pass in `src/modules/platforms/platform.scheduler.ts` on the flag via `ConfigService`: disabled → skip the pass entirely (no `send`, no `markBroadcasted`); sync pass unaffected (A-007) (depends: T033)
- [X] T035 [US4] Flag spec in `src/modules/platforms/platform.scheduler.spec.ts` — flag false → no runtime's `broadcastPending` invoked and nothing marked; flag true (or default) → full pass; sync pass runs in both states (depends: T034)
- [X] T036 [P] [US4] Document `BROADCAST_ENABLED` in `.env.example` — default `true`, set `false` for local development; deliberately NOT added to `docker-compose.yml`'s environment list (an unset list entry delivers an empty string that rejects validation — research R4)

**Checkpoint**: Local verification possible with zero production credentials; production behavior unchanged by default

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Retire `src/shared/`, update maintainer docs, and run the full gate (research R11, plan cutover step 9)

- [ ] T037 [P] Create `src/modules/platforms/epic/epic.types.ts` — move the six Epic-only types (`EpicGame`, `EpicApiImage`, `EpicApiPrice`, `EpicApiPromotionalOffer`, `EpicApiGame`, `FreeGamesPromotionApiResponse`) out of `src/shared/types/index.ts`
- [ ] T038 [P] Create `src/modules/platforms/xbox/xbox.types.ts` — move the four Xbox-only types (`XboxApiGame`, `XboxApiImage`, `XboxApiPrice`, `XboxCatalogIdResponse`) out of `src/shared/types/index.ts`
- [ ] T039 [P] Create `src/modules/platforms/platform.constants.ts` — move `GamePlatform`, `GamePlatformType`, `GamePlatformName` out of `src/shared/constants.ts` (takes a plain `.js` import extension — it is a file, not a barrel)
- [ ] T040 [P] Move `Game` into `src/modules/platforms/platform.types.ts` (it is the contracts' `TGame` — producer side owns the model) and delete the dead alias `XboxGame` (zero references)
- [ ] T041 Rewrite the ~7 import sites to the new paths — `src/modules/broadcast/broadcast.service.ts`, `src/modules/broadcast/game-embed.service.ts`, `src/modules/broadcast/game-embed.service.spec.ts`, `src/modules/admin/admin.commands.ts`, `src/modules/subscription/subscription.service.ts`, `src/modules/subscription/subscription.commands.ts`, `src/modules/subscription/dto/platform-option.dto.ts`, plus the Epic/Xbox components' DTO imports; keep `import type` on type-only symbols (depends: T037, T038, T039, T040)
- [ ] T042 Delete the `src/shared/` directory and confirm `grep -rn "shared/" src/` returns no matches (quickstart §2) (depends: T041)
- [ ] T043 [P] Update `AGENTS.md` (the "Adding a platform" touch-point list and the "`src/shared/constants` is a file, not a barrel" hazard note) and `README.md` step 5 to describe the registry-based integration flow and new file paths; leave historical records (`docs/plans/nest12_esm_toolchain.md`, `specs/002-*`) untouched (depends: T042)
- [ ] T044 [P] Re-read `docs/platform-integration.md` against the post-move tree; fix any paths the shared retirement changed (depends: T042)
- [ ] T045 Run the full six-step CI gate per AGENTS.md — `npx prettier --check "src/**/*.ts" "test/**/*.ts"` → `npm run type:check` → `npm run lint` → `npm run build` → `npm run test:cov` → `npm run test:e2e` — all green, 0 lint errors, no test skipped
- [ ] T046 Run the `quickstart.md` validation scenarios end-to-end — structural greps (incl. `shared/`), local boot with `BROADCAST_ENABLED=false`, eligibility parity query against the dev database, failure/retry drill (quickstart §4b, §5) (depends: T045)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — starts immediately
- **Foundational (Phase 2)**: Depends on Setup — **BLOCKS all user stories**
- **User Story 1 (Phase 3)**: Depends on Foundational (contracts + tokens)
- **User Story 2 (Phase 4)**: Depends on US1 (calls `send` through the generic lifecycle; reworks `broadcast.service.ts` after US1 slimmed it)
- **User Story 3 (Phase 5)**: Depends on US1 **and** US2 (verifies the final announce behavior — message lock, greps, legacy suite)
- **User Story 4 (Phase 6)**: Depends on US1 only (gates the scheduler's announce pass) — can run **in parallel with US2 and US3** (touches `env.schema.ts` + a flag check in the scheduler, disjoint from US2's files; US3 is read/verify only)
- **Polish (Phase 7)**: Depends on all user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: After Foundational — no dependencies on other stories (MVP)
- **User Story 2 (P2)**: After US1 — independently testable via the failure/retry drill
- **User Story 3 (P3)**: After US1 + US2 — independently testable via lock-in specs + greps + legacy suite
- **User Story 4 (P4)**: After US1 — independently testable via local boot with the flag off; parallelizable with US2/US3

### Within Each User Story

- Tests before implementation (FR-016 requested them explicitly)
- Storefront components before generic runtime; runtime before scheduler; scheduler before module wiring; wiring before deletions
- **US1 ordering hazard**: T018 (scheduler) and T022 (legacy cron removal) MUST land in one commit — two announce paths firing at `10 * * * *` would race and could double-send
- Story complete before moving to the next priority

### Parallel Opportunities

- Phase 2: T004 ∥ (after T003 types exist for its token type)
- US1 tests: T005 ∥ T006 ∥ T007 ∥ T008 (four different spec files)
- US1 components: T009 ∥ T010 (Epic) and T012 ∥ T013 (Xbox) and T016 ∥ T017-a; T009–T010 ∥ T012–T013 (epic/ vs xbox/ folders)
- US1 docs: T023 ∥ implementation tasks (different files)
- US2 tests: T024 ∥ T025
- US3 verification: T028 ∥ T029 ∥ T030
- US4: T033 ∥ T036; US4 phase ∥ US2/US3 phases
- Polish moves: T037 ∥ T038 ∥ T039 ∥ T040; T043 ∥ T044

---

## Parallel Example: User Story 1

```bash
# Launch all four US1 spec files together:
Task: "Epic eligibility spec in src/modules/platforms/epic/epic.repository.spec.ts (T005)"
Task: "Xbox eligibility spec in src/modules/platforms/xbox/xbox.repository.spec.ts (T006)"
Task: "Generic lifecycle spec in src/modules/platforms/generic-platform.spec.ts (T007)"
Task: "Scheduler isolation spec in src/modules/platforms/platform.scheduler.spec.ts (T008)"

# Then launch the storefront components together (different folders):
Task: "Epic API + mapper in src/modules/platforms/epic/ (T009, T010)"
Task: "Xbox API + mapper in src/modules/platforms/xbox/ (T012, T013)"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (green baseline)
2. Complete Phase 2: Foundational (CRITICAL — blocks all stories)
3. Complete Phase 3: User Story 1
4. **STOP and VALIDATE**: greps clean, `/sync` + `/broadcast` work, integration guide readable
5. The architecture goal (spec P1) is achieved — deploy/demo if ready

### Incremental Delivery

1. Setup + Foundational → contracts locked
2. Add US1 → structural refactor complete, behavior preserved (MVP!)
3. Add US2 → reliability defect fixed, retry drill passes → deploy
4. Add US3 → preservation proven by lock-in specs + full suite
5. Add US4 (parallel with US2/US3 if staffed) → safe local dev
6. Polish → `src/shared/` retired, docs updated, full gate green, quickstart executed

### Parallel Team Strategy

1. Team completes Setup + Foundational together
2. US1 is the long pole (19 tasks) — one implementer
3. Once US1 lands: Developer A = US2, Developer B = US4, Developer C = US3 (verify)
4. Everyone converges for Polish + the six-step gate

---

## Notes

- [P] tasks = different files, no dependencies; [Story] labels map tasks to spec user stories
- Constitution II invariant in every announce task: **`send` resolves before `markBroadcasted`** — never reproduce `broadcast.service.ts:65/:103`'s old ordering
- Commit after each task or logical group; T018+T022 are one atomic commit, T041+T042 are one atomic commit
- Lint is read-only (`npm run lint`, never `--fix`); formatting via `npm run format`; 22 `no-unsafe-*` warnings on a clean tree are normal
- Stop at any checkpoint to validate the story independently
- After this file exists, the mandatory `after_tasks` hook pushes these tasks to Linear as subtasks of STE-1 (deduped by `T\d{3,}` ID)
