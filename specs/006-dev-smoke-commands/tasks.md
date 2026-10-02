---

description: "Task list template for feature implementation"
---

# Tasks: Guild-Scoped Dev Smoke Commands

**Input**: Design documents from `/specs/006-dev-smoke-commands/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md),
[data-model.md](./data-model.md), [contracts/](./contracts/dev-command-contracts.md),
[quickstart.md](./quickstart.md), `.specify/memory/constitution.md`

**Tests**: Included. The spec carries no standalone testing section, but each user story defines an
**Independent Test** and the constitution requires colocated specs alongside every change
(Principle V, workflow step 3); [plan.md](./plan.md)'s contract §Verification map names the file
each obligation is proven in.

**Organization**: Tasks are grouped by user story so each story can be implemented, tested and
delivered independently.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

Single project: `src/` and `test/` at the repository root (see plan.md §Project Structure).
Unit specs are colocated as `src/**/*.spec.ts`; e2e specs live in `test/**/*.e2e-spec.ts`.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Make the feature legal before any code exists. FR-006 and FR-009 mark rows announced
without sending, which Principle II forbids as written; the maintainer ratified a **MAJOR**
amendment (research R11, Clarification 4) and the constitution's amendment procedure requires it
to land before the work it authorises.

- [ ] T001 Amend Principle II in `.specify/memory/constitution.md` as a **MAJOR** bump
  `3.1.2 → 4.0.0`: add the narrow carve-out permitting an operator-invoked dev reset to mark rows
  announced without a send, **provided its reply reports how many rows it suppressed**, and state
  explicitly that the rule governing the scheduled pipeline's delivery ordering is *not* relaxed.
  Follow the amendment procedure verbatim — affected principle, rationale, bump type, explicit
  maintainer sign-off already recorded 2026-10-02, `**Last Amended**` updated, and the Sync Impact
  Report scratch block removed before committing. Commit this alone as `docs:`.
- [ ] T002 Update `AGENTS.md` where it repeats Principle II's delivery-ordering rule (the
  "delivery-before-state" paragraph and the plan-ordering note) so it states the carve-out and
  points at the constitution version, per amendment-procedure step 3. Same commit as T001 — the
  two files are one logical change.

**Checkpoint**: `.specify/memory/constitution.md` reads `**Version**: 4.0.0`, the carve-out and its
reporting condition are present, and no scratch report is committed. Every later phase depends on
this.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The shared persistence seam that **User Story 2 and User Story 3** both build on.

**⚠️ NOTE FOR THIS FEATURE**: User Story 1 (command registration) does **not** depend on this phase
and may start immediately or in parallel. User Stories 2 and 3 MUST NOT begin until it is complete.

- [ ] T003 Extend `PlatformRepository<TGame>` in `src/modules/platforms/platform.types.ts` with
  the five primitives named verbatim in contracts §3 — `findDevCandidate(now)`,
  `markBroadcastedExcept(candidate, now)`, `markPending(game)`, `clear()`,
  `markAllBroadcasted()` — honouring rule **R-3.3**: *"`clear()` and `markAllBroadcasted()` do not
  take `now`; they are unconditional whole-catalog operations and are used only by the dev
  reset."* Add `recipient?: string` as the fourth parameter of `BroadcastPort.send` (rule R-4.1),
  and update the file-header comment to cite `specs/006-dev-smoke-commands/contracts/dev-command-contracts.md`
  alongside the existing spec-003 contract reference. `PlatformRuntime` is **not** touched here —
  its two methods belong to US2/US3.
- [ ] T004 [P] Add unit coverage for the five new Epic primitives in
  `src/gamesources/epic/epic.repository.spec.ts`, asserting rule **R-3.1**: *"`findDevCandidate`
  and `markBroadcastedExcept` use the same criteria function `findPending` uses
  (`epicPendingCriteria`); generic code never reconstructs it."* Cover `findDevCandidate` ordering
  by ascending primary key, its `null` when nothing qualifies, and the suppression count returned
  by `markBroadcastedExcept`.
- [ ] T005 [P] Add the equivalent unit coverage for the five Xbox primitives in
  `src/gamesources/xbox/xbox.repository.spec.ts`, reusing `xboxPendingCriteria` under the same
  **R-3.1** constraint.
- [ ] T006 Implement the five primitives in `src/gamesources/epic/epic.repository.ts` using the
  injected TypeORM `Repository` of `CatalogEpic` — rule **R-3.2**: *"no raw SQL — every member is
  implemented with the injected TypeORM `Repository` of that platform's own entity."* Satisfies
  T004.
- [ ] T007 Implement the five primitives in `src/gamesources/xbox/xbox.repository.ts` against
  `CatalogXbox` under the same **R-3.2** constraint. Satisfies T005.
- [ ] T008 [P] Record the interface amendment in
  `specs/003-easy-add-platform/contracts/platform-contracts.md` as a short dated section pointing
  at `specs/006-dev-smoke-commands/contracts/dev-command-contracts.md` §3, so the contract document
  the type file cites does not go stale.

> **Commit once, after T006 and T007.** The interface and its two implementations are one logical
> change; committing T003 alone leaves `type:check` red.

**Checkpoint**: `npm run type:check` is green, both repositories satisfy the extended interface,
and no platform-agnostic file names a platform (Principle I).

---

## Phase 3: User Story 1 - Administrative commands live only in the test guild (Priority: P1) 🎯 MVP

**Goal**: `/sync`, `/broadcast`, `/dev sync` and `/dev broadcast` exist only in `TEST_GUILD_ID`, the
`/dev` pair exists only during a local development run, and nothing prevents the bot from starting
when the guild is absent (FR-001…FR-004, FR-013, FR-014).

**Independent Test**: Join a second guild the bot has joined and count the four commands there:
**0**. In the test guild during `npm run start:dev`: **4**. In a run with `NODE_ENV=production` and
`TEST_GUILD_ID` set: **2** (`/sync`, `/broadcast`). With `TEST_GUILD_ID` unset: the bot still boots
and all four are absent (SC-001, SC-008; quickstart S1–S3).

### Tests for User Story 1

- [ ] T009 [P] [US1] Write the decision-function spec first in
  `src/modules/bot/command-scope.service.spec.ts`, covering all three roots against the three env
  states (`TEST_GUILD_ID` unset / set + `NODE_ENV=development` / set + any other), asserting
  contracts §2 verbatim: *"`undefined` is never treated as `development`; the absence of `NODE_ENV`
  must not widen anything (`envSchema` gives it no default on purpose)."* This must fail before
  T010.

### Implementation for User Story 1

- [ ] T010 [US1] Implement `selectCommandScope(rootName, testGuildId, nodeEnv)` and
  `CommandScopeService.onModuleInit` in `src/modules/bot/command-scope.service.ts`. Read both
  values through `ConfigService`, never `process.env`: research R1 requires the hook to run after
  `SlashCommandsModule` has populated its cache and before `client.login()`. Apply
  `slashCommands.remove(...)` when a root is removed and `slashCommands.get(...).setGuilds([testGuildId])`
  otherwise. Satisfies T009.
- [ ] T011 [US1] Register `CommandScopeService` in the `providers` array of
  `src/modules/bot/bot.module.ts`. Leave the existing
  `development: isDev && testGuildId ? [testGuildId] : false` option exactly as it is — research R1
  depends on that option still covering the five always-global commands in a dev run.
- [ ] T012 [P] [US1] Create `src/modules/admin/dev.commands.ts`: one `@SlashCommand({ name: 'dev' })`
  root carrying `defaultMemberPermissions: PermissionFlagsBits.Administrator` and
  `dmPermission: false` (FR-004 / contract G4), with `@SubCommand` `sync` and `broadcast` handlers
  that `deferReply({ flags: MessageFlags.Ephemeral })` and reply that the command is not wired up
  yet. US2 and US3 replace those two handler bodies. Uses `PlatformOptionDto` for both, so the
  platform choices are the same ones `/sync` and `/broadcast` offer (FR-011).
- [ ] T013 [US1] Provide `DevCommands` in the `providers` array of
  `src/modules/admin/admin.module.ts` alongside the existing `AdminCommands`.
- [ ] T014 [US1] Add `test/command-scope.e2e-spec.ts`: a testing module that includes the **real**
  `SlashCommandsModule` alongside `CommandScopeService`, with a fake `Client` provided from a
  `@Global()` test module — no Discord token. Assert contract **G1** (`sync`/`broadcast`/`dev`
  never global), **G2** (all three absent when `TEST_GUILD_ID` is unset), **G3** (`dev` absent when
  `NODE_ENV` is not `development`), and **G5** (the registry is already populated when the hook
  runs — research R10 flags this as the assertion that fails *open* if it regresses).

**Checkpoint**: User Story 1 is fully functional — the three command counts (0 / 4 / 2) can be
observed without any dev-command behaviour existing yet, because the handlers are stubs.

---

## Phase 4: User Story 2 - One real message per platform, on demand (Priority: P2)

**Goal**: `/dev broadcast` delivers exactly one freshly built message per platform into the channel
the command was typed in, reads no subscription row to choose that recipient, and states how many
surplus rows it suppressed (FR-005…FR-007, FR-012, FR-015…FR-017).

**Independent Test**: With catalog rows present, run `/dev broadcast` five consecutive times in a
test-guild channel: exactly one message per platform each time, all in that channel, reply stating
the suppression count; empty a platform's catalog and run again — reported skipped, invocation
succeeds, zero messages (SC-002, SC-006, SC-009, SC-010, SC-011; quickstart S4).

### Tests for User Story 2

- [ ] T015 [P] [US2] Extend `src/modules/broadcast/broadcast.service.spec.ts` first: stub the
  subscription repository so it **throws if queried**, then assert contracts **R-4.1** (*"When
  [`recipient`] is present, `send` fetches exactly that channel and performs **no** `subscription`
  query"*) and **R-4.3** (*"with an explicit recipient `subscribers` is the number of recipients
  given (1), so a failed dev delivery leaves the row pending and never masquerades as 'no
  subscribers ⇒ success'"*), plus the unchanged no-recipient path.
- [ ] T016 [P] [US2] Extend `src/modules/platforms/generic-platform.spec.ts` first with the
  `devBroadcast` sequence from research R6: `findDevCandidate` → `markBroadcastedExcept` →
  `markPending` → a **single** `send`; the returned `suppressed` equals the number the repository
  reported; a rejected send leaves the candidate pending; `candidate === null` yields
  `skipped: true` with `delivered: 0` (FR-007).
- [ ] T017 [P] [US2] Create `src/modules/admin/dev.commands.spec.ts` first, asserting contracts §5:
  `deferReply` is called before any awaited work (FR-017 / SC-011), the invocation channel id is
  passed as the recipient (FR-016), and the reply text contains the suppression count (FR-015 /
  SC-009).

### Implementation for User Story 2

- [ ] T018 [P] [US2] Honour the optional `recipient` in
  `src/modules/broadcast/broadcast.service.ts` — fetch that channel, skip the subscription query
  entirely, keep one `embed.build`, and return `{ delivered, subscribers }` per rules R-4.1/R-4.2.
  The no-recipient path stays byte-for-byte identical. Satisfies T015.
- [ ] T019 [P] [US2] Add `devBroadcast(recipient)` to `PlatformRuntime` in
  `src/modules/platforms/platform.types.ts` and implement it in
  `src/modules/platforms/generic-platform.ts` following research R6's four steps, with the
  deterministic pick "ascending primary key". Satisfies T016.
- [ ] T020 [US2] Replace the stub body of `onDevBroadcast` in `src/modules/admin/dev.commands.ts`:
  `deferReply` first, resolve the platform from `PLATFORM_REGISTRY` through the existing
  `runtime(type)` lookup, pass the invocation channel's id, then `editReply` with delivered and
  suppressed counts, reporting a platform with no eligible row as skipped rather than failing the
  invocation. Satisfies T017.

**Checkpoint**: US1 and US2 are both independently testable — scoping holds, and a real message per
platform lands in the invocation channel.

---

## Phase 5: User Story 3 - Reset a platform's catalog with scheduled silence (Priority: P3)

**Goal**: `/dev sync <platform>` replaces a platform's catalog with exactly what the storefront
returned, marks every row announced so the scheduled pass stays silent, and removes nothing when
the fetch fails (FR-008…FR-011, FR-015, FR-017).

**Independent Test**: Seed a platform with stale rows of mixed state, run `/dev sync <platform>`,
inspect: only the storefront's rows remain, the reply states how many were seeded announced, and
the next scheduled pass delivers nothing. Break the storefront and repeat: row count byte-identical
(SC-003, SC-004, SC-005; quickstart S5–S6).

### Tests for User Story 3

- [ ] T021 [P] [US3] Extend `src/modules/platforms/generic-platform.spec.ts` first with `reset()`
  covering research R5: a rejected `fetch` means `clear` is **never** called (rule **R-4.4**,
  *"no write before `fetch()` has resolved"*), a successful fetch with **zero** rows still clears,
  and the return value reports `fetched` and `seeded`.
- [ ] T022 [P] [US3] Extend `src/modules/admin/dev.commands.spec.ts` first: `deferReply` precedes
  work, an unregistered platform is rejected through `PlatformOptionDto` before any handler work
  (FR-011), the reply carries the seeded count (FR-015 / US3 scenario 1), and a failed fetch
  reports a failure rather than a reset (FR-010 / US3 scenario 3).

### Implementation for User Story 3

- [ ] T023 [US3] Add `reset()` to `PlatformRuntime` in `src/modules/platforms/platform.types.ts`
  and implement it in `src/modules/platforms/generic-platform.ts` per research R5:
  `fetch → map → (throw ⇒ abort, nothing written) → clear → saveAll → markAllBroadcasted`. Factor
  the shared `fetch → map → saveAll` steps out of `sync()` so the two paths cannot diverge, and
  **do not** skip `clear()` when the mapped result is empty. Satisfies T021.
- [ ] T024 [US3] Replace the stub body of `onDevSync` in `src/modules/admin/dev.commands.ts`:
  `deferReply` first, `PlatformOptionDto` choices, the existing `runtime(type)` lookup, then
  `editReply` with the seeded-as-announced count, or the failure message with the catalog untouched
  when the fetch threw. Satisfies T022.

**Checkpoint**: all three user stories are independently functional.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Cross-story verification and documentation. Depends on every story you intend to ship.

- [ ] T025 [P] Document the dev commands in `README.md`: add `/dev sync <platform>` and
  `/dev broadcast` under `### Available Commands`, and under `## Development` / `### Run the bot
  locally` state that both require `NODE_ENV=development` **and** `TEST_GUILD_ID`, that
  `/dev broadcast` posts into the channel it was run from, and that a deployed run never offers
  them (FR-014).
- [ ] T026 [P] Verify `### Available Commands` and the `/help` embed in
  `src/modules/general/general.commands.ts` list **only** the shipped commands. `/dev sync` and
  `/dev broadcast` must not be advertised to end users; if a change is needed, make it here rather
  than in the dev command class.
- [ ] T027 [P] Execute quickstart scenarios **S1–S8** in `specs/006-dev-smoke-commands/quickstart.md`
  and record the observed counts against SC-001…SC-011. Note the propagation caveat from research
  R8 when judging removed commands in a second guild.
- [ ] T028 [P] Confirm zero schema change per research R9: `git diff main --stat` contains **no**
  file under `src/database/`, no migration, and no edit to `src/database/entities/index.ts` or
  `src/database/data-source-options.ts`.
- [ ] T029 [P] Re-validate `specs/006-dev-smoke-commands/checklists/requirements.md` after
  implementation: still **16/16**, with no `[NEEDS CLARIFICATION]` marker reintroduced into
  `specs/006-dev-smoke-commands/spec.md`.
- [ ] T030 Run the full CI sequence locally **in order** (Principle IV), all six steps passing —
  `npx prettier --check "src/**/*.ts" "test/**/*.ts"`, `npm run type:check`, `npm run lint`,
  `npm run build`, `npm test`, `npm run db:e2e:setup && npm run test:e2e`. Do not pass `--fix` to
  `npm run lint`.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately. **T001/T002 gate everything else.**
- **Foundational (Phase 2)**: Depends on Setup. **Blocks US2 and US3 only.**
- **User Story 1 (Phase 3)**: Independent of Phase 2 — may run alongside it or first. The spec
  calls US1 the prerequisite for introducing the `/dev` commands at all, so US1 must precede any
  production exposure.
- **User Story 2 (Phase 4)**: Requires Phases 1 and 2.
- **User Story 3 (Phase 5)**: Requires Phases 1 and 2. Independent of US2's *behaviour*, but
  shares `platform.types.ts`, `generic-platform.ts`, `dev.commands.ts`, `epic.repository.ts` and
  `xbox.repository.ts` with it — run **after** US2 to avoid same-file conflicts.
- **Polish (Phase 6)**: Depends on every story being delivered.

### User Story Dependencies

- **US1 (P1)**: only Setup. Independent test: the three command counts.
- **US2 (P2)**: Setup + Foundational. Independent test: five consecutive one-per-platform runs.
- **US3 (P3)**: Setup + Foundational. Independent test: catalog equality + scheduled silence.
- **US2 → US3**: preferred order, and required if the same person edits the shared files.

### Within Each User Story

Tests first (they must fail) → shared types → service/lifecycle → command handler → e2e.

### Parallel Opportunities

- Phase 1: none (T002 follows T001's wording).
- Phase 2: **T004 ∥ T005**; then **T006 ∥ T007**; **T008 ∥ T006/T007**.
- Phase 3: **T009 ∥ T012**; T010→T011 and T012→T013 then run as two independent tracks.
- Phase 4: **T015 ∥ T016 ∥ T017**; then **T018 ∥ T019**; T020 last.
- Phase 5: **T021 ∥ T022**; then T023 → T024.
- Phase 6: **T025 ∥ T026 ∥ T027 ∥ T028 ∥ T029**, with T030 last.
- Different user stories may be worked in parallel **only** where their shared files are not
  contested: US1 is fully parallel to everything; US2 and US3 are not parallel to each other.

---

## Parallel Example: User Story 2

```bash
# Launch the three failing specs together:
Task: "Recipient-path spec — src/modules/broadcast/broadcast.service.spec.ts (T015)"
Task: "devBroadcast sequence spec — src/modules/platforms/generic-platform.spec.ts (T016)"
Task: "Reply-contract spec — src/modules/admin/dev.commands.spec.ts (T017)"

# Then the two independent implementations together:
Task: "recipient handling — src/modules/broadcast/broadcast.service.ts (T018)"
Task: "PlatformRuntime.devBroadcast — src/modules/platforms/platform.types.ts + generic-platform.ts (T019)"

# Handler last, once devBroadcast exists:
Task: "onDevBroadcast — src/modules/admin/dev.commands.ts (T020)"
```

---

## Implementation Strategy

### MVP First (User Story 1 only)

1. Complete Phase 1: **T001–T002** — the constitution must read 4.0.0 first.
2. Complete Phase 3: **T009–T014** (Phase 2 is not required for US1).
3. **STOP and VALIDATE**: observe the three counts — 0 in another guild, 4 in the test guild under
   `start:dev`, 2 under `NODE_ENV=production`, 0 everywhere with `TEST_GUILD_ID` unset.
4. That alone closes FR-001…FR-004, FR-013, FR-014, SC-001 and SC-008 — a deliverable increment
   with no destructive capability shipped.

### Incremental Delivery

1. Setup → constitution authorises the carve-out.
2. US1 → the exposure is closed, ship-able on its own.
3. Foundational + US2 → on-demand broadcast smoke checks.
4. US3 → deterministic catalog reset.
5. Polish → quickstart S1–S8 and the six-step gate.

### Notes

- `[P]` tasks touch different files and have no dependency on incomplete tasks.
- Commit per logical change: T001+T002; T003+T006+T007 (+T004/T005) as one; then per story.
- Stop at any checkpoint to validate that story independently.
- Avoid: running the gate between T003 and T007; starting US3 before US2 on the shared files;
  introducing any `if (platform === ...)` branch in generic code (Principle I); writing a
  `broadcasted` flag before a successful send outside the two carve-out methods (Principle II).
