# Feature Specification: Easy Add Platform — Generic Platform Lifecycle

**Feature Branch**: `STE-1-easy-add-platform`

**Created**: 2026-09-29

**Status**: Draft

**Input**: User description: "task STE-1. Use @docs/plans/easy_add_platform.md for reference"

## Clarifications

### Session 2026-09-29

- Q: If one storefront's scheduled sync or announcement run fails, should the other storefronts' runs in that same pass still execute? → A: Yes — log the failure and continue with the remaining storefronts in the pass.
- Q: When a scheduled sync re-fetches a game that is already stored for that storefront, how should it be persisted? → A: Update the existing record in place, keyed by the storefront's game id, leaving its announced state untouched.
- Q: Should this feature deliver a written step-by-step guide for adding a new storefront as part of its scope? → A: Yes — a short integration guide in the repo is part of this feature's deliverables.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Add a new storefront with only storefront-specific work (Priority: P1)

A maintainer who wants the bot to announce offers from an additional storefront (e.g. Steam)
adds only the pieces that are genuinely different for that storefront: how to retrieve its
offers, how to convert them into the bot's common game representation, and which of its games
are eligible to be announced. They then register the storefront once with its identity and
announcement text. They do not touch any shared announcement, scheduling, or delivery logic,
and they do not write a storefront-specific lifecycle class, scheduled job, or broadcast method.

**Why this priority**: This is the headline goal of the feature. Today every new storefront
costs edits in shared code (the delivery service carries per-storefront methods, queries, and
schedules), so each addition risks breaking the storefronts already shipping to production
subscribers. Removing that coupling is the whole point of the change.

**Independent Test**: Attempt to integrate a hypothetical new storefront by following the
documented steps. Verify that only new storefront-specific files plus the registration entry
change, that no shared lifecycle/scheduling/delivery file is modified, and that the new
storefront syncs and announces end-to-end without altering existing storefronts.

**Acceptance Scenarios**:

1. **Given** the bot with two registered storefronts, **When** a maintainer adds a new
   storefront's retrieval/translation/storage components and one registration entry, **Then**
   catalog synchronization and announcements for the new storefront operate without any edit
   to shared lifecycle, scheduling, or delivery logic.
2. **Given** a newly registered storefront, **When** the schedules run, **Then** its catalog is
   synchronized and its eligible games are announced exactly as the existing storefronts are.
3. **Given** the full set of files touched by the integration, **When** a reviewer inspects
   them, **Then** no existing storefront's code and no generic component was modified, except
   the registration/composition layer.
4. **Given** the new storefront, **When** its games are announced, **Then** no
   storefront-specific lifecycle class, scheduled job, or broadcast method was created for it.

---

### User Story 2 - Never lose an announcement to a failed delivery (Priority: P2)

A Discord subscriber receives every eligible game announcement. If delivery fails (Discord
outage, rate limit, missing channel), the game stays pending and a later scheduled run retries
it. A game is recorded as announced only after delivery has demonstrably succeeded.

**Why this priority**: The current behavior records the game as announced *before* attempting
delivery, so a transient failure permanently and silently drops the announcement — data loss
that subscribers never see and maintainers never notice. This is a known defect and must be
corrected as part of reworking this lifecycle.

**Independent Test**: Force delivery to fail for a pending game, then verify the game is still
pending; restore delivery and verify the next run announces it exactly once.

**Acceptance Scenarios**:

1. **Given** a pending eligible game, **When** delivery fails for every subscribed channel,
   **Then** the game is not marked announced and remains eligible for a future run.
2. **Given** a game that previously failed delivery, **When** a later scheduled run executes
   and delivery now succeeds, **Then** the game is announced and then marked announced.
3. **Given** a game marked announced, **When** any subsequent run executes, **Then** the game
   is never announced a second time.

---

### User Story 3 - Existing subscribers see no change (Priority: P3)

Subscribers to the existing Epic Games and Xbox Game Pass channels keep receiving exactly the
same games, with the same announcement text and embed, at the same times as before the change.
Epic continues to announce only offers inside their active offer window; Xbox continues to
announce any game not yet announced.

**Why this priority**: The production bot is live. A behavioral regression here silently stops
or duplicates announcements to real subscribers. Preservation is verified continuously while
Stories 1 and 2 are built on top of it.

**Independent Test**: Run the announcement decision over the same catalog data before and
after the change and compare the resulting sets of announced games — they must be identical
per storefront.

**Acceptance Scenarios**:

1. **Given** an Epic game that is un-announced and whose offer window is currently active,
   **When** the announcement schedule runs, **Then** it is announced exactly once.
2. **Given** an Epic game that is un-announced but whose offer has not started or has already
   expired, **When** the announcement schedule runs, **Then** it is not announced.
3. **Given** an Xbox game that is un-announced, **When** the announcement schedule runs,
   **Then** it is announced, regardless of any offer-window dates.
4. **Given** the schedules, **When** they execute, **Then** synchronization and announcements
   run at the same times they do today.
5. **Given** a subscribed channel for a storefront, **When** an announcement is delivered,
   **Then** the message text, embed, and target-channel selection are unchanged.

---

### User Story 4 - Run and verify locally without production credentials (Priority: P4)

A maintainer runs the refactored bot on their own machine against a separate Discord
application, test server, and database, with broadcast delivery switched off by configuration.
No production credential is required, and production is unaffected by local runs.

**Why this priority**: The production bot is already running. Safe local verification of a
broadcast-lifecycle refactor is what makes Stories 1–3 testable at all, but it delivers no
subscriber-facing value on its own, so it trails the core stories.

**Independent Test**: Start the application locally with production credentials absent and
broadcasting disabled; confirm it boots, syncs against the development database, and performs
no Discord delivery.

**Acceptance Scenarios**:

1. **Given** a local environment with no production credentials, **When** the bot starts,
   **Then** it starts successfully using only the development configuration.
2. **Given** broadcasting is disabled by configuration, **When** schedules execute, **Then**
   no Discord message is sent while synchronization may still run.
3. **Given** broadcasting disabled, **When** the maintainer enables it deliberately,
   **Then** delivery can be exercised end-to-end against the development Discord application
   and test server.

---

### Edge Cases

- The storefront's offer retrieval returns an empty list: synchronization completes with no
  games stored, no announcements attempted, and no error surfaced.
- No game is eligible for announcement: the run completes, reports zero, and performs no
  delivery.
- Delivery succeeds for some subscribed channels but fails for others (e.g. one channel was
  deleted): the game counts as successfully announced (at least one channel received it), the
  failed channels are logged, and channels already served are never sent a duplicate on retry.
  See Assumption A-004 — this decision is deliberate and documented.
- Delivery fails for every subscribed channel: the game is left un-announced and retried on
  the next scheduled run.
- A storefront has zero subscribed channels: the announcement pass has nothing to deliver;
  the game is marked announced, matching today's behavior so no un-announceable backlog
  accumulates. See Assumption A-005.
- A registration is invalid (duplicate identity or missing component): the application fails
  fast at startup with a clear error instead of silently skipping that storefront.
- A storefront's sync or announcement run throws (API outage, database error): the failure is
  logged and the remaining storefronts in the same pass still execute; the failed storefront's
  games remain eligible for the next scheduled pass.
- A manual admin-triggered run and a scheduled run both target the same game: a game already
  marked announced is never announced twice (same race behavior as today; not expanded in
  scope).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST run a single generic platform lifecycle for every registered
  storefront: retrieve offers → convert to the common game model → persist → find games
  eligible for announcement → deliver to subscribers → mark announced. Persistence MUST update
  an already-stored game in place, keyed by the storefront's game id — never inserting a
  duplicate record and never resetting the game's announced state on re-fetch.
- **FR-002**: Each storefront MUST provide only its own components: offer retrieval, conversion
  of its offers into the common game model, and persistence — including its own
  announce-eligibility rules.
- **FR-003**: Registering a storefront MUST be declarative configuration (storefront identity,
  announcement text, and its components) containing no lifecycle logic of its own.
- **FR-004**: Scheduling MUST be storefront-agnostic: one scheduled synchronization pass and
  one scheduled announcement pass that iterate all registered storefronts, preserving the
  existing schedule timings unchanged. If a single storefront's run fails, the failure MUST be
  logged and the pass MUST continue with the remaining storefronts — one storefront's failure
  MUST NOT block or skip the others in that pass.
- **FR-005**: No shared component (lifecycle, scheduling, delivery, or admin trigger paths)
  MAY branch on storefront identity. All storefront differences MUST live in storefront-specific
  components or registration data.
- **FR-006**: Delivery MUST be storefront-agnostic: it resolves subscribers for the given
  storefront, builds the message, and sends it. It MUST NOT read storefront catalogs or apply
  storefront eligibility rules.
- **FR-007**: Epic eligibility MUST be preserved exactly: a game is eligible only when it is
  un-announced, its offer has started (start time ≤ now), and its offer has not expired
  (end time ≥ now).
- **FR-008**: Xbox eligibility MUST be preserved exactly: a game is eligible only when it is
  un-announced.
- **FR-009**: A game MUST be marked announced only after delivery succeeds. On delivery
  failure it MUST remain un-announced so a future scheduled run retries it.
- **FR-010**: A game counts as successfully announced when at least one subscribed channel
  received it (or when there are zero subscribers). If every attempted delivery fails, the
  game is not marked announced. Per-channel failures are logged; channels already served in a
  partial success are not re-sent.
- **FR-011**: The admin synchronization and broadcast commands MUST work for any registered
  storefront through the registration, with no per-storefront branching in the commands.
- **FR-012**: Adding a storefront MUST NOT require modifying the generic lifecycle, the
  delivery service, the scheduler, or any existing storefront's code, and MUST NOT require
  creating a storefront-specific lifecycle class, scheduled job, or broadcast method. Only new
  storefront-specific components plus the registration entry may change.
- **FR-013**: Broadcast delivery MUST be disable-able through configuration, and local
  development MUST be possible with a separate Discord application and database without any
  production credentials.
- **FR-014**: Obsolete per-storefront broadcast methods, scheduled methods, and storefront
  catalog dependencies in shared services MUST be removed — the old and new paths MUST NOT run
  in parallel.
- **FR-015**: Discord subscription targeting, announcement message text, embeds, and command
  responses MUST remain behaviorally unchanged.
- **FR-016**: The system MUST have tests proving the architecture: generic lifecycle behavior
  (success, failure-does-not-mark, empty queue), each storefront's eligibility rules, and
  delivery failure/retry. All existing tests MUST continue to pass.
- **FR-017**: No database schema change is expected; if one somehow becomes necessary it MUST
  ship as a reviewed, versioned migration rather than being applied automatically.
- **FR-018**: The feature MUST deliver a written, step-by-step integration guide for adding a
  new storefront (component creation through registration and verification), committed with the
  code. The guide MUST be sufficient for the User Story 1 independent test to be performed by
  someone who did not write the refactor.

### Key Entities

- **Storefront (Platform)**: A game source the bot announces from — today Epic Games and Xbox
  Game Pass, future examples Steam. Key attributes: identity, display name, announcement text,
  and its three storefront-specific components (retrieval, translation, storage/eligibility).
- **Game (catalog entry)**: A game offer fetched from a storefront, stored in the common game
  shape (title, price, size, offer window, storefront identity) while persisting per-storefront.
  Identity: unique per storefront, keyed by the storefront's own game id; a re-fetch updates
  the existing entry in place. Key state: the announced/un-announced flag, which re-fetching
  MUST NOT reset.
- **Subscription**: A Discord channel's opt-in to a specific storefront's announcements; the
  delivery step resolves subscriptions by storefront to choose target channels.
- **Announcement eligibility**: The per-storefront rule deciding which stored games may be
  announced now — platform-specific by design (Epic: un-announced + active offer window; Xbox:
  un-announced).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Integrating a hypothetical new storefront requires changes to zero shared files:
  the diff contains only new storefront-specific components plus the registration entry, with
  no edits to the generic lifecycle, scheduler, delivery service, or existing storefronts.
- **SC-002**: On identical catalog data, the set of games selected for announcement per
  storefront before and after the change is identical — a zero-difference comparison for both
  Epic and Xbox eligibility decisions, message text, and target channels.
- **SC-003**: When delivery fails, 0% of affected games are marked announced; once delivery
  recovers, 100% of them are announced on a subsequent run — each at most once overall.
- **SC-004**: The full existing verification suite (formatting, type, lint, build, unit tests —
  including the coverage run CI performs — and end-to-end tests) passes, together with the new
  lifecycle, eligibility, and retry tests — no test removed or skipped.
- **SC-005**: A maintainer can start the bot locally with zero production credentials and with
  broadcast delivery disabled, and can verify synchronization behavior without touching
  production.
- **SC-006**: A maintainer following the documented integration steps performs no edit to any
  shared component and creates no storefront-specific lifecycle, scheduled job, or broadcast
  method — measurable as the absence of those artifacts in the change.

## Assumptions

- **A-001**: Scope is the architecture refactor plus the delivery-ordering fix and dev-safety
  switch. No new storefront (e.g. Steam) ships in this feature; Steam is only the hypothetical
  used to verify the developer experience (per the reference plan).
- **A-002**: The admin sync/broadcast commands are in scope for de-branching, because they are
  shared code with per-storefront branching today and the constitution names that as an
  anti-pattern. The registration/composition layer is expected to change when a storefront is
  added — that is the allowed exception to "no shared edits".
- **A-003**: Existing schedule timings are preserved unchanged: catalog synchronization runs
  hourly on the hour, announcements run hourly at 10 past (today's behavior).
- **A-004**: Partial-delivery decision (required to be explicit by the reference plan): a game
  is considered announced when at least one subscribed channel received it. This matches
  today's per-channel error swallowing and avoids duplicate messages to already-served channels
  when a later run retries.
- **A-005**: Zero-subscriber case follows current behavior: the game is marked announced, so
  the pending list does not grow without bound for storefronts nobody subscribes to.
- **A-006**: The announced flag and offer-window columns already exist; no schema change and
  therefore no migration is anticipated (FR-017).
- **A-007**: Delivery disable-switch semantics: when disabled, the announcement pass performs
  no Discord sends (and marks nothing as announced, since delivery cannot succeed), while
  catalog synchronization may still run. Exact flag name/shape is an implementation detail.
- **A-008**: Old and new paths are cut over per storefront rather than running in parallel;
  obsolete per-storefront methods are removed once each storefront works through the generic
  lifecycle (reference plan, migration strategy).
- **A-009**: Development safety assumes separate Discord application, test server, and database
  for local work; the production database and bot token are never required for local testing.
- **A-010**: Internal file organization only — `src/shared/` is retired as part of the
  architecture refactor: storefront-specific type definitions move into their storefront's own
  folder, and the platform identity vocabulary plus the common game model move into the
  platform module (their producer side). Import paths in consuming modules change; no runtime
  behavior does. Maintainer-directed during planning (2026-09-29).
