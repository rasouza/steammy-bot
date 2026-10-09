# Contracts: Guild-Scoped Dev Smoke Commands

**Feature**: `specs/006-dev-smoke-commands` | **Date**: 2026-10-02

Five contracts are introduced or amended. §1 and §2 are new; §3 amends an existing interface from
`specs/003-easy-add-platform/contracts/platform-contracts.md`; §4 and §5 amend existing behaviour.
Signatures are the interface shape the implementation must satisfy — bodies are deliberately absent.

---

## §1 Command surface and registration contract

The set of commands Discord is told about is decided once, before login, by
`CommandScopeService` (`onModuleInit`). It is a pure function of `TEST_GUILD_ID` and `NODE_ENV`.

| Root command                                         | Subcommands         | `TEST_GUILD_ID` unset          | set + `NODE_ENV=development`                    | set + any other `NODE_ENV`     |
| ---------------------------------------------------- | ------------------- | ------------------------------ | ----------------------------------------------- | ------------------------------ |
| `sync`                                               | —                   | removed                        | guild-scoped                                    | guild-scoped                   |
| `broadcast`                                          | —                   | removed                        | guild-scoped                                    | guild-scoped                   |
| `dev`                                                | `sync`, `broadcast` | removed                        | guild-scoped                                    | **removed**                    |
| `ping`, `invite`, `help`, `subscribe`, `unsubscribe` | —                   | registered globally, unchanged | guild-scoped (existing `development` behaviour) | registered globally, unchanged |

**Guarantees**

- **G1 (FR-001/FR-013)**: `sync`, `broadcast` and `dev` are never registered globally in any run
  mode. Their `guilds` is exactly `[TEST_GUILD_ID]` whenever they exist.
- **G2 (FR-002/FR-003)**: with no test guild the three roots are removed and the application still
  starts; global registration of the other five commands is unaffected.
- **G3 (FR-014)**: `dev` is absent from a deployed run even when the test guild is configured and
  the bot is a member of it.
- **G4 (FR-004)**: `dev` carries `defaultMemberPermissions: Administrator` and `dmPermission: false`
  on its root, so both subcommands are refused by Discord before any handler runs, and are
  unavailable in DMs. `sync`/`broadcast` keep the identical metadata they already have.
- **G5 (ordering)**: the registry is populated before the hook runs, and the hook runs before
  `client.login()` and therefore before registration. A regression here fails open (commands
  scoping silently skipped), which is why §5 includes a test for it.

**Not in this contract**: application command _propagation_. Moving `sync`/`broadcast` from global
to guild scope leaves stale global copies until the next production boot overwrites the global set
with the five still-global commands; Discord caches command lists for up to about an hour
(research R8).

---

## §2 Platform scope decision (pure function)

```ts
type CommandScope = { kind: 'removed' } | { kind: 'guild'; guilds: [string] };

function selectCommandScope(
  rootName: 'sync' | 'broadcast' | 'dev',
  testGuildId: string | undefined,
  nodeEnv: string | undefined,
): CommandScope;
```

- `testGuildId` falsy → `{ kind: 'removed' }` for all three roots.
- `nodeEnv !== 'development'` and `rootName === 'dev'` → `{ kind: 'removed' }`.
- otherwise → `{ kind: 'guild', guilds: [testGuildId] }`.

`undefined` is never treated as `development`; the absence of `NODE_ENV` must not widen anything
(`envSchema` gives it no default on purpose).

---

## §3 `PlatformRepository` extension

Amends `PlatformRepository<TGame>` in `src/modules/platforms/platform.types.ts`. The three existing
members keep their signatures and their meanings.

```ts
export interface PlatformRepository<TGame> {
  // existing — unchanged
  saveAll(games: TGame[]): Promise<void>;
  findPending(now: Date): Promise<TGame[]>;
  markBroadcasted(game: TGame): Promise<void>;

  // added by this feature
  /** One row this platform would allow announcing, `broadcasted` ignored,
   *  ordered by primary key ascending. `null` when nothing qualifies. */
  findDevCandidate(now: Date): Promise<TGame | null>;

  /** Marks every row matching this platform's pending criteria except
   *  `candidate` as announced. Returns how many rows it suppressed. */
  markBroadcastedExcept(candidate: TGame, now: Date): Promise<number>;

  /** Sets `broadcasted = false` for exactly one row. Idempotent. */
  markPending(game: TGame): Promise<void>;

  /** Deletes every row in this platform's catalog. */
  clear(): Promise<void>;

  /** Sets `broadcasted = true` for every row in this platform's catalog.
   *  Returns the number of rows affected. */
  markAllBroadcasted(): Promise<number>;
}
```

**Rules**

- **R-3.1**: eligibility stays inside the platform. `markBroadcastedExcept` uses the same criteria
  function `findPending` uses (`epicPendingCriteria`, `xboxPendingCriteria`); generic code never
  reconstructs it (Principle I). `findDevCandidate` is the deliberate exception: it uses an **empty**
  criteria, because `/dev broadcast` must deliver exactly one message per platform on demand and a
  free offer that has not opened yet is still a real game. The announcement window therefore governs
  only the scheduled pass and `/broadcast`, which reach rows through `findPending`. An empty
  catalog — not an out-of-window row — is now the sole reason a platform reports skipped.
- **R-3.2**: no raw SQL — every member is implemented with the injected TypeORM `Repository` of
  that platform's own entity.
- **R-3.3**: `clear()` and `markAllBroadcasted()` do not take `now`; they are unconditional
  whole-catalog operations and are used only by the dev reset.
- **R-3.4**: adding a platform must require implementing these five alongside the existing three,
  with no edit to generic code — the "Do Not Over-Abstract" bar means no shared base class until a
  third platform makes duplication actually hurt.

---

## §4 `PlatformRuntime` extension and the shared send

```ts
export interface PlatformRuntime {
  readonly type: string;
  sync(): Promise<void>; // unchanged
  broadcastPending(): Promise<number>; // unchanged

  /** Dev reset: fetch → (fail ⇒ nothing written) → clear → save → mark all announced. */
  reset(): Promise<{ fetched: number; seeded: number }>;

  /** Dev smoke: one delivery per platform into `recipient`, surplus suppressed. */
  devBroadcast(recipient: string): Promise<{
    delivered: number;
    suppressed: number;
    skipped: boolean;
  }>;
}
```

```ts
export interface BroadcastPort<TGame> {
  send(
    message: string,
    game: TGame,
    platform: string,
    recipient?: string, // ← added
  ): Promise<SendOutcome>;
}
```

**Rules**

- **R-4.1 (FR-012)**: `recipient` is an _input_ to the single send, not a second sender. When it is
  present, `send` fetches exactly that channel and performs **no** `subscription` query; when it is
  absent, behaviour is identical to today.
- **R-4.2 (FR-016)**: `devBroadcast` is the only caller that passes `recipient`. The scheduled pass
  and `/broadcast` never do.
- **R-4.3 (Principle II)**: `broadcastPending` keeps marking only after
  `delivered > 0 || subscribers === 0`. With an explicit recipient `subscribers` is the number of
  recipients given (1), so a failed dev delivery leaves the row pending and never masquerades as
  "no subscribers ⇒ success".
- **R-4.4 (FR-010)**: `reset()` performs no write before `fetch()` has resolved; a rejection
  propagates with the catalog untouched.
- **R-4.5 (FR-006/FR-009)**: `reset()` and `devBroadcast()` are the only paths that mark rows
  announced without a delivery, and both return the count so the caller can satisfy FR-015.

---

## §5 Interaction (reply) contract

Applies to `/dev sync` and `/dev broadcast`.

| Moment                     | Obligation                                                                                                                                                            |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Entry                      | `deferReply({ flags: Ephemeral })` — this is the acknowledgement that must happen inside Discord's roughly three-second window. No work is done before it.            |
| Success                    | `editReply` with: platform name, outcome (`seeded` / `delivered`), and — whenever rows were marked announced without being delivered — an explicit suppression count. |
| Per-platform skip (FR-007) | reported as skipped with `0` delivered; the invocation still succeeds.                                                                                                |
| Failure                    | `editReply` with the failure; no partial success is reported as success.                                                                                              |

**Rules**

- **R-5.1 (FR-015 / SC-009)**: a suppression that is not stated in the reply is a contract
  violation — the reply is the only place the carve-out's condition can be observed.
- **R-5.2 (FR-017 / SC-011)**: `editReply` is the _only_ second response; there is no
  `interaction.reply()` after the fact, so no invocation can surface Discord's "application did not
  respond".
- **R-5.3**: the reply is ephemeral and appears in the invocation channel; the _messages_ emitted by
  `/dev broadcast` are non-ephemeral and appear in that same channel and nowhere else (FR-016 /
  SC-010).

---

## Verification map

| Contract               | Verified by                                                                                |
| ---------------------- | ------------------------------------------------------------------------------------------ |
| §1 / G1–G4             | `selectCommandScope` unit table + `test/command-scope.e2e-spec.ts` registry assertions     |
| §1 / G5                | e2e assertion that the registry is populated when the hook runs                            |
| §2                     | direct unit table over the 3 roots × 3 env states                                          |
| §3                     | per-platform unit specs for each of the five primitives                                    |
| §4 / R-4.1–R-4.3       | `broadcast.service` unit spec with the subscription repository stubbed to throw if queried |
| §4 / R-4.4             | `generic-platform` unit spec: fetch rejects ⇒ `clear` never called                         |
| §4 / R-4.5, §5 / R-5.1 | `dev.commands` unit spec asserting the reply text contains the count                       |
| §5 / R-5.2, R-5.3      | `dev.commands` unit spec asserting `deferReply` precedes any awaited work                  |
| end-to-end             | `quickstart.md` scenarios S1–S8                                                            |
