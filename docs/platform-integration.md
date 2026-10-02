# Adding a Platform Integration

This is the step-by-step guide for adding a new platform (a *GameSource*) to the
bot (specs `003-easy-add-platform` and `004-platform-gamesource-split`). The
architecture guarantees that a new platform is **only** its own components plus
a declarative registration: you never touch the generic lifecycle, the
scheduler, the Discord delivery service, or any existing platform (SC-006).

Two areas, one direction of dependence:

- `src/gamesources/<name>/` — everything your platform owns (components +
  one `defineGameSource(...)` declaration).
- `src/modules/platforms/` — the generic machinery (lifecycle, scheduler,
  registry, DI wiring). It never names a platform; it consumes the central
  registration list only.

Throughout this guide, `<name>` is your platform's lowercase identifier
(e.g. `steam`), and `<Name>` its display label (e.g. `Steam`).

## What you will create

| Artifact | Path |
|----------|------|
| Native DTO types (optional) | `src/gamesources/<name>/<name>.types.ts` |
| Fetch component | `src/gamesources/<name>/<name>.api.ts` |
| Map component | `src/gamesources/<name>/<name>.mapper.ts` |
| Persistence + eligibility component | `src/gamesources/<name>/<name>.repository.ts` |
| Eligibility spec | `src/gamesources/<name>/<name>.repository.spec.ts` |
| Declaration entry | `src/gamesources/<name>/index.ts` (`defineGameSource(...)`) |

## Touch-point contract — every shared file you edit

Everything a platform-add touches **outside its own folder** is enumerated
here, each with a justification (spec FR-003). Nothing else may change:

| # | File | Why it must be edited | Justification |
|---|------|----------------------|---------------|
| 1 | `src/gamesources/index.ts` | Add one line to the `gameSources` array | Explicit registration — no filesystem auto-discovery; this list is the machinery's single bridge into the platform area, and the key union, display-name map, and Discord `choices` all derive from it |
| 2 | `src/database/entities/index.ts` | `export *` your catalog entity | Standard entity-registration rule (AGENTS.md) — required by any new catalog table, unchanged by this layout |
| 3 | `src/database/data-source-options.ts` | Add your entity to the `entities` array | Same standard rule: the TypeORM connection must know the table |

**Count**: registration proper is **1** shared file (the central list). The
pre-split layout needed **4** (`platform.constants.ts`, `platform.registry.ts`,
`platforms.module.ts`, the DTO), and the domain-key union + Discord `choices`
were two more edits the definition now absorbs. Files 2–3 are the database's
standard entity-registration pair, required identically before and after the
split — total shared files **3**, against a pre-split total of **6** (the same
pair plus the four registration files). The count has not increased (SC-001).

**Files you must NOT edit** — if a step seems to require one of these, the
registration is incomplete:

- `src/modules/platforms/` in its entirety — `generic-platform.ts` (the
  lifecycle), `platform.scheduler.ts` (the schedules), `platform.registry.ts`
  (composition), `platforms.module.ts` (DI wiring), `define-gamesource.ts`
  (the helper), `platform.types.ts` / `platform.tokens.ts` (contracts)
- `src/modules/broadcast/broadcast.service.ts` (delivery)
- any other platform's folder (`epic/`, `xbox/`, …)
- `src/database/migrations/` — migrations are generated, never hand-edited

## Step 1 — Native types (optional)

If your platform's API responses deserve named shapes, declare them in
`src/gamesources/<name>/<name>.types.ts` and import them with
`import type`. This folder owns them; nothing outside references them except
your own components.

## Step 2 — Fetch component (`<name>.api.ts`)

Implements `PlatformApi<TSource>`: one method, `fetch()`, returning the
platform's **native** API rows — never database entities, never mapped
games.

```ts
import { Injectable } from '@nestjs/common';
import type { PlatformApi } from '../../modules/platforms/platform.types.js';
import type { <Name>ApiGame } from './<name>.types.js';

@Injectable()
export class <Name>Api implements PlatformApi<<Name>ApiGame> {
  async fetch(): Promise<<Name>ApiGame[]> {
    // HTTP call(s) to the platform's catalog endpoint(s).
    // Any pagination/aggregation specific to this API lives here.
  }
}
```

## Step 3 — Map component (`<name>.mapper.ts`)

Implements `PlatformMapper<TSource, TGame>`: `toGame(source)` translates one
native row into the common `Game` model (optionally extended with
platform-specific fields, which persistence ignores).

- Return the mapped game to persist it.
- Return `null` to **skip** a row that does not qualify (this is where any
  "only these offers count" filter belongs — never in generic code).
- No persistence, no network, no `broadcasted` handling here: it must stay a
  pure, unit-testable translation.

```ts
import { Injectable } from '@nestjs/common';
import type {
  Game,
  PlatformMapper,
} from '../../modules/platforms/platform.types.js';
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

- `saveAll(games)` — `upsert(games, ['id'])` into your platform's catalog
  table. It must **never write the `broadcasted` column** (FR-001): sync
  re-fetches must not resurrect or stomp announcement state.
- `findPending(now)` — returns only games eligible for announcement, via a
  **pure exported criteria function**. This is where your platform's
  eligibility rules live (FR-005): a start/end offer window, a launch date,
  a platform's own notion of "free" — whatever the platform means.
- `markBroadcasted(game)` — sets `broadcasted: true` and saves. The generic
  lifecycle only ever calls it *after* delivery succeeded, so you never make
  that ordering decision yourself.

```ts
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { CatalogMyplatform } from '../../database/entities/index.js';
import type {
  Game,
  PlatformRepository,
} from '../../modules/platforms/platform.types.js';

export function <name>PendingCriteria(now: Date) {
  return {
    broadcasted: false,
    // platform-specific eligibility, e.g. window comparisons:
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
`src/database/data-source-options.ts` (touch points 2–3 above), with a
generated migration (never `synchronize`). Follow the repository's standard
database workflow if the table does not exist yet.

## Step 5 — Eligibility spec

Write `src/gamesources/<name>/<name>.repository.spec.ts` covering each
rule of your criteria function (pending / not-pending cases), the same way
the existing platform criteria are pinned. These specs are part of the
feature's definition of done (FR-016).

## Step 6 — Declaration + registration

Registration is configuration, and it is the only shared code you touch:

1. **Declaration** — in `src/gamesources/<name>/index.ts` export your
   complete registration with one `defineGameSource(...)` call:

   ```ts
   import { defineGameSource } from '../../modules/platforms/define-gamesource.js';
   // ... your component imports

   export const STEAM_PLATFORM = defineGameSource({
     platform: 'steam', // the identity — a plain literal, not a shared enum
     name: 'Steam', // display name in command replies, logs, AND Discord choices
     message: 'New free game available on **Steam**', // announcement text (FR-003)
     api: SteamApi,
     mapper: SteamMapper,
     repository: SteamRepository,
   });
   ```

   Class references, not instances — the machinery wires them into providers
   itself. `defineGameSource` is pure declaration: it never registers or
   performs I/O. The `platform` literal *is* your platform's key: the
   `GamePlatformType` union is `(typeof gameSources)[number]['type']`, so
   there is no shared enum file to edit.

2. **Central list** — in `src/gamesources/index.ts` import your definition
   and add it to the array (one entry per folder):

   ```ts
   export const gameSources = [EPIC_PLATFORM, XBOX_PLATFORM, STEAM_PLATFORM] as const;
   //                          ^ one line added — everything else derives from this list
   ```

   The registry, the scheduler, the display-name map, the key union, and the
   Discord `choices` for `/subscribe`, `/sync`, and `/broadcast` all read this
   list; there is nothing else to wire.

That's the full integration. Schedules, admin commands, and broadcast delivery
pick the new platform up from the registry automatically — there is no
per-platform cron, command branch, or broadcast method to write, and no
Discord DTO to edit (the choices are derived from the definitions).

## Step 7 — Verify

```bash
npm run type:check
npm run lint                    # read-only; never --fix
npm run format                  # if Prettier flags your files
npm test -- gamesources/<name>  # your criteria + any component specs
```

Then the full gate before opening a PR (all must pass):

```bash
npx prettier --check "src/**/*.ts" "test/**/*.ts"
npm run type:check
npm run lint
npm run build
npm run test -- --coverage
npm run test:e2e -- --coverage
```

Self-check against the touch-point contract: `git diff --stat` should show
only your new `gamesources/<name>/` folder plus the three enumerated shared
files — no changes under `src/modules/platforms/`, none to
`broadcast.service.ts`, none to another platform's files, and no
platform-specific lifecycle, scheduled job, or broadcast method anywhere in
the diff.

## Behavior you inherit for free

- Sync runs hourly on the hour, announcements at minute 10 past (A-003) — no
  schedule to declare.
- Announcement text comes from your declaration's `message`; embeds, target
  channel resolution, and per-channel error handling come from delivery.
- A game is marked announced only after a successful send; total delivery
  failure leaves it pending for the next pass, zero-subscriber platforms are
  marked to keep the queue bounded (FR-009/FR-010, A-005).
- One platform failing a scheduled pass never blocks the others (FR-004).
