# Feature Specification: Guild-Scoped Dev Smoke Commands

**Feature Branch**: `006-dev-smoke-commands`

**Created**: 2026-10-02

**Status**: Draft (clarified 2026-10-02 — both open questions answered at draft time, see Assumptions)

**Input**: User description: "Add `/dev broadcast` and `/dev sync <platform>` slash commands so the sync and broadcast pipelines can be exercised by hand in the test guild. `/dev broadcast` picks one game per platform, turns `broadcasted` back to false, and then reuses the broadcast command to broadcast to TEST_GUILD_ID only. `/dev sync <PLATFORM>` reuses the registered platforms, clears all the games in the catalog for that platform, reuses the sync command to insert the records, and marks all games as broadcasted after the sync so we prevent flooding channels. These `/dev` commands can only be run in TEST_GUILD_ID alongside the admin commands."

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
exactly one freshly-constructed message per platform land in the subscribed
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
5. **Given** only the test guild is subscribed in the local database,
   **When** `/dev broadcast` runs, **Then** no message appears in any other
   guild.

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
   holds exactly the rows the storefront returned and no stale row survives.
2. **Given** the reset completed, **When** the scheduled announcement pass
   next runs, **Then** nothing is announced for that platform.
3. **Given** the storefront request fails, **When** `/dev sync <platform>`
   runs, **Then** the existing catalog is left unchanged — no row is
   removed — and the command reports the failure instead of a reset.
4. **Given** a successful reset, **When** `/dev broadcast` is run
   afterwards, **Then** exactly one message is delivered for that platform.

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
  broadcast pipeline. They MUST NOT introduce a second delivery path, a
  dry-run or preview mode, or any branch that bypasses the production
  pipeline.
- **FR-013**: `/sync` and `/broadcast` MUST be scoped to the test guild in
  every run mode, including deployed runs — the scope must not depend on
  how the process was started.
- **FR-014**: `/dev sync` and `/dev broadcast` MUST be offered during local
  development runs and MUST NOT be offered by a deployed run, even when the
  test guild is configured and the bot is a member of it. `/sync` and
  `/broadcast` are unaffected by this gate (FR-013).

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
  announcements. In a local development database only the test guild's
  channel is subscribed, which is what confines delivery to that guild.

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

## Assumptions

- The test guild is the maintainer's own guild and only its Administrators
  can reach these commands; that is the access boundary, not a per-user
  allowlist.
- Locally, only the test guild's channel is subscribed in the development
  database, so reusing the real broadcast pipeline inherently confines
  delivery to that guild. **No target filter is added to the delivery
  path** — the Constitution II ordering and the send path stay untouched.
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
- `/dev broadcast` picks rows without operator input (one per platform,
  chosen deterministically); selecting a _specific_ game is out of scope.
