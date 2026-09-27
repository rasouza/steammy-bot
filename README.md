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

Requires **Node.js >= 22.12** (see `.nvmrc`).

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

| Script                    | Description                                          |
| ------------------------- | ---------------------------------------------------- |
| `npm run start:dev`       | Watch mode with `NODE_ENV=development`               |
| `npm run build`           | Compile TypeScript to `dist/`                        |
| `npm run start:prod`      | Run the compiled `dist/main.js`                      |
| `npm run format`          | Format `src/` and `test/` with Prettier              |
| `npm run lint`            | Lint and autofix with ESLint                         |
| `npm run type:check`      | Typecheck without emitting                           |
| `npm test`                | Unit tests (Jest)                                    |
| `npm run test:e2e`        | End-to-end tests (Jest + supertest)                  |
| `npm run db:init`         | Create the `steammy_bot` schema if it does not exist |
| `npm run migration:generate -- <path>` | Generate a migration from entity changes   |
| `npm run migration:run`   | Apply pending migrations                             |
| `npm run migration:revert` | Revert the last applied migration                   |
| `npm run migration:show`  | List migrations and their applied state              |

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

### Importing legacy data

The project was originally built on tscord + MikroORM against Supabase. To pull
that data into the current database, point `LEGACY_SUPABASE_CONNECTION_STRING` at
the old instance and run:

```bash
npm run db:import-legacy -- --dry-run   # report row counts, write nothing
npm run db:import-legacy                # copy in a single transaction
```

The script reads `catalog_epic`, `catalog_xbox`, `guild` and `subscription`.
Those four tables are column-for-column identical between the two ORMs, so rows
are copied verbatim. It verifies that live on both sides before copying, refuses
to run against a non-empty target unless given `--force`, and only ever issues
`SELECT`s against the legacy database.

`data`, `image`, `pastebin`, `stat` and `user` are not copied: the TypeORM
rewrite dropped them and nothing in the app reads them. If you want them later,
take a copy of the old database before deleting it.

## How to contribute: Adding more platforms

1. Create a new TypeORM catalog entity (`src/database/entities/catalog-myplatform.entity.ts`).
2. Register the entity in `src/database/entities/index.ts` and `src/database/data-source-options.ts`.
3. Generate a migration for it with `npm run migration:generate -- src/database/migrations/AddMyPlatform` and apply it with `npm run migration:run`.
4. Create a platform service (`src/modules/platforms/myplatform.service.ts`) with a `@Cron()` schedule to sync games.
5. Register the new platform choice in `src/shared/constants.ts` and `src/modules/subscription/dto/platform-option.dto.ts`.
6. Add broadcasting logic in `src/modules/broadcast/broadcast.service.ts`.