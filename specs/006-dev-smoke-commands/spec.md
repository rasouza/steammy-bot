# Feature Specification: Guild-Scoped Dev Smoke Commands

**Feature Branch**: `006-dev-smoke-commands`

**Created**: 2026-10-02

**Status**: Draft (clarified 2026-10-02 — two draft-time questions plus five in the `/speckit.clarify` session, all resolved; see Clarifications and Assumptions)

**Input**: User description: "Add `/dev broadcast` and `/dev sync <platform>` slash commands so the sync and broadcast pipelines can be exercised by hand in the test guild. `/dev broadcast` picks one game per platform, turns `broadcasted` back to false, and then reuses the broadcast command to broadcast to TEST_GUILD_ID only. `/dev sync <PLATFORM>` reuses the registered platforms, clears all the games in the catalog for that platform, reuses the sync command to insert the records, and marks all games as broadcasted after the sync so we prevent flooding channels. These `/dev` commands can only be run in TEST_GUILD_ID alongside the admin commands."

## Clarifications

### Session 2026-10-02

- Q: Both dev commands must make rows non-pending without ever sending a
  message — `/dev sync` seeds a freshly fetched catalog as announced, and
  `/dev broadcast` suppresses surplus pending rows so that exactly one is
  delivered per platform — while Principle II forbids persisting the
  `broadcasted` flag before a successful send. Amend the constitution to
  permit that, or adjust the commands to stay inside the rule? →
  **A: Amend Principle II.** Add a narrow carve-out: an operator-invoked dev
  reset may mark rows announced without a send, **provided its reply reports
  how many it suppressed**. FR-006 and FR-009 stand unchanged; the reporting
  condition is imposed as FR-015. The bump type was settled separately
  below, and this spec depends on that amendment landing (see Assumptions).
- Q: SC-002 requires `/dev broadcast` to deliver exactly one message per
  platform, but a freshly created development database has no subscription
  rows — what should the command do when nothing is subscribed? →
  **A: It never consults subscriptions.** `/dev broadcast` posts to the
  channel the developer typed the command in, and that is safe precisely
  because the command only registers under `TEST_GUILD_ID` (FR-001) and only
  during local development runs (FR-014) — so the invocation channel is
  necessarily inside the test guild. **No subscription row may be used to
  choose a recipient.** This supersedes the earlier
  development-database-isolation reading: confinement now comes from the
  invocation channel, not from which channels happen to be subscribed.
  Imposed as FR-016.
- Q: FR-016 requires `/dev broadcast` to post to the invocation channel
  without reading subscriptions, while FR-012 forbids any branch that
  bypasses the production pipeline — where should that invocation-channel
  send live? → **A: Inside the existing send, as an input.** The single
  broadcast send gains an optional recipient that the dev command supplies;
  recipient resolution becomes an input rather than a fork around the send.
  One send implementation, one embed, mark-after-ack unchanged — so the
  earlier preference for leaving `BroadcastService` untouched is superseded
  in letter while being honoured in substance: its ordering is not altered,
  and no second sender exists to drift out of step. FR-012 is reworded to
  say so.
- Q: Should the Principle II carve-out be ratified as a MAJOR, MINOR, or
  PATCH amendment to the constitution? → **A: MAJOR** (3.1.2 → 4.0.0). The
  versioning policy treats "relaxing one of the non-negotiable rules" as
  MAJOR, and this carve-out relaxes a MUST-level rule that compliance review
  enforces, so it takes the heavier path and the explicit maintainer
  sign-off that goes with it.
- Q: Should the dev commands acknowledge the interaction immediately and
  update that same reply once the work finishes, or reply only when the work
  has finished? → **A: Acknowledge immediately, then update the same reply.**
  Uniform for both commands, so there is no fast-path/slow-path divergence to
  test, and it stays correct however long the storefront takes or how many
  platforms are configured. Imposed as FR-017.

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Administrative commands live only in the test guild (Priority: P1)

An operator opens the application command list in any guild the bot has
joined and sees the administrative commands (`/sync`, `/broadcast`) and the
dev commands (`/dev sync`, `/dev broadcast`) **only** in the designated test
guild. Every other guild sees none of them.

**Why this priority**: Today `/sync` and `/broadcast` are offered in every
guild the bot has joined, so any guild Administrator can trigger a catalog
synchronisation or a broadcast that fans out to _all_ subscriber guilds.
Closing that exposure stands on its own value, and it is also the
prerequisite for introducing the `/dev` commands at all — a command capable
of clearing a platform's catalog must never be reachable outside the test
guild.

**Independent Test**: Join a second guild with the bot, open its command
list, and confirm none of the four commands appear; then run the bot in
local development mode, open the test guild's list, and confirm all four
appear and are runnable by an Administrator.

**Acceptance Scenarios**:

1. **Given** the bot has joined a guild other than the test guild, **When**
   a user opens the application command list there, **Then** none of
   `/sync`, `/broadcast`, `/dev sync`, `/dev broadcast` are listed.
2. **Given** the test guild and a local development run, **When** an
   Administrator opens the command list, **Then** all four commands are
   listed and invoking any of them reaches the handler.
3. **Given** a non-Administrator member of the test guild, **When** they
   attempt any of the four commands, **Then** the invocation is refused by
   the platform before any handler runs.
4. **Given** no test guild is configured, **When** the bot starts, **Then**
   none of the four commands are offered in any guild — an absent setting
   must never widen the exposure.
5. **Given** a test guild is configured but the bot is not a member of it,
   **When** the bot starts, **Then** startup succeeds normally and the
   commands are simply not offered anywhere.
6. **Given** the test guild and a **deployed** run, **When** an
   Administrator opens the command list, **Then** `/sync` and `/broadcast`
   are listed while `/dev sync` and `/dev broadcast` are absent — the
   catalog-clearing command never ships to production, even though the
   guild gate would otherwise let it through.
7. **Given** an invocation of one of these commands arrives in a guild
   other than the test guild — for example from a registration that has not
   yet propagated away — **When** the handler is reached, **Then** it is
   refused with no catalog state changed and no message delivered.

---

### User Story 2 - One real message per platform, on demand (Priority: P2)

An operator in the test guild runs `/dev broadcast` and, moments later, sees
exactly one freshly-constructed message per platform land in that same
channel — produced by the real delivery pipeline, not a mock or a preview.
Running it again behaves identically.

**Why this priority**: This is the payoff of the feature — the embed, the
rendering, and the delivery path can be eyeballed in a real guild on demand
instead of waiting for a scheduled pass. It ranks below story 1 because
running it outside the test guild would be unsafe.

**Independent Test**: With a non-empty catalog for at least one platform,
run `/dev broadcast` in the test guild and count the messages that arrive:
exactly one per platform, on every consecutive run.

**Acceptance Scenarios**:

1. **Given** a platform's catalog holds several already-announced games,
   **When** `/dev broadcast` runs, **Then** exactly one message is delivered
   for that platform and every other row stays announced.
2. **Given** two registered platforms both hold catalog rows, **When**
   `/dev broadcast` runs, **Then** exactly one message is delivered per
   platform.
3. **Given** a platform's catalog is empty, **When** `/dev broadcast` runs,
   **Then** that platform contributes no message and the command reports it
   as skipped rather than failing the whole invocation.
4. **Given** a successful run, **When** the operator inspects the catalog
   afterwards, **Then** every row is in the announced state — so a second
   run behaves exactly like the first.
5. **Given** the command is run from a channel inside the test guild,
   **When** `/dev broadcast` runs, **Then** the messages appear in that
   channel and in no other — regardless of which channels are subscribed, or
   whether any are subscribed at all.
6. **Given** a run that marks rows announced without delivering them —
   surplus pending rows on `/dev broadcast`, or a freshly seeded catalog on
   `/dev sync` — **When** the reply is shown, **Then** it states how many
   rows were suppressed, so no row is ever dropped silently.
7. **Given** a run that takes longer than the platform's interaction window,
   **When** `/dev broadcast` is invoked, **Then** the reply is acknowledged
   on invocation and completed when the work ends — never replaced by the
   platform's "application did not respond" error.

---

### User Story 3 - Reset a platform's catalog with scheduled silence (Priority: P3)

An operator runs `/dev sync <platform>` and the platform's catalog becomes a
clean snapshot of what the storefront currently offers, with nothing left
pending — so the scheduled announcement pass has nothing to fire on and the
channels stay quiet until new offers appear.

**Why this priority**: It supplies the deterministic baseline the smoke
checks run against, and it is what makes repeated manual testing safe. It
ranks last only because story 2 can be exercised without it whenever rows
already exist.

**Independent Test**: Seed a platform's catalog with stale rows of mixed
state, run `/dev sync <platform>`, then inspect: only the storefront's
current rows remain, and a subsequent scheduled pass delivers nothing.

**Acceptance Scenarios**:

1. **Given** a platform's catalog holds stale rows, **When**
   `/dev sync <platform>` runs successfully, **Then** afterwards the catalog
   holds exactly the rows the storefront returned and no stale row survives,
   and the reply reports how many rows were seeded as announced without
   being delivered.
2. **Given** the reset completed, **When** the scheduled announcement pass
   next runs, **Then** nothing is announced for that platform.
3. **Given** the storefront request fails, **When** `/dev sync <platform>`
   runs, **Then** the existing catalog is left unchanged — no row is
   removed — and the command reports the failure instead of a reset.
4. **Given** a successful reset, **When** `/dev broadcast` is run
   afterwards, **Then** exactly one message is delivered for that platform.
5. **Given** the storefront request takes several seconds, **When**
   `/dev sync <platform>` is invoked, **Then** the operator sees an
   acknowledgement straight away and the outcome lands in that same reply —
   never the platform's "application did not respond" error.

---

### Edge Cases

- A platform has no catalog rows when `/dev broadcast` runs → the platform
  contributes nothing; the command still succeeds for the others.
- Every platform has an empty catalog → the command reports nothing to
  deliver and exits successfully, not as an error.
- The storefront is unreachable during `/dev sync` → the fetch happens
  before anything is cleared, so the catalog is left exactly as it was and
  the operator is told the run failed.
- The test guild is configured but the bot is not a member → startup must
  not fail; the commands are simply not offered anywhere.
- No test guild configured → none of the four commands are offered anywhere.
- The deployed bot is a member of the test guild → `/sync` and `/broadcast`
  are offered there but `/dev sync` and `/dev broadcast` are not; the
  run-mode gate, not the guild gate, is what keeps the destructive command
  out of production.
- An invocation arrives in a non-test guild (for example from a registration
  that has not yet propagated away) → it must be refused at runtime rather
  than executed, and the refusal must not leak catalog state.
- The command is run from a thread, or from a channel where the bot cannot
  post → that platform's send fails and the reply reports it; the other
  platforms are unaffected.
- The development database holds subscriptions for other guilds → they are
  irrelevant to `/dev broadcast`, which never reads them (FR-016); the
  scheduled pass and admin `/broadcast` still honour them as before.
- The scheduled announcement pass fires while `/dev broadcast` is mid-run →
  worst case the scheduled pass claims the row the command intended to
  deliver; the operator sees zero delivered for that platform and a repeat
  run recovers. No data is lost either way.
- A scheduled synchronisation runs concurrently with `/dev sync` → both
  write through the same upsert path; the final catalog still reflects a
  storefront response.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: The commands `/sync`, `/broadcast`, `/dev sync` and
  `/dev broadcast` MUST be discoverable and invocable **only** in the
  configured test guild, and in no other guild the bot has joined.
- **FR-002**: When no test guild is configured, none of those four commands
  MAY be offered in any guild.
- **FR-003**: Failing to offer the commands (bot not in the test guild, no
  test guild configured) MUST NOT prevent the bot from starting.
- **FR-004**: Whichever of the four commands are offered MUST be restricted
  to guild Administrators and MUST NOT be available in direct messages.
- **FR-005**: `/dev broadcast` MUST deliver at most one message per
  registered platform per invocation, regardless of how many un-announced
  rows exist for that platform.
- **FR-006**: `/dev broadcast` MUST leave the catalog fully announced when
  it completes, so consecutive invocations behave identically.
- **FR-007**: `/dev broadcast` MUST NOT fail when a platform has no eligible
  row; it reports zero delivered for that platform and continues.
- **FR-008**: `/dev sync <platform>` MUST, on success, leave the platform's
  catalog holding exactly the rows the storefront returned — no stale row
  survives a successful run.
- **FR-009**: `/dev sync <platform>` MUST, on success, mark every row for
  that platform announced, so a subsequent scheduled pass delivers nothing
  for it.
- **FR-010**: `/dev sync <platform>` MUST fetch before it clears. When the
  storefront request fails, no row MAY be removed: the catalog stays
  exactly as it was and the command reports the failed run rather than a
  reset.
- **FR-011**: `/dev sync` MUST accept only platforms the bot has registered,
  using the same platform choices already offered by `/sync` and
  `/broadcast`; an unregistered platform MUST be rejected.
- **FR-012**: Both commands MUST reuse the existing synchronisation and
  broadcast pipeline: one send implementation, one embed, and a row marked
  announced only after that send is acknowledged. Recipient resolution is an
  **input** to that single send rather than a fork around it — `/dev
broadcast` supplies the invocation channel (FR-016), while the scheduled
  pass and `/broadcast` supply subscriptions. A second sender, a dry-run or
  preview mode, or any branch that bypasses the production pipeline remains
  forbidden.
- **FR-013**: `/sync` and `/broadcast` MUST be scoped to the test guild in
  every run mode, including deployed runs — the scope must not depend on
  how the process was started.
- **FR-014**: `/dev sync` and `/dev broadcast` MUST be offered during local
  development runs and MUST NOT be offered by a deployed run, even when the
  test guild is configured and the bot is a member of it. `/sync` and
  `/broadcast` are unaffected by this gate (FR-013).
- **FR-015**: Whenever a dev command marks rows announced **without
  delivering them** — `/dev sync` seeding a freshly fetched catalog (FR-009)
  or `/dev broadcast` suppressing surplus pending rows (FR-006) — its reply
  MUST state that count. This is the condition attached to the Principle II
  carve-out the feature depends on (see Clarifications and Assumptions); a
  suppression that goes unreported would be exactly the silent loss that
  Principle II exists to prevent.
- **FR-016**: `/dev broadcast` MUST post its messages to the channel the
  command was invoked from, and MUST NOT consult subscription rows to choose
  a recipient. It supplies that channel as the recipient input to the shared
  send (FR-012) rather than running a sender of its own. The invocation
  channel is always inside the test guild because the command is offered
  only there (FR-001) and only during local development runs (FR-014).
- **FR-017**: Both dev commands MUST acknowledge the interaction as soon as
  they are invoked and update that same reply with the outcome when the work
  completes. They MUST NOT reply only after finishing, which would let the
  platform discard an interaction that went unanswered for its
  roughly-three-second window and show an error instead of a result.

### Key Entities _(include if feature involves data)_

- **Test guild**: the single guild in which administrative and dev commands
  exist. It is a configuration value, not a database record.
- **Platform catalog**: the per-platform set of game rows, each carrying an
  announced/un-announced state. `/dev sync` replaces a platform's catalog
  wholesale; `/dev broadcast` flips a single row per platform back to
  un-announced and then lets the normal pipeline announce it.
- **Registered platform**: the set of platforms the bot knows about; it
  drives the choices both commands offer and bounds what either command can
  act on.
- **Subscription**: the record of a channel that wants platform
  announcements, consulted by the scheduled pass and the admin `/broadcast`.
  It plays no part in `/dev broadcast`, which never reads it to choose a
  recipient (FR-016).
- **Invocation channel**: the channel the operator typed the command in —
  `/dev broadcast`'s only delivery target, and the place its reply appears.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: In any guild other than the test guild, the count of
  discoverable administrative/dev commands is exactly **0**. In the test
  guild it is exactly **4** during a local development run and exactly **2**
  (`/sync`, `/broadcast`) during a deployed run.
- **SC-002**: Across **5 consecutive** `/dev broadcast` invocations, each
  run delivers exactly **1** message per platform that has catalog rows —
  never more, never zero-and-stuck.
- **SC-003**: After a successful `/dev sync <platform>`, a subsequent
  scheduled announcement pass delivers **0** messages for that platform.
- **SC-004**: After a successful `/dev sync <platform>`, the platform's
  catalog row count equals the number of rows the storefront returned
  (stale rows remaining: **0**).
- **SC-005**: When the storefront request fails during `/dev sync`, catalog
  rows lost: **0** — verifiable by comparing the platform's row count
  immediately before and after the failed run.
- **SC-006**: Invoking `/dev broadcast` when every catalog is empty exits
  successfully with **0** messages delivered and no error surfaced to the
  operator.
- **SC-007**: No pre-existing automated check regresses — the suite that
  passed before this feature still passes after it.
- **SC-008**: A deployed run registers **0** `/dev` commands regardless of
  `TEST_GUILD_ID`, while still registering `/sync` and `/broadcast` in the
  test guild — both counts verifiable from the guild's command list.
- **SC-009**: Every invocation that suppresses unsent rows reports that
  count in its reply; suppressed-but-unreported rows: **0**.
- **SC-010**: Messages posted by `/dev broadcast` land in exactly one
  channel — the one the command was run from — with messages appearing
  anywhere else, and subscription rows consulted to pick a recipient, both
  at **0**.
- **SC-011**: Invocations that surface the platform's "did not respond"
  error because the handler replied only after finishing: **0** — across
  both dev commands, including a `/dev sync` run against a slow storefront.

## Assumptions

- The test guild is the maintainer's own guild and only its Administrators
  can reach these commands; that is the access boundary, not a per-user
  allowlist.
- `/dev broadcast` takes its recipient from the invocation channel rather
  than from subscription rows (decided 2026-10-02, see Clarifications),
  superseding an earlier development-database-isolation reading. Delivery is
  confined because the command is only offered inside the test guild during
  local development runs, so the channel it is typed in is necessarily
  inside that guild. Principle II's ordering still holds — a row is marked
  only after the send is acknowledged — whatever the recipient happens to
  be.
- Failing closed when no test guild is configured follows directly from the
  requirement that these commands exist _only_ in that guild: with no such
  guild, they exist nowhere.
- `/dev sync` fetches before it clears (decided 2026-10-02). The literal
  wording was clear-then-insert, which would leave a platform's catalog
  empty whenever the storefront request failed; preserving the catalog was
  chosen over that literal reading.
- The `/dev` commands are gated on the run being a local development run as
  well as on the guild (decided 2026-10-02). Two independent conditions
  rather than one — guild scoping alone would have left a deployed bot
  able to reset a live catalog from the maintainer's own test guild.
- Marking everything announced after `/dev sync` deliberately suppresses
  announcements until the storefront offers something new; that silence is
  the point, not a side effect to be fixed.
- These commands are operational/dev surfaces living in shipped code, which
  is exactly the area spec 005 scrutinised under FR-008. They are admitted
  here on the grounds that they add **no second execution path**: they
  prepare catalog state and then call the same pipeline production calls.
  No dry-run API, no preview mode, no test-only branch.
- **This spec depends on a constitution amendment** (decided 2026-10-02,
  see Clarifications): Principle II needs a narrow carve-out permitting an
  operator-invoked dev reset to mark rows announced without a send, so that
  FR-006 and FR-009 survive compliance review as written. The maintainer
  ratified it as a **MAJOR** amendment (3.1.2 → 4.0.0) — the heaviest
  available — because the carve-out relaxes a MUST-level rule rather than
  merely widening guidance, and MAJOR is what carries the explicit sign-off
  that requires. The rule governing the scheduled pipeline's delivery
  ordering is not relaxed by it.
- `/dev broadcast` picks rows without operator input (one per platform,
  chosen deterministically); selecting a _specific_ game is out of scope.
