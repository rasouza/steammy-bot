![Open Source Love svg2](https://badges.frapsoft.com/os/v2/open-source.svg?v=103)

# Steammy

Steammy is a **Discord** bot built on **NestJS**, **[Necord](https://necord.org/)**, and **TypeORM**, designed to make announcements of new games arriving on popular platforms such as Microsoft Game Pass and Epic Games.

![discord message](assets/images/preview.png)

## Currently Integrated Platforms

- [x] Xbox Game Pass
- [ ] Sony PS+
- [x] Epic Games

## How to use

1. Invite Steammy to your server [here](https://discord.com/oauth2/authorize?client_id=1284565018788106273)
2. Run `/subscribe <platform>` in the channel where you want to receive announcements
3. Done! Just wait for upcoming game announcements

You can use `/unsubscribe <platform>` to stop a channel from receiving announcements.

### Available Commands

- `/subscribe <platform>` - Subscribe a channel to game news (`xbox`, `epic`)
- `/unsubscribe <platform>` - Unsubscribe a channel from game news
- `/ping` - Check bot latency
- `/invite` - Get bot invite link
- `/help` - View command help
- `/sync <platform>` - Manually sync catalog (Admin only)
- `/broadcast <platform>` - Manually trigger broadcast (Admin only)

## Development

Requires **Node.js >= 24.15.0** (see `.nvmrc`).

```bash
# Install dependencies
# --ignore-scripts works around a crash in necord's own postinstall on Windows.
npm install --ignore-scripts

# Start in watch mode
npm run start:dev

# Build for production (outputs to dist/)
npm run build

# Run the compiled build
npm run start:prod
```

### Scripts

| Script                                 | Description                                             |
| -------------------------------------- | ------------------------------------------------------- |
| `npm run start:dev`                    | Watch mode with `NODE_ENV=development`                  |
| `npm run build`                        | Compile TypeScript to `dist/`                           |
| `npm run start:prod`                   | Run the compiled `dist/main.js`                         |
| `npm run format`                       | Format `src/` and `test/` with Prettier                 |
| `npm run lint`                         | Type-aware lint with oxlint (read-only)                 |
| `npm run type:check`                   | Typecheck without emitting                              |
| `npm test`                             | Unit tests (Vitest)                                     |
| `npm run test:cov`                     | Unit tests with coverage report (CI uploads to Codecov) |
| `npm run test:e2e`                     | End-to-end tests (Vitest + supertest)                   |
| `npm run db:init`                      | Create the `steammy_bot` schema if it does not exist    |
| `npm run migration:generate -- <path>` | Generate a migration from entity changes                |
| `npm run migration:run`                | Apply pending migrations                                |
| `npm run migration:revert`             | Revert the last applied migration                       |
| `npm run migration:show`               | List migrations and their applied state                 |

TypeORM's CLI and `db:init` run from source through `tsx`, so migrations work
without a separate compile step. The CI gate runs, in this exact order:
`prettier --check` → `type:check` → `lint` → `build` → `test:cov` →
`test:e2e`. Unit-test coverage is uploaded to Codecov as an informational
report — it never blocks a merge.

> **Testing note**: Vitest transpiles with esbuild, which does not emit
> constructor-injection metadata (`design:paramtypes`). The current tests never
> boot a constructor-injected class; a future test that must do so needs explicit
> `@Inject(...)` decorators or an SWC transform plugin.

## Database

Schema is managed entirely by [TypeORM](https://typeorm.io/) migrations. The
`synchronize` flag is **not** used, so entities and the database can never
silently drift apart.

Dev and prod are **separate databases** that both use a schema named
`steammy_bot`. Only `DATABASE_HOST` and `DATABASE_PASSWORD` differ between
them, which keeps the schema literal inside generated migrations identical in
every environment.

Pending migrations are applied automatically on boot (`migrationsRun: true`),
so a deploy needs no extra step.

### Working with migrations

Run these against a database that is already fully migrated — `migration:generate`
diffs your entities against the live schema, so a stale database produces a
wrong migration.

```bash
# One-time per environment: create the schema
npm run db:init

# After changing an entity
npm run migration:generate -- src/database/migrations/AddCatalogColumn
npm run migration:run
```

Connection options live in `src/config` and are shared by the Nest module and
the TypeORM CLI. The environment is validated at boot with Zod, so a missing or
malformed variable fails immediately with a clear message instead of a cryptic
connection error.

## How to contribute: Adding more platforms

The full walkthrough lives in
[`docs/platform-integration.md`](docs/platform-integration.md). In short:

1. Create a new TypeORM catalog entity (`src/database/entities/catalog-myplatform.entity.ts`).
2. Register the entity in `src/database/entities/index.ts` and `src/database/data-source-options.ts`.
3. Generate a migration for it with `npm run migration:generate -- src/database/migrations/AddMyPlatform` and apply it with `npm run migration:run`.
4. Create the platform's components in `src/gamesources/myplatform/`: an API client (`myplatform.api.ts`), a mapper (`myplatform.mapper.ts`), and a repository with a pure pending-criteria function (`myplatform.repository.ts`), plus its eligibility spec — and export the platform's declaration with one `defineGameSource(...)` call in `myplatform/index.ts`.
5. Register the platform: one line in the central list `src/gamesources/index.ts` — the domain-key union, the display names, and the Discord `choices` for `/subscribe`, `/sync`, and `/broadcast` all derive from that list.
6. Run the guide's verification commands (`npm run type:check`, `npm run lint`, your focused specs, then the full CI gate).

No broadcast method, scheduled job, or edit to the generic lifecycle is
needed — the registry-driven scheduler and broadcast service pick the new
platform up automatically.
