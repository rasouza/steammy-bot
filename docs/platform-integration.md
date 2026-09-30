# Adding a Platform Integration

This is the step-by-step guide for adding a new storefront to the platform
registry (spec `003-easy-add-platform`, FR-018). The architecture guarantees
that a new storefront is **only** storefront-specific components plus a
registration entry (FR-012): you never touch the generic lifecycle, the
scheduler, the Discord delivery service, or any existing storefront (SC-006).

Throughout this guide, `<name>` is your storefront's lowercase identifier
(e.g. `steam`), and `<Name>` its display label (e.g. `Steam`).

## What you will create

| Artifact | Path |
|----------|------|
| Native DTO types (optional) | `src/modules/platforms/<name>/<name>.types.ts` |
| Fetch component | `src/modules/platforms/<name>/<name>.api.ts` |
| Map component | `src/modules/platforms/<name>/<name>.mapper.ts` |
| Persistence + eligibility component | `src/modules/platforms/<name>/<name>.repository.ts` |
| Eligibility spec | `src/modules/platforms/<name>/<name>.repository.spec.ts` |
| Identity entry | `src/modules/platforms/platform.constants.ts` |
| Registration entry | `src/modules/platforms/platform.registry.ts` |
| Provider registration | `src/modules/platforms/platforms.module.ts` |
| Discord command choice | `src/modules/subscription/dto/platform-option.dto.ts` |

**Files you must NOT edit** — if a step seems to require one of these, the
registration is incomplete:

- `src/modules/platforms/generic-platform.ts` (the lifecycle)
- `src/modules/platforms/platform.scheduler.ts` (the schedules)
- `src/modules/broadcast/broadcast.service.ts` (delivery)
- any other storefront's folder (`epic/`, `xbox/`, …)

## Step 1 — Native types (optional)

If the storefront's API responses deserve named shapes, declare them in
`src/modules/platforms/<name>/<name>.types.ts` and import them with
`import type`. This folder owns them; nothing outside references them except
your own components.

## Step 2 — Fetch component (`<name>.api.ts`)

Implements `PlatformApi<TSource>`: one method, `fetch()`, returning the
storefront's **native** API rows — never database entities, never mapped
games.

```ts
import { Injectable } from '@nestjs/common';
import type { PlatformApi } from '../platform.types.js';
import type { <Name>ApiGame } from './<name>.types.js';

@Injectable()
export class <Name>Api implements PlatformApi<<Name>ApiGame> {
  async fetch(): Promise<<Name>ApiGame[]> {
    // HTTP call(s) to the storefront's catalog endpoint(s).
    // Any pagination/aggregation specific to this API lives here.
  }
}
```

## Step 3 — Map component (`<name>.mapper.ts`)

Implements `PlatformMapper<TSource, TGame>`: `toGame(source)` translates one
native row into the common `Game` model (optionally extended with
storefront-specific fields, which persistence ignores).

- Return the mapped game to persist it.
- Return `null` to **skip** a row that does not qualify (this is where any
  "only these offers count" filter belongs — never in generic code).
- No persistence, no network, no `broadcasted` handling here: it must stay a
  pure, unit-testable translation.

```ts
import { Injectable } from '@nestjs/common';
import type { Game, PlatformMapper } from '../platform.types.js';
import type { <Name>ApiGame } from './<name>.types.js';

@Injectable()
export class <Name>Mapper implements PlatformMapper<<Name>ApiGame, Game> {
  toGame(source: <Name>ApiGame): Game | null {
    if (!qualifies(source)) return null;
    return { id: source.id, title: source.title, description: source.body };
  }
}
```

## Step 4 — Persistence + eligibility (`<name>.repository.ts`)

Implements `PlatformRepository<TGame>`:

- `saveAll(games)` — `upsert(games, ['id'])` into your storefront's catalog
  table. It must **never write the `broadcasted` column** (FR-001): sync
  re-fetches must not resurrect or stomp announcement state.
- `findPending(now)` — returns only games eligible for announcement, via a
  **pure exported criteria function**. This is where your storefront's
  eligibility rules live (FR-005): a start/end offer window, a launch date,
  a platform's own notion of "free" — whatever the storefront means.
- `markBroadcasted(game)` — sets `broadcasted: true` and saves. The generic
  lifecycle only ever calls it *after* delivery succeeded, so you never make
  that ordering decision yourself.

```ts
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { CatalogMyplatform } from '../../../database/entities/index.js';
import type { Game, PlatformRepository } from '../platform.types.js';

export function <name>PendingCriteria(now: Date) {
  return {
    broadcasted: false,
    // storefront-specific eligibility, e.g. window comparisons:
    // start_at: LessThanOrEqual(now),
  };
}

@Injectable()
export class <Name>Repository implements PlatformRepository<Game> {
  constructor(
    @InjectRepository(CatalogMyplatform)
    private readonly repository: Repository<CatalogMyplatform>,
  ) {}

  async saveAll(games: Game[]): Promise<void> {
    await this.repository.upsert(games, ['id']);
  }
  async findPending(now: Date): Promise<Game[]> {
    return this.repository.find({ where: <name>PendingCriteria(now) });
  }
  async markBroadcasted(game: Game): Promise<void> {
    await this.repository.save({ ...game, broadcasted: true });
  }
}
```

Your catalog entity must be registered in **both**
`src/database/entities/index.ts` and the `entities` array in
`src/database/data-source-options.ts`, with a generated migration (never
`synchronize`). Follow the repository's standard database workflow if the
table does not exist yet.

## Step 5 — Eligibility spec

Write `src/modules/platforms/<name>/<name>.repository.spec.ts` covering each
rule of your criteria function (pending / not-pending cases), the same way
the existing storefront criteria are pinned. These specs are part of the
feature's definition of done (FR-016).

## Step 6 — Registration

Registration is configuration, and it is the only shared code you touch:

1. **Identity** — in `src/modules/platforms/platform.constants.ts` add the
   platform value and its display name:

   ```ts
   export const GamePlatform = {
     XBOX: 'xbox',
     EPIC: 'epic',
     STEAM: 'steam', // <- new
   } as const;

   export const GamePlatformName: Record<GamePlatformType, string> = {
     // ...
     [GamePlatform.STEAM]: 'Steam', // <- new
   };
   ```

2. **Definition** — in `src/modules/platforms/platform.registry.ts` declare
   your `PlatformDefinition` and add its token to the registry provider:

   ```ts
   export const STEAM_PLATFORM: PlatformDefinition<SteamApiGame, Game> = {
     type: GamePlatform.STEAM,
     message: 'New free game available on **Steam**', // announcement text (FR-003)
     api: SteamApi,
     mapper: SteamMapper,
     repository: SteamRepository,
   };

   export const platformRegistryProvider: Provider = {
     provide: PLATFORM_REGISTRY,
     inject: [
       platformToken(EPIC_PLATFORM.type),
       platformToken(XBOX_PLATFORM.type),
       platformToken(STEAM_PLATFORM.type), // <- new
     ],
     useFactory: (...runtimes: PlatformRuntime[]): PlatformRuntime[] => {
       // ...
     },
   };
   ```

3. **Providers** — in `src/modules/platforms/platforms.module.ts` register
   the three components and `createPlatformProvider(STEAM_PLATFORM)`.

4. **Discord choices** — in `src/modules/subscription/dto/platform-option.dto.ts`
   append `{ name: 'Steam', value: GamePlatform.STEAM }` so `/subscribe`,
   `/sync`, and `/broadcast` can offer the storefront. (The `choices` array is
   evaluated at class-decoration time, which is why it is a literal list.)

That's the full integration. Schedules, admin commands, and broadcast delivery
pick the new storefront up from the registry automatically — there is no
per-storefront cron, command branch, or broadcast method to write.

## Step 7 — Verify

```bash
npm run type:check
npm run lint                    # read-only; never --fix
npm run format                  # if Prettier flags your files
npm test -- platforms/<name>    # your criteria + any component specs
```

Then the full gate before opening a PR (all must pass):

```bash
npx prettier --check "src/**/*.ts" "test/**/*.ts"
npm run type:check
npm run lint
npm run build
npm run test:cov
npm run test:e2e
```

Self-check against SC-001/SC-006: `git diff --stat` should show only your new
`platforms/<name>/` folder plus the registration entries — no changes to
`generic-platform.ts`, `platform.scheduler.ts`, `broadcast.service.ts`, or
another storefront's files, and no storefront-specific lifecycle, scheduled
job, or broadcast method anywhere in the diff.

## Behavior you inherit for free

- Sync runs hourly on the hour, announcements at minute 10 past (A-003) — no
  schedule to declare.
- Announcement text comes from your definition's `message`; embeds, target
  channel resolution, and per-channel error handling come from delivery.
- A game is marked announced only after a successful send; total delivery
  failure leaves it pending for the next pass, zero-subscriber storefronts are
  marked to keep the queue bounded (FR-009/FR-010, A-005).
- One storefront failing a scheduled pass never blocks the others (FR-004).
