# Phase 1 Data Model: Guild-Scoped Dev Smoke Commands

**Feature**: `specs/006-dev-smoke-commands` | **Date**: 2026-10-02

## Schema Impact

**None.** No new entity, column, index, or table; no migration file. Everything below describes
_state_ — which rows exist and what the `broadcasted` flag holds — not structure. Consequently
nothing is added to `src/database/entities/index.ts` or to the `entities` array in
`src/database/data-source-options.ts`, and Principle III is satisfied vacuously (research R9).

## Entities the Feature Touches

### Catalog row (`catalog_epic`, `catalog_xbox`)

The per-platform game row. Only two of its columns are in scope.

| Column                           | Type          | In scope      | Notes                                                                                                                                       |
| -------------------------------- | ------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`                             | primary key   | ordering only | Deterministic pick order is ascending `id` (research R6).                                                                                   |
| `broadcasted`                    | boolean       | **yes**       | The announced/un-announced state. The only column this feature writes.                                                                      |
| `offer_start_at`, `offer_end_at` | `timestamptz` | read only     | Epic's eligibility window, evaluated inside `epicPendingCriteria`. Xbox has no equivalent.                                                  |
| title / price / size / image / … | various       | no            | `price` and `size` are `bigint`, so `pg` returns strings; `Number()` coercion stays in `game-embed.service.ts`. Prices are stored in cents. |

### Subscription (`subscription`)

**Read by this feature only to prove it is not read.** `/dev broadcast` never consults it to pick a
recipient (FR-016); the scheduled pass and the admin `/broadcast` keep consulting it unchanged. No
row is inserted, updated, or deleted here — creating a throwaway subscription for the invocation
channel was explicitly rejected (research R3).

### Test guild

A configuration value (`TEST_GUILD_ID`), not a record. Its absence is a first-class state with a
defined meaning: no admin or dev command is offered anywhere (FR-002).

### Invocation channel

The channel id the operator typed in. Ephemeral — it is read from the interaction and passed as the
`recipient` argument of `send()`. Nothing about it is persisted.

## State Model

The state machine is one bit with one legal transition, plus two _operator-initiated_ resets that
the constitution's MAJOR carve-out permits (Clarification 1).

```text
                     (scheduled pass, admin /broadcast, /dev broadcast — delivery acknowledged)
        ┌────────────────────────────────────────────────────────────────────────┐
        │                                                                        v
   ┌────┴─────┐                                                          ┌──────────────┐
   │ pending  │                                                          │  announced   │
   │ (false)  │                                                          │   (true)     │
   └────┬─────┘                                                          └──────┬───────┘
        │                                                                       │
        │  /dev sync seeding          (markAllBroadcasted — reports count)      │
        │  /dev broadcast surplus      (markBroadcastedExcept — reports count)  │
        └───────────────────────────────────────────────────────────────────────┘
```

**Invariants**

1. **I1 — Delivery precedes marking on the production path.** `GenericPlatform.broadcastPending`
   calls `markBroadcasted(game)` only after `send()` reports `delivered > 0 || subscribers === 0`.
   A total failure leaves the row pending for the next pass. This feature does not change that
   ordering (Principle II).
2. **I2 — The two reverse arrows are the carve-out.** `markAllBroadcasted()` and
   `markBroadcastedExcept()` move rows `false → true` _without_ a send. They are permitted only
   for an operator-invoked dev reset, and only because FR-015 makes the reply state how many rows
   moved. The amendment must be merged first (research R11).
3. **I3 — Exactly one row per platform is ever pending at the moment `/dev broadcast` starts
   delivering.** Steps in research R6 guarantee this: suppress, then flip the candidate, then run
   the normal loop.
4. **I4 — A failed fetch writes nothing.** `reset()` throws before `clear()`; the catalog's rows
   and their flags are untouched (FR-010 / SC-005).
5. **I5 — A successful reset replaces the set.** `clear()` followed by `saveAll()` means the
   catalog holds exactly the storefront's response, stale rows at **0** (FR-008 / SC-004).

### Transitions by operation

| Operation                            | Rows written                     | Direction                 | Sends? | Reported count  |
| ------------------------------------ | -------------------------------- | ------------------------- | ------ | --------------- |
| Scheduled pass / `/broadcast`        | one per delivered game           | `false → true`            | yes    | not applicable  |
| `/dev broadcast` surplus suppression | all pending except the candidate | `false → true`            | no     | `suppressed`    |
| `/dev broadcast` candidate flip      | the candidate                    | `true → false` (or no-op) | no     | —               |
| `/dev broadcast` delivery loop       | the candidate                    | `false → true`            | yes    | `delivered`     |
| `/dev sync` seeding                  | every row in the catalog         | `false → true`            | no     | `seeded`        |
| `/dev sync` failure                  | none                             | —                         | no     | failure message |

## Validation Rules

- **Platform identity**: `/dev sync <platform>` accepts only a key from the central `gameSources`
  list, through the existing `PlatformOptionDto` choices; an unregistered key is rejected before
  any handler work (FR-011). `runtime(type)` already throws `Platform is not registered` — the dev
  command reuses that lookup rather than adding a second one.
- **Row counts are non-negative integers** returned by the repository primitives; TypeORM's
  `update`/`delete` return values are the source of the `seeded` and `suppressed` figures, so
  there is no arithmetic that could drift from what was actually written.
- **`broadcasted` is only ever written as a boolean**; no third state is introduced.
- **Recipient**: a non-empty channel snowflake supplied by the interaction; it is never read from
  configuration and never derived from `subscription`.

## Relationships

```text
PlatformDefinition (registry)
   └── PlatformRuntime  ── GenericPlatform
          ├── PlatformApi      fetch()
          ├── PlatformMapper   toGame()
          ├── PlatformRepository  saveAll / findPending / markBroadcasted
          │                        └── + findDevCandidate / markBroadcastedExcept
          │                            + markPending / clear / markAllBroadcasted
          └── BroadcastPort    send(message, game, platform, recipient?)

CommandScopeService ──(reads)── ConfigService(TEST_GUILD_ID, NODE_ENV)
                 └──(writes)── Necord SlashCommandsService registry  [in-memory only]

DevCommands ──(resolves)── PLATFORM_REGISTRY ──► PlatformRuntime.reset() | devBroadcast()
                                └──(supplies recipient)── BroadcastPort.send(…, recipient)
```

No relationship added by this feature crosses a module that did not already exist; `DevCommands`
sits in `AdminModule` beside `AdminCommands` and depends on the same `PlatformsModule` and
`BroadcastModule`.
