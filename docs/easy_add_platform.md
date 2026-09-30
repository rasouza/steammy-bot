# Steammy Bot — Platform Architecture Refactoring Plan

## Objective

Refactor the platform/game-fetching and broadcasting architecture so that adding a new game platform requires implementing only the platform-specific components.

The developer **must not need to create a `Platform` class for every platform**.

The application should provide one generic platform lifecycle implementation that orchestrates:

1. Fetching games from the platform API
2. Mapping platform API responses into the application's `Game` model
3. Persisting games
4. Finding games eligible for broadcast
5. Broadcasting games through Discord
6. Marking games as successfully broadcasted
7. Running the broadcast lifecycle on a schedule

Platform-specific code should contain only the parts that are genuinely different between platforms.

The architecture should follow the Open/Closed Principle:

> Adding a new platform should primarily consist of adding new platform-specific implementations and registering the platform. Existing generic platform/broadcast logic must not need to be modified.

---

# Current Situation

The current `BroadcastService` contains platform-specific logic for Epic and Xbox.

It currently:

* injects `CatalogEpic`
* injects `CatalogXbox`
* has a separate cron method for Epic
* has a separate cron method for Xbox
* contains Epic-specific pending-game queries
* contains Xbox-specific pending-game queries
* marks games as broadcasted
* sends Discord messages
* knows platform-specific broadcast messages

For example, Epic currently has different eligibility rules from Xbox:

```ts
Epic:
broadcasted = false
offer_start_at <= now
offer_end_at >= now
```

while Xbox currently only checks:

```ts
broadcasted = false
```

These differences must remain platform-specific.

The current service also marks a game as broadcasted before attempting Discord delivery. This should be corrected so a failed Discord delivery does not permanently prevent a retry.

---

# Target Architecture

The target architecture is:

```text
                         Platform Scheduler
                                |
                                v
                       Generic Platform Runtime
                                |
               +----------------+----------------+
               |                |                |
               v                v                v
           Epic API         Xbox API         Steam API
               |                |                |
               v                v                v
          Epic Mapper       Xbox Mapper       Steam Mapper
               |                |                |
               v                v                v
          Epic Repo         Xbox Repo         Steam Repo
               |                |                |
               +----------------+----------------+
                                |
                                v
                       Broadcast Service
                                |
                                v
                             Discord
```

There is **one generic platform runtime**.

There is **no `EpicPlatform` class**.

There is **no `XboxPlatform` class**.

There is **no `SteamPlatform` class**.

Instead, each platform provides:

* API implementation
* Mapper implementation
* Repository implementation
* platform metadata/configuration

The generic runtime wires these together.

---

# Desired Developer Experience

Adding Steam should look approximately like this:

```text
platforms/
└── steam/
    ├── steam.api.ts
    ├── steam.mapper.ts
    └── steam.repository.ts
```

Then register the platform using a platform definition:

```ts
{
  type: GamePlatform.STEAM,
  message: 'New game available on **Steam**',
  api: SteamApi,
  mapper: SteamMapper,
  repository: SteamRepository,
}
```

The developer must **not** create:

```text
steam.platform.ts
```

The developer must **not** modify:

```text
generic-platform.ts
broadcast.service.ts
platform-scheduler.ts
```

The generic lifecycle should automatically work for the new platform.

---

# Proposed Directory Structure

Adapt this structure to the existing repository instead of blindly moving unrelated modules.

```text
src/
└── modules/
    │
    ├── platforms/
    │   │
    │   ├── platform.types.ts
    │   ├── generic-platform.ts
    │   ├── platform.tokens.ts
    │   ├── platform.factory.ts
    │   ├── platform.scheduler.ts
    │   ├── platforms.module.ts
    │   │
    │   ├── epic/
    │   │   ├── epic.api.ts
    │   │   ├── epic.mapper.ts
    │   │   └── epic.repository.ts
    │   │
    │   └── xbox/
    │       ├── xbox.api.ts
    │       ├── xbox.mapper.ts
    │       └── xbox.repository.ts
    │
    └── broadcast/
        ├── broadcast.module.ts
        ├── broadcast.service.ts
        └── game-embed.service.ts
```

Do not create a nested:

```text
broadcast/platforms/
```

The repository already has a top-level `platforms` module. Keep platform integrations there.

---

# 1. Define the Platform Contracts

Create generic contracts for the three platform-specific responsibilities.

## API

```ts
export interface PlatformApi<TSource> {
  fetch(): Promise<TSource[]>
}
```

The API returns the platform's native representation.

Example:

```ts
export interface EpicApiGame {
  // Epic-specific fields
}
```

---

## Mapper

```ts
export interface PlatformMapper<TSource, TGame> {
  toGame(source: TSource): TGame
}
```

The mapper converts the external platform representation into the application's game representation.

---

## Repository

```ts
export interface PlatformRepository<TGame> {
  save(game: TGame): Promise<void>

  findPending(): Promise<TGame[]>

  markBroadcasted(game: TGame): Promise<void>
}
```

The repository owns platform-specific persistence and querying rules.

This is important because different platforms can have different definitions of a "pending" game.

For example, Epic's repository should own:

```ts
offer_start_at <= now
offer_end_at >= now
broadcasted = false
```

Xbox's repository can own:

```ts
broadcasted = false
```

The generic runtime must not contain either query.

---

# 2. Create Platform Definition

Create a runtime-safe platform definition.

Conceptually:

```ts
export interface PlatformDefinition<TSource, TGame> {
  type: GamePlatformType

  message: string

  api: Type<PlatformApi<TSource>>

  mapper: Type<PlatformMapper<TSource, TGame>>

  repository: Type<PlatformRepository<TGame>>
}
```

Example:

```ts
export const EPIC_PLATFORM = {
  type: GamePlatform.EPIC,

  message: 'New free game available on **Epic Games**',

  api: EpicApi,

  mapper: EpicMapper,

  repository: EpicRepository,
}
```

Do not duplicate lifecycle logic inside the definition.

It is configuration/composition information only.

---

# 3. Create Generic Platform Runtime

Create exactly one generic platform implementation.

Suggested conceptual implementation:

```ts
export class GenericPlatform<TSource, TGame> {
  constructor(
    private readonly definition: PlatformDefinition<TSource, TGame>,
    private readonly api: PlatformApi<TSource>,
    private readonly mapper: PlatformMapper<TSource, TGame>,
    private readonly repository: PlatformRepository<TGame>,
    private readonly broadcast: BroadcastService,
  ) {}

  get type(): GamePlatformType {
    return this.definition.type
  }

  async sync(): Promise<void> {
    const sources = await this.api.fetch()

    for (const source of sources) {
      const game = this.mapper.toGame(source)

      await this.repository.save(game)
    }
  }

  async broadcastPending(): Promise<number> {
    const games = await this.repository.findPending()

    let count = 0

    for (const game of games) {
      try {
        await this.broadcast.send(
          this.definition.message,
          game,
          this.definition.type,
        )

        await this.repository.markBroadcasted(game)

        count++
      } catch (error) {
        // Log the error.
        // Do NOT mark the game as broadcasted.
        // Allow a later execution to retry.
      }
    }

    return count
  }
}
```

Adapt the exact types and logging conventions to the existing codebase.

Do not blindly copy this implementation if the existing project has established patterns that should be preserved.

---

# 4. Create a Platform Factory

NestJS should construct the generic platform instances using factory providers.

The factory should accept:

```ts
PlatformDefinition
```

and produce a provider for a `GenericPlatform`.

Conceptually:

```ts
export function createPlatformProvider<TSource, TGame>(
  definition: PlatformDefinition<TSource, TGame>,
) {
  return {
    provide: definition.type,

    useFactory: (
      api: PlatformApi<TSource>,
      mapper: PlatformMapper<TSource, TGame>,
      repository: PlatformRepository<TGame>,
      broadcast: BroadcastService,
    ) => {
      return new GenericPlatform(
        definition,
        api,
        mapper,
        repository,
        broadcast,
      )
    },

    inject: [
      definition.api,
      definition.mapper,
      definition.repository,
      BroadcastService,
    ],
  }
}
```

Use appropriate Nest provider tokens.

Do not assume TypeScript interfaces can be used directly as runtime DI tokens.

Nest's custom-provider system supports factory providers and explicit tokens; use that mechanism rather than relying on interfaces at runtime.

Reference:

https://docs.nestjs.com/fundamentals/custom-providers

---

# 5. Create a Platform Registry

The scheduler should not know about Epic, Xbox, Steam, etc.

Create a registry/token containing all registered platform runtimes.

Conceptually:

```ts
export const PLATFORM_REGISTRY = Symbol('PLATFORM_REGISTRY')
```

The module should construct:

```ts
[
  epicPlatform,
  xboxPlatform,
]
```

and inject that collection into the scheduler.

The exact Nest implementation may use a factory provider.

The important architectural requirement is:

```text
Scheduler
    |
    v
Platform[]
```

and NOT:

```text
Scheduler
    |
    +── EpicPlatform
    +── XboxPlatform
    +── SteamPlatform
```

The scheduler must remain completely platform-agnostic.

---

# 6. Create Generic Platform Scheduler

Replace the current platform-specific cron methods.

The current implementation has separate scheduled methods for Epic and Xbox.

Replace them with one generic scheduled operation.

Conceptually:

```ts
@Injectable()
export class PlatformScheduler {
  constructor(
    @Inject(PLATFORM_REGISTRY)
    private readonly platforms: GenericPlatform<any, any>[],
  ) {}

  @Cron('10 * * * *')
  async broadcast(): Promise<void> {
    for (const platform of this.platforms) {
      await platform.broadcastPending()
    }
  }
}
```

Preserve the existing schedule unless there is a specific reason to change it.

The scheduler must not contain:

```ts
if (platform === GamePlatform.EPIC)
```

or:

```ts
if (platform === GamePlatform.XBOX)
```

or any other platform-specific branching.

Nest's task scheduling mechanism should remain infrastructure around the generic lifecycle.

Reference:

https://docs.nestjs.com/techniques/task-scheduling

---

# 7. Refactor BroadcastService

`BroadcastService` should no longer know about Epic or Xbox repositories.

Remove dependencies such as:

```ts
Repository<CatalogEpic>
Repository<CatalogXbox>
```

from `BroadcastService`.

It should be responsible only for Discord delivery.

Conceptually:

```ts
@Injectable()
export class BroadcastService {
  async send(
    message: string,
    game: Game,
    platform: GamePlatformType,
  ): Promise<void> {
    // Find subscriptions for platform
    // Build embed
    // Fetch Discord channels
    // Send messages
  }
}
```

It must not contain:

```ts
broadcastEpic()
broadcastXbox()
cronEpic()
cronXbox()
```

It must not contain platform-specific database queries.

It must not know about `CatalogEpic` or `CatalogXbox`.

The current Discord delivery implementation should be preserved as much as possible.

---

# 8. Refactor Epic

Create:

```text
platforms/epic/
├── epic.api.ts
├── epic.mapper.ts
└── epic.repository.ts
```

## `EpicApi`

Responsible only for communication with the Epic API.

It should return an Epic-specific DTO.

It must not return TypeORM entities.

---

## `EpicMapper`

Responsible only for:

```text
Epic API DTO
      ↓
Game
```

It must not contain persistence logic.

---

## `EpicRepository`

Responsible for:

```text
Game
 ↓
CatalogEpic
```

and:

```text
CatalogEpic
 ↓
Game
```

It must contain the Epic-specific pending query currently found in `BroadcastService`.

The query must preserve the existing semantics:

```ts
broadcasted = false
offer_start_at <= now
offer_end_at >= now
```

Do not move this query into `GenericPlatform`.

---

# 9. Refactor Xbox

Create:

```text
platforms/xbox/
├── xbox.api.ts
├── xbox.mapper.ts
└── xbox.repository.ts
```

Apply exactly the same architecture.

The Xbox repository owns Xbox-specific persistence and pending-game rules.

Do not create:

```text
xbox.platform.ts
```

---

# 10. Platform Registration

Register Epic and Xbox through platform definitions.

Conceptually:

```ts
const EPIC_PLATFORM = {
  type: GamePlatform.EPIC,
  message: 'New free game available on **Epic Games**',
  api: EpicApi,
  mapper: EpicMapper,
  repository: EpicRepository,
}

const XBOX_PLATFORM = {
  type: GamePlatform.XBOX,
  message: 'New game available on **Xbox Game Pass**',
  api: XboxApi,
  mapper: XboxMapper,
  repository: XboxRepository,
}
```

Then create generic providers from these definitions.

The registration layer is allowed to change when a new platform is introduced.

This is the composition root.

Do NOT interpret OCP as "no file in the entire application may ever change".

The requirement is that the generic business behavior does not need modification.

---

# 11. Adding a New Platform

After the refactor, adding Steam should require approximately:

```text
1. Create steam.api.ts
2. Create steam.mapper.ts
3. Create steam.repository.ts
4. Create/register STEAM_PLATFORM definition
5. Register its generic provider
```

It must NOT require:

```text
Modify GenericPlatform
Modify BroadcastService
Modify PlatformScheduler
Modify Epic
Modify Xbox
Create SteamPlatform
Create Steam cron
Create Steam broadcast method
```

This is the primary acceptance criterion for the architecture.

---

# 12. Error and Retry Semantics

Correct the existing ordering.

Current behavior:

```text
mark broadcasted
       ↓
send Discord message
```

Desired behavior:

```text
send Discord message
       ↓
success?
   /       \
 yes       no
  |         |
  v         v
mark       leave
broadcasted pending
```

Therefore:

```ts
await broadcast.send(...)

await repository.markBroadcasted(game)
```

must happen in that order.

If Discord delivery fails:

* log the error
* do not mark the game as broadcasted
* allow a future scheduled execution to retry

Be careful with multiple subscriptions.

The existing `BroadcastService` catches errors per Discord channel. Preserve the intended semantics, but explicitly decide whether a game is considered successfully broadcast when some subscriptions succeed and others fail.

Do not silently change this behavior without documenting the decision.

---

# 13. Do Not Over-Abstract

Do not introduce abstractions merely because they are theoretically possible.

The desired abstraction boundary is:

```text
Platform API
Platform Mapper
Platform Repository
        ↓
Generic Platform Lifecycle
        ↓
Broadcast Service
        ↓
Discord
```

Avoid introducing unnecessary:

* factories inside factories
* abstract classes for each platform
* platform-specific services that only delegate one method
* generic repositories with dozens of meaningless methods
* generic API wrappers that obscure the actual platform APIs
* inheritance hierarchies for Epic/Xbox/Steam

There should be **one generic lifecycle implementation**.

---

# 14. Testing Strategy

Tests should prove the architecture, not merely increase coverage.

## GenericPlatform tests

Test:

### Sync

```text
API returns games
        ↓
Mapper called
        ↓
Repository saves mapped games
```

### Broadcast

```text
Repository returns pending games
        ↓
BroadcastService sends game
        ↓
Repository marks game broadcasted
```

### Failure

```text
BroadcastService throws
        ↓
Repository.markBroadcasted NOT called
```

### Empty queue

```text
Repository returns []
        ↓
No broadcast
        ↓
Returns 0
```

---

# 15. Platform-specific tests

Epic repository tests should verify Epic's rules.

For example:

```text
broadcasted = false
offer hasn't started
    → not pending

broadcasted = false
offer has expired
    → not pending

broadcasted = false
offer is currently active
    → pending

broadcasted = true
offer is currently active
    → not pending
```

Xbox repository tests should verify its own rules.

The generic runtime should not contain these rules.

---

# 16. End-to-End Development Safety

The production bot is already running.

Do NOT use the production Discord token for local development.

Use separate environments:

```text
Production
├── Production Discord application/bot
├── Production Discord server
└── Production database

Development
├── Development Discord application/bot
├── Development Discord test server
└── Development database
```

Local development should never point to the production database.

Prefer an explicit configuration flag such as:

```env
BROADCAST_ENABLED=false
```

during initial development.

Enable it only when testing the actual broadcast flow.

The objective is to be able to run the refactored application locally while production remains completely unaffected.

---

# 17. Migration Strategy

Do not rewrite everything at once.

Perform the migration incrementally.

## Step 1 — Inspect existing architecture

Before modifying code:

* inspect the existing `platforms` module
* inspect Epic API implementation
* inspect Xbox API implementation
* inspect catalog entities
* inspect current repositories/services
* inspect `BroadcastModule`
* inspect how `GamePlatform` and `GamePlatformType` are defined
* inspect how modules import/export these providers

Do not assume the proposed folder structure exactly matches the current repository.

Adapt it to existing conventions.

---

## Step 2 — Introduce contracts

Add:

```text
PlatformApi
PlatformMapper
PlatformRepository
PlatformDefinition
```

without changing behavior yet.

---

## Step 3 — Introduce GenericPlatform

Implement the generic lifecycle.

Test it independently.

---

## Step 4 — Move Epic

Move Epic-specific:

* API interaction
* mapping
* persistence
* pending-game query

into:

```text
epic.api.ts
epic.mapper.ts
epic.repository.ts
```

Register Epic through the generic platform factory.

Verify behavior.

---

## Step 5 — Move Xbox

Perform the same migration for Xbox.

At this point there should be no Epic/Xbox logic in `BroadcastService`.

---

## Step 6 — Replace Cron

Remove:

```ts
cronEpic()
cronXbox()
```

and introduce the generic scheduler.

Verify that both platforms still execute.

---

## Step 7 — Fix broadcast persistence ordering

Ensure:

```text
Discord success
    ↓
mark broadcasted
```

rather than:

```text
mark broadcasted
    ↓
Discord
```

Add tests for the failure case.

---

## Step 8 — Remove obsolete code

After Epic and Xbox are working:

* remove old repository injections from `BroadcastService`
* remove old cron methods
* remove old platform-specific broadcast methods
* remove unused imports
* remove dead abstractions

Do not leave the old and new architecture running in parallel unnecessarily.

---

# 18. Final Architecture Acceptance Criteria

The implementation is complete only when all of the following are true.

### Architecture

* [ ] There is exactly one generic platform lifecycle implementation.
* [ ] There is no `EpicPlatform` class.
* [ ] There is no `XboxPlatform` class.
* [ ] `BroadcastService` does not know about Epic or Xbox.
* [ ] The scheduler does not know about Epic or Xbox.
* [ ] Platform-specific persistence lives in platform repositories.
* [ ] Platform-specific API interaction lives in platform API classes.
* [ ] Platform-specific mapping lives in platform mappers.

### Open/Closed Principle

Adding Steam must not require changes to:

```text
GenericPlatform
BroadcastService
PlatformScheduler
Epic code
Xbox code
```

Only the platform registration/composition layer may need to be updated.

### Reliability

* [ ] A failed Discord broadcast does not mark the game as broadcasted.
* [ ] Failed broadcasts can be retried.
* [ ] Existing Epic eligibility behavior is preserved.
* [ ] Existing Xbox eligibility behavior is preserved.
* [ ] Existing Discord subscription behavior is preserved.

### Testing

* [ ] Generic platform lifecycle has unit tests.
* [ ] Epic repository rules have tests.
* [ ] Xbox repository rules have tests.
* [ ] Broadcast failure/retry behavior has tests.
* [ ] Existing tests continue to pass.

### Development safety

* [ ] Local development can use a separate Discord bot token.
* [ ] Local development uses a separate database.
* [ ] Production credentials are never required for local testing.
* [ ] Broadcast execution can be disabled through configuration.

---

# 19. Important Implementation Rule for the LLM

Do not blindly implement the architecture described above.

First inspect the repository and understand the existing:

* module boundaries
* entities
* API services
* repositories
* DTOs
* types
* dependency injection
* tests
* naming conventions

Then implement the architecture while **preserving existing behavior**.

Prefer small, incremental changes over a large rewrite.

Do not introduce unrelated refactors.

Do not change public behavior unless explicitly required by this plan.

If an existing abstraction conflicts with the proposed architecture, explain the conflict and adapt the design rather than duplicating responsibilities.

The final result should make this possible:

```text
Developer wants to add Steam
            |
            v
Create:
    steam.api.ts
    steam.mapper.ts
    steam.repository.ts
            |
            v
Register Steam definition
            |
            v
Done
```

The developer should **not need to understand or modify the generic broadcast lifecycle** to add a platform.

That is the primary architectural goal.
