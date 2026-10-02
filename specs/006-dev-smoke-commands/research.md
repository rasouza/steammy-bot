# Phase 0 Research: Guild-Scoped Dev Smoke Commands

**Feature**: `specs/006-dev-smoke-commands` | **Branch**: `STE-185-006-dev-smoke-commands`
**Date**: 2026-10-02

All unknowns carried out of the plan's Technical Context are resolved here. Each entry records the
decision, why it was taken, and the alternatives that were considered and rejected.

---

## R1 — How to gate command registration on guild and run mode

**Unknown**: FR-001, FR-002, FR-013 and FR-014 require four different outcomes from _registration_
(not from the handler): offered only in the test guild, offered nowhere when no test guild is
configured, the admin pair scoped in every run mode, and the dev pair absent from a deployed run.
What mechanism produces those four outcomes?

**Decision**: a new `CommandScopeService` (`src/modules/bot/command-scope.service.ts`) implementing
`onModuleInit`, which reads `TEST_GUILD_ID` and `NODE_ENV` through `ConfigService` and then edits
Necord's own command registry with the two public methods Necord itself uses:

- no `TEST_GUILD_ID` → `slashCommands.remove(name)` for `sync`, `broadcast`, `dev`
- `TEST_GUILD_ID` set → `slashCommands.get(name).setGuilds([testGuildId])` for those same roots
- `NODE_ENV !== 'development'` → additionally `slashCommands.remove('dev')`

The service is provided by `BotModule`. `NecordModule`'s existing
`development: isDev && testGuildId ? [testGuildId] : false` is left untouched.

**Rationale** — three facts make `onModuleInit` the correct and deterministic place:

1. **The environment is available there.** `ConfigModule.forRoot()` runs during `app.module.ts`
   evaluation and assigns the parsed `.env` into `process.env` (`assignVariablesToProcess`), long
   before any lifecycle hook. So `ConfigService.get` returns `.env`-sourced values in
   `onModuleInit` — unlike a module decorator, which runs _before_ `ConfigModule.forRoot()`.
2. **Necord's cache is already populated.** `getModulesToTriggerHooksOn()` sorts modules by
   `distance` **descending** (`(a, b) => b.distance - a.distance`), so `SlashCommandsModule` —
   imported four levels below `AppModule` — runs its `onModuleInit` (which calls
   `explore(SlashCommand.KEY).forEach(add)`) before any distance-1 module such as `BotModule`.
   Removing from an unpopulated cache would silently no-op; the sort guarantees it is populated.
3. **Nothing has logged in yet.** `callInitHook()` completes entirely before `callBootstrapHook()`
   starts (`initializationPromise = this.callInitHook().then(() => this.callBootstrapHook())`), and
   `client.login()` lives in `NecordModule.onApplicationBootstrap`. Registration itself only
   happens on the later `clientReady` event. So pruning in `onModuleInit` can never race
   registration.

`setGuilds` on a discovery object is the same API `CommandsModule.onApplicationBootstrap` uses to
apply `development`, so the mechanism is one Necord already relies on — not a private field.

**Alternatives considered**:

- _Read `process.env` / `TEST_GUILD_ID` inside the `@SlashCommand` or `@Module` decorator_ —
  rejected: decorators evaluate while `app.module.ts`'s imports are still being evaluated, which is
  **before** `ConfigModule.forRoot()` assigns `.env`. `TEST_GUILD_ID` lives in `.env`, so it would
  read as `undefined`. It also violates the documented split ("the Nest path loads `.env` via
  `ConfigModule`").
- _Read `process.env.NODE_ENV` at import time_ — rejected: `.env.example` and README both tell
  developers to keep `NODE_ENV=development` **in `.env`**, so an import-time read would see
  `undefined` and silently hide the dev commands for anyone not going through `start:dev`'s
  `cross-env`. It fails closed, which is the safe direction, but it fails _incorrectly_ and
  diverges from `bot.module.ts`, which already reads `NODE_ENV` through `ConfigService`.
- _Conditional `providers` (`...(isDev ? [DevCommands] : [])`)_ — rejected: same import-time
  problem, and it hides a configuration mistake instead of reporting it.
- _`skipRegistration: true` plus hand-rolled `application.commands.set(...)`_ — rejected: it would
  duplicate ~40 lines of Necord's registration logic and contradict the repo convention that there
  is no manual slash-command registration. It was only being considered to purge stale global
  commands, which R8 shows happens on its own.
- _Runtime pruning inside a `clientReady` handler_ — rejected: ordering against Necord's own
  `client.once('clientReady', registerAllCommands)` is not guaranteed, so the commands could be
  registered and then removed, leaving a propagation window in which FR-001/FR-014 are violated.

---

## R2 — Shape of the `/dev` commands and what "exactly 4" counts

**Unknown**: the spec writes `/dev sync <platform>` and `/dev broadcast` and SC-001 counts "exactly
4" discoverable commands. Is that one root command with subcommands or two roots?

**Decision**: one root command `dev` carrying two subcommands (`sync`, `broadcast`),
`@SlashCommand({ name: 'dev', defaultMemberPermissions: Administrator, dmPermission: false })`.
The command scope hook works on root names, so the three roots it touches are `sync`, `broadcast`,
`dev`. SC-001's "4" counts **invocable commands** — the root commands plus subcommands — which is
what a human reading the guild's command list sees.

**Rationale**: Discord renders a root command with a subcommand as `/dev sync`, exactly the syntax
the spec and the original user description use. Permission and DM metadata live on the root, so
FR-004 is satisfied for both subcommands at once, and removing the single `dev` root removes both
subcommands in one call (FR-014).

**Alternatives considered**:

- _Two root commands `dev-sync` / `dev-broadcast`_ — rejected: Discord forbids spaces in root names,
  so the surface would read `/dev-sync`, not the `/dev sync` the spec requires.
- _A command group (`/dev <group> <sub>`)_ — rejected: an extra nesting level adds nothing, since
  only two subcommands exist and no grouping distinction is needed.
- _Counting root entries for SC-001 (3 in a dev run, not 4)_ — rejected: it would make SC-001
  self-contradictory, because the deployed count of 2 is unambiguous. The invocable-command reading
  makes all three figures (0 / 4 / 2) consistent.

---

## R3 — Where the invocation-channel send lives

**Unknown** (Clarification 3 of the spec): FR-016 requires `/dev broadcast` to post to the
invocation channel without reading subscriptions, while FR-012 forbids a second delivery path.

**Decision**: `BroadcastService.send(message, game, platform, recipient?)`. When `recipient` is
supplied the method fetches exactly that channel, skips the `subscriptionRepository.find` entirely,
and returns `{ delivered, subscribers: <recipient count> }`. When it is absent, behaviour is byte
for byte what it is today.

**Rationale**: recipient resolution becomes an _input_ to the one send rather than a fork around
it — one send implementation, one embed, one mark-after-ack. `GenericPlatform.broadcastPending`
marks a row when `delivered > 0 || subscribers === 0`; with an explicit recipient and a reachable
channel the pair is `{1, 1}` (marks) and with an unreachable channel `{0, 1}` (leaves pending), so
Principle II's ordering is preserved without a special case. Because `subscribers` is non-zero, an
undeliverable dev run can never be mistaken for "nobody subscribes, treat as success".

**Alternatives considered**:

- _A separate dev sender_ — rejected: two send implementations drift, and the embed would be built
  twice. The spec explicitly supersedes the earlier preference for leaving `BroadcastService`
  untouched (Clarification 3).
- _Posting from the command handler outside the pipeline_ — rejected: it would be exactly the
  "branch that bypasses the production pipeline" FR-012 forbids, and it would lose the
  mark-after-ack rule.
- _Creating a temporary subscription row for the invocation channel_ — rejected: FR-016 forbids
  consulting subscription rows, and writing one would leave durable state behind a smoke test.

---

## R4 — How the new catalog primitives are exposed

**Unknown**: `/dev sync` must delete rows and mark a whole platform announced; `/dev broadcast`
must pick one row, suppress the rest, and flip one back. How do these reach `GenericPlatform`?

**Decision**: extend the `PlatformRepository<TGame>` interface with five primitives and implement
each one in both platform repositories, reusing the existing per-platform pending criteria:

| Primitive                               | Purpose                                                                                                                 |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `findDevCandidate(now)`                 | one deterministic row to deliver — platform eligibility with `broadcasted` ignored, ordered by primary key ascending    |
| `markBroadcastedExcept(candidate, now)` | mark every row matching the platform's pending criteria except `candidate` as announced; returns how many it suppressed |
| `markPending(game)`                     | set `broadcasted = false` for one row                                                                                   |
| `clear()`                               | delete every row in this platform's catalog                                                                             |
| `markAllBroadcasted()`                  | set `broadcasted = true` for every row in the catalog; returns the count                                                |

**Rationale**: the spec's decision was to extend `PlatformRepository` rather than use raw SQL, and
the interface is already the seam for "persistence + eligibility". `findDevCandidate` and
`markBroadcastedExcept` must live in the repository because eligibility is platform-specific —
Epic's offer-window criteria (`epicPendingCriteria`) decides what may be announced, and generic
code must never reconstruct it (Principle I / FR-005). `clear` and `markAllBroadcasted` are
platform-specific only because each platform owns its TypeORM entity.

**Alternatives considered**:

- _Raw SQL / a shared `Repository<Game>`_ — rejected: there is no shared game table; `catalog_epic`
  and `catalog_xbox` are separate entities, and the spec forbids bypassing the repository.
- _A shared abstract base class implementing the mechanical three_ — rejected under "Do Not
  Over-Abstract": it saves ~8 duplicated lines per platform while introducing an inheritance axis
  that nothing else needs. Both repositories already duplicate `saveAll`/`findPending`/
  `markBroadcasted` for the same reason.
- _One `prepareDevBroadcast(now)` call doing pick + suppress inside the repository_ — rejected: it
  would move the delivery-before-state ordering decision into a persistence object. Keeping pick
  and suppress as separate calls leaves `GenericPlatform` in control of the sequence, which is
  where Principle II expects it to live.
- _A `findAll()` plus selection in generic code_ — rejected: it pulls the whole catalog into memory
  to choose one row and re-implements ordering outside the platform's own rules.

---

## R5 — Ordering of a `/dev sync` reset

**Unknown**: the user description says "clears all the games … reuses the sync command to insert",
but FR-010 requires fetch-before-clear so a failed storefront request removes nothing.

**Decision**: `GenericPlatform.reset()` performs `fetch → map → (on throw: abort, nothing written)
→ clear → saveAll → markAllBroadcasted`, returning `{ fetched, seeded }`. The `fetch → map →
saveAll` steps are the same ones `sync()` already performs, factored into one private loader so the
two paths cannot diverge.

**Rationale**: FR-010 makes the ordering a requirement rather than a preference — a literal
clear-then-insert would empty a platform's catalog on every storefront outage (US3 scenario 3 /
SC-005). `clear()` runs even when the fetch returns zero rows, because a successful empty response
means the catalog genuinely is empty; only a _failed_ fetch preserves the old rows.

**Alternatives considered**:

- _Clear first, then insert_ — rejected: this is the literal reading the spec explicitly overrides
  (Assumptions, decided 2026-10-02).
- _Upsert-without-clear, then delete rows absent from the response_ — rejected: it needs a
  "delete the difference" primitive that is harder to reason about than `clear()`, and it would
  still have to run before the insert to be correct.
- _Reuse `sync()` with a boolean flag_ — rejected: a `replace?: boolean` parameter on the
  production path makes the risky branch part of the scheduler's call site, which is precisely the
  "test-only branch" the Assumptions section rules out.

---

## R6 — Which row `/dev broadcast` picks, and what gets suppressed

**Unknown**: the Assumptions say the row is "chosen deterministically" but do not say how, and
FR-005 caps delivery at one message per platform.

**Decision**: per platform —

1. `candidate = findDevCandidate(now)`; if `null`, the platform contributes nothing and is
   reported as skipped (FR-007).
2. `suppressed = markBroadcastedExcept(candidate, now)` — the surplus pending rows.
3. `markPending(candidate)` — idempotent when the candidate was already pending, and the flip that
   makes a fully-announced catalog deliverable again.
4. `broadcastPending({ recipient })` — the normal loop, which now sees exactly one pending row.

Determinism is **ascending primary key** (`id`), so consecutive runs against an unchanged catalog
pick the same row, and SC-002's five consecutive runs behave identically (FR-006).

**Rationale**: step 3 is unconditional so the sequence has one shape instead of two — when the
candidate was already pending it is a no-op, and when the catalog was fully announced it is what
makes a delivery possible at all, which SC-002's "never zero-and-stuck" requires. The suppression
count returned by step 2 is the number FR-015 obliges the reply to state, covering the surplus on
`/dev broadcast`; `markAllBroadcasted()`'s count plays the same role for `/dev sync`.

**Eligibility note**: `findDevCandidate` applies the platform's own criteria with `broadcasted`
ignored, so an expired Epic offer is never re-announced just to satisfy a count. SC-002's phrase
"a platform that has catalog rows" is therefore read as "a platform with at least one row its own
eligibility rules would allow announcing"; a platform holding only ineligible rows reports zero
delivered and is not stuck — a later run against a refreshed catalog recovers. This is a
consequence of Principle I (generic code must not decide eligibility), not a relaxation of FR-005,
and it is recorded as an outstanding interpretation in the completion report rather than as a
clarification, because the clarify budget was spent.

**Alternatives considered**:

- _Pick the most recently created row_ — rejected: `created_at` is stable but `id` ordering needs
  no extra index, no tie-breaking rule, and is already how upserts key the table.
- _Pick randomly_ — rejected: not deterministic, so two consecutive runs could show different
  games and SC-002 could not be asserted.
- _Deliver whatever `findPending` returns and mark the rest afterwards_ — rejected: FR-005 caps
  delivery at one per platform; suppressing after sending would deliver N messages first.
- _Let the operator name the game_ — rejected: out of scope per the Assumptions.

---

## R7 — Acknowledging the interaction before the work finishes

**Unknown** (Clarification 5): acknowledge-and-update, or reply once finished?

**Decision**: both dev commands `deferReply()` on entry and `editReply()` when the work completes,
matching the shape `/sync` and `/broadcast` already use. The reply is ephemeral, as the admin
commands' replies are.

**Rationale**: `deferReply()` _is_ the acknowledgement Discord requires inside its roughly
three-second window, so FR-017/SC-011 are satisfied by the existing idiom rather than by new
machinery — and it is uniform across both commands, so there is no fast-path/slow-path divergence
to test. `/dev sync` waits on live storefront APIs, so a reply-when-done handler would surface
"The application did not respond" instead of a result.

**Alternatives considered**:

- _Reply only when finished_ — rejected: it is the exact failure SC-011 counts at zero.
- _Split by command (defer only `/dev sync`)_ — rejected: `/dev broadcast` posts N messages and
  would eventually exceed the window too; the spec's answer was explicitly uniform.

---

## R8 — Stale global commands after moving `sync`/`broadcast` into a guild

**Unknown**: today `development` is `false` in production, so `/sync` and `/broadcast` are
registered **globally**. FR-013 moves them into the test guild. Does anything remove the old
global copies? SC-001 requires exactly 0 in every other guild.

**Decision**: nothing extra is needed — Necord purges them on the next boot by overwrite, and the
quickstart documents the propagation delay.

**Rationale**: `registerAllCommands()` runs `registerGlobalCommands()` and the per-guild
registrations together. `registerGlobalCommands()` calls `application.commands.set(rawCommands)`
whenever at least one command is still global, and this application has five that always are:
`ping`, `invite`, `help`, `subscribe`, `unsubscribe`. That call replaces the whole global set, so
the previously-global `sync`/`broadcast`/`dev` drop out automatically. Only the guild-scoped copies
are added. Discord propagates command-list changes within about an hour for anything a client has
already cached.

Two consequences are recorded rather than engineered around:

- In a local development run `development: [testGuildId]` makes _every_ command guild-scoped, so
  `registerGlobalCommands()` finds none and returns early without writing. Stale globals are
  therefore only purged by a production boot — which is the boot that created them, so this is the
  correct pairing.
- The quickstart instructs the operator to wait for propagation (or refresh the client) before
  asserting SC-001 in another guild.

**Alternatives considered**:

- _An explicit `application.commands.set([])` from our own `clientReady` listener_ — rejected: it
  would delete `ping`/`invite`/`help`/`subscribe`/`unsubscribe` too, and it races Necord's own
  listener for no benefit.
- _A one-time documented purge script_ — rejected: SC-001 would fail on any deployment where the
  operator forgot to run it, and the automatic overwrite already does the job.
- _`skipRegistration` + full manual registration_ — rejected for the same reasons as R1; the only
  thing it would add beyond the automatic purge is control that is already achieved.

---

## R9 — Whether any migration is required

**Unknown**: five new repository primitives and two new lifecycle methods touch persistence.

**Decision**: **no migration, no schema change, no new entity.** The feature only writes the
existing `broadcasted` boolean and deletes rows already inside the platform's catalog.

**Rationale**: `clear()`, `markAllBroadcasted()`, `markPending()` and `markBroadcastedExcept()`
all operate on columns that exist (`catalog_epic.broadcasted`, `catalog_xbox.broadcasted`,
the `id` keys), and `saveAll` keeps using the existing upsert. Principle III is satisfied vacuously
— there is nothing to review — and no entity registration in `entities/index.ts` or
`data-source-options.ts` changes.

**Alternatives considered**: none were viable; introducing a column (for example a
`suppressed_at` audit field) would be scope creep the spec does not ask for, and the suppression
count is reported in the reply rather than persisted.

---

## R10 — How the registration scope is tested

**Unknown**: registration happens inside Necord against a live Discord application, but the suite
must never need a Discord token.

**Decision**: split the decision from the effect.

- The _decision_ is a pure function of two strings — `selectCommandScope(name, testGuildId,
nodeEnv) → 'remove' | { guilds: [...] }` — exported from the scope service module and unit-tested
  directly with all combinations (no guild / guild + dev / guild + prod, for each of the three
  roots).
- The _effect_ is verified by an e2e spec whose testing module includes the **real**
  `SlashCommandsModule` alongside the scope service, so cache population and the hook run under
  Nest's genuine lifecycle ordering. After `init()` it asserts on the registry: `get('dev')`
  undefined in production, `getGuilds()` equal to `[testGuildId]` for `sync`/`broadcast` in every
  run mode, and nothing present when `TEST_GUILD_ID` is unset. A fake `Client` is provided from a
  `@Global()` test module, mirroring how Necord provides the real one — no Discord token is needed.
- **The ordering assertion (G5) is the important one**: including `SlashCommandsModule` in the
  graph means a regression that moved the hook earlier than cache population would surface as a
  command left global, rather than passing silently.

**Rationale**: Principle V forbids a Nest testing module in unit specs, so the decision function
must be extractable; and an ordering bug would pass any test that only checked the decision
function, so one test must exercise the real hook against the real cache.

**Alternatives considered**:

- _Assert against Discord's API_ — rejected: needs a real token and a real guild.
- _Only unit-testing the decision function_ — rejected: it would not detect the
  "cache not yet populated" failure mode, which fails **open** (the command simply stays global).
- _Boot the whole `AppModule`_ — rejected: it drags in the database, the scheduler and a real
  gateway; the ordering property is fully determined by `SlashCommandsModule` plus the hook, so a
  focused graph tests exactly that and nothing more (research R1's "Do Not Over-Abstract" bar).

---

## R11 — Sequencing of the Principle II amendment

**Unknown**: FR-006 and FR-009 mark rows announced without delivering, which Principle II forbids
as written; Clarification 4 ratified a **MAJOR** amendment (3.1.2 → 4.0.0).

**Decision**: the amendment is Task 0 and must be merged **before** any code from this feature.

**Rationale**: the constitution's amendment procedure says amendments take effect on merge, and
compliance review explicitly checks "no `broadcasted` flag is persisted before a successful send".
Landing FR-006/FR-009 first would put a knowingly non-compliant change in front of a reviewer and
fail the check; landing the amendment first makes those two requirements compliant as written and
keeps the carve-out's condition (FR-015's suppression report) in the same review. The amendment is
MAJOR, so it also needs the explicit sign-off the constitution already records.

**Alternatives considered**:

- _Ship both in one commit_ — rejected: Principle II's own governance says a MAJOR amendment
  needs explicit sign-off and must not be silently bundled; the spec and the amendment are two
  logical changes and the repo's commit rule requires one logical change per commit.
- _Weaken FR-006/FR-009 instead_ — rejected: the maintainer chose the carve-out (Clarification 1).
