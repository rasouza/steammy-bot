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

- [X] T001 Amend Principle II in `.specify/memory/constitution.md` as a **MAJOR** bump
  `3.1.2 → 4.0.0`: add the narrow carve-out permitting an operator-invoked dev reset to mark rows
  announced without a send, **provided its reply reports how many rows it suppressed**, and state
  explicitly that the rule governing the scheduled pipeline's delivery ordering is *not* relaxed.
  Follow the amendment procedure verbatim — affected principle, rationale, bump type, explicit
  maintainer sign-off already recorded 2026-10-02, `**Last Amended**` updated, and the Sync Impact
  Report scratch block removed before committing. Commit this alone as `docs:`.
- [X] T002 Update `AGENTS.md` where it repeats Principle II's delivery-ordering rule (the
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

- [X] T003 Extend `PlatformRepository<TGame>` in `src/modules/platforms/platform.types.ts` with
  the five primitives named verbatim in contracts §3 — `findDevCandidate(now)`,
  `markBroadcastedExcept(candidate, now)`, `markPending(game)`, `clear()`,
  `markAllBroadcasted()` — honouring rule **R-3.3**: *"`clear()` and `markAllBroadcasted()` do not
  take `now`; they are unconditional whole-catalog operations and are used only by the dev
  reset."* Add `recipient?: string` as the fourth parameter of `BroadcastPort.send` (rule R-4.1),
  and update the file-header comment to cite `specs/006-dev-smoke-commands/contracts/dev-command-contracts.md`
  alongside the existing spec-003 contract reference. `PlatformRuntime` is **not** touched here —
  its two methods belong to US2/US3.
- [X] T004 [P] Add unit coverage for the five new Epic primitives in
  `src/gamesources/epic/epic.repository.spec.ts`, asserting rule **R-3.1**: *"`findDevCandidate`
  and `markBroadcastedExcept` use the same criteria function `findPending` uses
  (`epicPendingCriteria`); generic code never reconstructs it."* Cover `findDevCandidate` ordering
  by ascending primary key, its `null` when nothing qualifies, and the suppression count returned
  by `markBroadcastedExcept`.
- [X] T005 [P] Add the equivalent unit coverage for the five Xbox primitives in
  `src/gamesources/xbox/xbox.repository.spec.ts`, reusing `xboxPendingCriteria` under the same
  **R-3.1** constraint.
- [X] T006 Implement the five primitives in `src/gamesources/epic/epic.repository.ts` using the
  injected TypeORM `Repository` of `CatalogEpic` — rule **R-3.2**: *"no raw SQL — every member is
  implemented with the injected TypeORM `Repository` of that platform's own entity."* Satisfies
  T004.
- [X] T007 Implement the five primitives in `src/gamesources/xbox/xbox.repository.ts` against
  `CatalogXbox` under the same **R-3.2** constraint. Satisfies T005.
- [X] T008 [P] Record the interface amendment in
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

- [X] T009 [P] [US1] Write the decision-function spec first in
  `src/modules/bot/command-scope.service.spec.ts`, covering all three roots against the three env
  states (`TEST_GUILD_ID` unset / set + `NODE_ENV=development` / set + any other), asserting
  contracts §2 verbatim: *"`undefined` is never treated as `development`; the absence of `NODE_ENV`
  must not widen anything (`envSchema` gives it no default on purpose)."* This must fail before
  T010.

### Implementation for User Story 1

- [X] T010 [US1] Implement `selectCommandScope(rootName, testGuildId, nodeEnv)` and
  `CommandScopeService.onModuleInit` in `src/modules/bot/command-scope.service.ts`. Read both
  values through `ConfigService`, never `process.env`: research R1 requires the hook to run after
  `SlashCommandsModule` has populated its cache and before `client.login()`. Apply
  `slashCommands.remove(...)` when a root is removed and `slashCommands.get(...).setGuilds([testGuildId])`
  otherwise. Satisfies T009.
- [X] T011 [US1] Register `CommandScopeService` in the `providers` array of
  `src/modules/bot/bot.module.ts`. Leave the existing
  `development: isDev && testGuildId ? [testGuildId] : false` option exactly as it is — research R1
  depends on that option still covering the five always-global commands in a dev run.
- [X] T012 [P] [US1] Create `src/modules/admin/dev.commands.ts`: one `@SlashCommand({ name: 'dev' })`
  root carrying `defaultMemberPermissions: PermissionFlagsBits.Administrator` and
  `dmPermission: false` (FR-004 / contract G4), with `@SubCommand` `sync` and `broadcast` handlers
  that `deferReply({ flags: MessageFlags.Ephemeral })` and reply that the command is not wired up
  yet. US2 and US3 replace those two handler bodies. Uses `PlatformOptionDto` for both, so the
  platform choices are the same ones `/sync` and `/broadcast` offer (FR-011).
- [X] T013 [US1] Provide `DevCommands` in the `providers` array of
  `src/modules/admin/admin.module.ts` alongside the existing `AdminCommands`.
- [X] T014 [US1] Add `test/command-scope.e2e-spec.ts`: a testing module that includes the **real**
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

- [X] T015 [P] [US2] Extend `src/modules/broadcast/broadcast.service.spec.ts` first: stub the
  subscription repository so it **throws if queried**, then assert contracts **R-4.1** (*"When
  [`recipient`] is present, `send` fetches exactly that channel and performs **no** `subscription`
  query"*) and **R-4.3** (*"with an explicit recipient `subscribers` is the number of recipients
  given (1), so a failed dev delivery leaves the row pending and never masquerades as 'no
  subscribers ⇒ success'"*), plus the unchanged no-recipient path.
- [X] T016 [P] [US2] Extend `src/modules/platforms/generic-platform.spec.ts` first with the
  `devBroadcast` sequence from research R6: `findDevCandidate` → `markBroadcastedExcept` →
  `markPending` → a **single** `send`; the returned `suppressed` equals the number the repository
  reported; a rejected send leaves the candidate pending; `candidate === null` yields
  `skipped: true` with `delivered: 0` (FR-007).
- [X] T017 [P] [US2] Create `src/modules/admin/dev.commands.spec.ts` first, asserting contracts §5:
  `deferReply` is called before any awaited work (FR-017 / SC-011), the invocation channel id is
  passed as the recipient (FR-016), and the reply text contains the suppression count (FR-015 /
  SC-009).

### Implementation for User Story 2

- [X] T018 [P] [US2] Honour the optional `recipient` in
  `src/modules/broadcast/broadcast.service.ts` — fetch that channel, skip the subscription query
  entirely, keep one `embed.build`, and return `{ delivered, subscribers }` per rules R-4.1/R-4.2.
  The no-recipient path stays byte-for-byte identical. Satisfies T015.
- [X] T019 [P] [US2] Add `devBroadcast(recipient)` to `PlatformRuntime` in
  `src/modules/platforms/platform.types.ts` and implement it in
  `src/modules/platforms/generic-platform.ts` following research R6's four steps, with the
  deterministic pick "ascending primary key". Satisfies T016.
- [X] T020 [US2] Replace the stub body of `onDevBroadcast` in `src/modules/admin/dev.commands.ts`:
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

- [X] T021 [P] [US3] Extend `src/modules/platforms/generic-platform.spec.ts` first with `reset()`
  covering research R5: a rejected `fetch` means `clear` is **never** called (rule **R-4.4**,
  *"no write before `fetch()` has resolved"*), a successful fetch with **zero** rows still clears,
  and the return value reports `fetched` and `seeded`.
- [X] T022 [P] [US3] Extend `src/modules/admin/dev.commands.spec.ts` first: `deferReply` precedes
  work, an unregistered platform is rejected through `PlatformOptionDto` before any handler work
  (FR-011), the reply carries the seeded count (FR-015 / US3 scenario 1), and a failed fetch
  reports a failure rather than a reset (FR-010 / US3 scenario 3).

### Implementation for User Story 3

- [X] T023 [US3] Add `reset()` to `PlatformRuntime` in `src/modules/platforms/platform.types.ts`
  and implement it in `src/modules/platforms/generic-platform.ts` per research R5:
  `fetch → map → (throw ⇒ abort, nothing written) → clear → saveAll → markAllBroadcasted`. Factor
  the shared `fetch → map → saveAll` steps out of `sync()` so the two paths cannot diverge, and
  **do not** skip `clear()` when the mapped result is empty. Satisfies T021.
- [X] T024 [US3] Replace the stub body of `onDevSync` in `src/modules/admin/dev.commands.ts`:
  `deferReply` first, `PlatformOptionDto` choices, the existing `runtime(type)` lookup, then
  `editReply` with the seeded-as-announced count, or the failure message with the catalog untouched
  when the fetch threw. Satisfies T022.

**Checkpoint**: all three user stories are independently functional.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Cross-story verification and documentation. Depends on every story you intend to ship.

- [X] T025 [P] Document the dev commands in `README.md`: add `/dev sync <platform>` and
  `/dev broadcast` under `### Available Commands`, and under `## Development` / `### Run the bot
  locally` state that both require `NODE_ENV=development` **and** `TEST_GUILD_ID`, that
  `/dev broadcast` posts into the channel it was run from, and that a deployed run never offers
  them (FR-014).
- [X] T026 [P] Verify `### Available Commands` and the `/help` embed in
  `src/modules/general/general.commands.ts` list **only** the shipped commands. `/dev sync` and
  `/dev broadcast` must not be advertised to end users; if a change is needed, make it here rather
  than in the dev command class.
- [X] T027 [P] Execute quickstart scenarios **S1–S8** in `specs/006-dev-smoke-commands/quickstart.md`
  and record the observed counts against SC-001…SC-011. Note the propagation caveat from research
  R8 when judging removed commands in a second guild.
- [X] T028 [P] Confirm zero schema change per research R9: `git diff main --stat` contains **no**
  file under `src/database/`, no migration, and no edit to `src/database/entities/index.ts` or
  `src/database/data-source-options.ts`.
- [X] T029 [P] Re-validate `specs/006-dev-smoke-commands/checklists/requirements.md` after
  implementation: still **16/16**, with no `[NEEDS CLARIFICATION]` marker reintroduced into
  `specs/006-dev-smoke-commands/spec.md`.
- [X] T030 Run the full CI sequence locally **in order** (Principle IV), all six steps passing —
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

---

## Phase 7: Convergence

**Purpose**: Remaining work found by `/speckit.converge` on 2026-10-09, after every earlier phase
reported done. Assessment is against the present state of the tree (commit `60b0486`), not against
the checkboxes: completion claims are not evidence. The constitution was checked in full (I–V plus
the technical-constraint and deployment blocks) and produced no violation.

- [x] T031 Refuse at runtime any invocation of `/sync`, `/broadcast`, `/dev sync` or
  `/dev broadcast` whose `interaction.guildId` is absent or differs from `TEST_GUILD_ID`, before any
  catalog read, write, or message — replying with a refusal and leaving catalog state and
  subscriptions untouched. Registration scoping is not sufficient on its own: the spec's edge case
  "an invocation arrives in a non-test guild" names a stale registration as its cause, and the
  operator's environment demonstrably has stale global copies. The check belongs behind one shared
  guard consulted by all four handlers (Principle I: no per-command copy), reads `TEST_GUILD_ID`
  through `ConfigService`, and treats an unset `TEST_GUILD_ID` as refusing everything — the same
  failing-closed shape `selectCommandScope` already has. Prove it with a colocated spec covering
  DM (`guildId` undefined), the test guild, and a second guild, asserting no `runtime.*` method and
  no `BroadcastService.send` call in the refusing cases; extend
  `src/modules/admin/dev.commands.spec.ts` and add coverage for the admin pair (there is currently
  no `src/modules/admin/admin.commands.spec.ts`). Per US1/AC7, the spec Edge Cases entry, and
  FR-001 (missing).
- [x] T032 Degrade to "not offered" when `TEST_GUILD_ID` names a guild the bot has not joined, so
  startup survives (FR-003, US1/AC5). Today `CommandScopeService.onModuleInit` pins the three
  roots unconditionally and Necord's `registerCommandsInGuild` logs then **rethrows** a rejected
  `application.commands.set`, from a bare `clientReady` listener — a `Missing Access` therefore
  escapes as an unhandled rejection rather than as a missing command. Confirm the ordering before
  choosing the mechanism: `onModuleInit` runs before `client.login()`, so guild membership is not
  yet knowable there and a listener that runs ahead of Necord's own registration (for example a
  `clientOnce`/`prependOnceListener` on `clientReady`) is what can act on it. Whatever mechanism is
  chosen, it MUST leave the five always-global commands registered and MUST be pinned by
  `test/command-scope.e2e-spec.ts` against a fake `Client` whose guild cache lacks the configured
  guild — the assertion that fails open if the guard regresses. Per FR-003, US1/AC5, and the
  "test guild configured but the bot is not a member" edge case (missing).
- [ ] T033 Execute quickstart scenarios **S1–S7** in
  `specs/006-dev-smoke-commands/quickstart.md` from a machine that has `.env` credentials, a test
  guild, and a second guild, and record the observed counts for SC-001, SC-002, SC-003, SC-004,
  SC-005, SC-006, SC-008, SC-009, SC-010 and SC-011 in the validation record. S8 is already
  recorded as executed; the record's "S1–S7 not executed in this environment" block is what this
  closes. T027 is checked but only delivered its automated half, so this is a partial completion
  of that task rather than a new one. If a scenario genuinely cannot be run, record why beside it
  rather than leaving it unmarked — the current record's honesty about what was *not* observed is
  the property to preserve. Per T027 (partial).
  > **Status 2026-10-18/19 (operator run)**: **partially executed.** **S1**, **S3**, **S4** and
  > **SC-006** are done — a second guild (`Nazaré's server`, `1561489788027011164`) was created for
  > the run. Registry reads show **0** commands there and the 3 scoped roots (`sync`, `broadcast`, `dev` =
  > 4 invocable admin/dev commands) in the test guild, with the dev application's global set
  > confirmed empty. For S3 a temporary `/sync` registration was written into the second guild to
  > make the command invokable there, and invoking it returned the refusal string verbatim; the
  > registration was deleted immediately and the test guild's 8 scoped registrations were
  > confirmed unchanged. For S4, five consecutive `/dev broadcast` runs each delivered exactly 2
  > messages (one Epic, one Xbox) into the invocation channel only, with the reply stating
  > `delivered 1` and no suppression clause — correct, since nothing was surplus. For SC-006,
  > Epic's catalog was emptied to four rows deleted and one invocation reported
  > `Epic Games: skipped (0 delivered)` while `Xbox Game Pass: delivered 1` still delivered, with
  > no error — the skip branch. A preceding run also showed the suppression clause firing with
  > the correct number (`suppressed 5`), the first live confirmation of FR-015's other arm.
  > Still open: S1b, S2's live count (blocked on a deploy — the running image is `v3.4.0`, which
  > predates this branch), S5, S6 and S7. Recorded in quickstart.md
  > with a reason beside each rather than left unmarked.
  >
  > A second converge pass re-verified T031–T035 against the tree and appended Phase 8: **T036**
  > supersedes the manual half of T027, which delivered only its automated half, and **T037** (the
  > PR-note justification) is closed. This task and T036 track the remainder of the same run.
- [x] T034 Correct `specs/006-dev-smoke-commands/research.md` **R8** and step 3 of the quickstart's
  post-deploy checklist: `application.commands.set(...)` replaces the global set only for the
  application its token belongs to, and a development run leaves Necord nothing global to write
  (it early-returns), so **a development bot's stale global commands are never purged by any
  boot** — not by a production boot, and not by a later development boot either. R8 currently
  concludes "nothing extra is needed" from the production pairing alone, which is the reading the
  operator's own environment disproved: `/sync` and `/broadcast` remained globally registered on
  the dev application indefinitely. State the real invariant and what an operator must do about
  stale globals on a second application, keeping the propagation-delay caveat intact. Do not
  reinstate the deleted purge script — the operator decided against it — but the document must
  stop implying one is unnecessary in every case. Per SC-001 and R8 (contradicts).
- [x] T035 Refresh `specs/006-dev-smoke-commands/quickstart.md` for the behaviour change in commit
  `60b0486`: the S4 automated-evidence cell cites the test since renamed to "skips a platform with
  no catalog rows at all (FR-007)", the S8 record states **101** unit tests where the suite now
  holds **102**, and the "Expected failures" row asserting that a platform reporting `0` delivered
  despite holding rows is *expected* is no longer true now that `findDevCandidate` is window-free —
  the only remaining reason for that observation is an empty catalog. Per quickstart.md (contradicts).

---

## Phase 8: Convergence

**Purpose**: Remaining work found by `/speckit.converge` on 2026-10-18, after Phase 7 was
implemented. Assessment is against the present state of the tree, not against the checkboxes:
completion claims are not evidence. All 35 prior tasks were re-verified — T031's guard, T032's
ready-time degradation, T034's R8 amendment and T035's record split are all present and
behaving as written. The constitution was re-checked in full (I–V plus the technical-constraint,
data-representation, deployment and workflow blocks) and produced **no violation**.

The whole of what remains is the same gap T033 names from the other side: every behavioural
obligation is pinned by an automated spec and **none of them has ever been observed against a
live Discord guild**. The quickstart says so itself rather than claiming an observation, and
preserving that honesty is the property this phase protects.

- [ ] T036 Execute quickstart scenarios **S1–S7** from a machine holding `.env` credentials, the
  test guild, and a second guild the bot has joined, and record every observed count in the
  validation record of `specs/006-dev-smoke-commands/quickstart.md`, replacing the
  "S1–S7 — manual scenarios ⏳ not executed in this environment" block with a dated run. Cover,
  in this order: **S1/SC-001** — command counts of 0 in the second guild, 4 in the test guild
  under `npm run start:dev`; **S2/SC-008** — a run with `NODE_ENV=production` offering exactly
  `/sync` and `/broadcast` and 0 `/dev` commands (take this from the deployed bot; do **not** run
  a local process with `NODE_ENV=production` against the dev token, because that rewrites the
  application's global command set and corrupts the S1/S3 counts — research R8); **S3/SC-001** —
  no `/sync`, `/broadcast` or `/dev` invocation succeeds in the second guild, with the runtime
  refusal from T031 confirmed to leave catalog state untouched; **S4/SC-002, SC-006, SC-010** —
  five consecutive `/dev broadcast` invocations delivering exactly 1 message per platform into
  the invocation channel every time, then an emptied catalog reporting skipped with 0 delivered
  and no error; **S5/SC-003, SC-004, SC-009** — `/dev sync <platform>` leaving exactly the
  storefront's rows, the reply stating the seeded-as-announced count, and the next scheduled pass
  delivering 0 (the announce cron is `10 * * * *`, so this can need up to ~70 minutes); 
  **S6/SC-005** — a broken storefront leaving the row count byte-identical before and after;
  **S7/SC-011** — no invocation surfacing Discord's "application did not respond", including a
  slow `/dev sync`. Note research **R8**'s propagation caveat when judging removed commands in the
  second guild: a removed listing can persist for up to about an hour, so refresh or wait before
  calling it a defect. If a scenario genuinely cannot be run, record **why** beside it rather than
  leaving it unmarked — the record's honesty about what was *not* observed is the property to
  preserve. Per T027 (partial), which delivered only its automated half, and T033 (partial).
- [x] T037 Record in the PR description for this branch the justification for the two classes the
  plan's Project Structure did not anticipate: `src/modules/admin/test-guild.guard.ts` and the
  ready-time degradation added to `src/modules/bot/command-scope.service.ts`. Both are traceable
  to Phase 7 tasks (T031, T032) rather than being scope creep, and both satisfy Principle I —
  `TestGuildGuard` holds the refusal rule in exactly one place consulted by all four handlers, and
  neither class names a platform — but the plan still declares only 1 new service and 1 new
  command class, so the divergence is surfaced here for review rather than left silent. State the
  justification or remove the divergence; do neither silently. Per plan §Project Structure
  (unrequested).
