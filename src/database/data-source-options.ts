import { join } from 'node:path';
import type { DataSourceOptions } from 'typeorm';

import { databaseConfig, type DatabaseConfig } from '../config';
import { CatalogEpic, CatalogXbox, Guild, Subscription } from './entities';

export const entities = [CatalogEpic, CatalogXbox, Guild, Subscription];

/**
 * `__dirname` resolves to `src/database` under ts-node (TypeORM CLI) and to
 * `dist/database` after `nest build`, so a single glob covers both.
 */
export const migrationsGlob = join(__dirname, 'migrations', '*.{ts,js}');

/**
 * The only options any caller is allowed to override.
 *
 * Deliberately narrow: `DataSourceOptions` is a union across every driver, and
 * spreading a union-typed overrides object into the result widens properties
 * (e.g. `password`) into a union of every driver's shape.
 */
export interface DataSourceOverrides {
  migrations?: string[];
  migrationsRun?: boolean;
}

/**
 * The single source of truth for the TypeORM connection, shared by the Nest
 * module (`database.module.ts`) and the CLI DataSource (`data-source.ts`).
 *
 * Kept free of Nest imports on purpose so the TypeORM CLI can load it.
 */
export function buildDataSourceOptions(
  config: DatabaseConfig,
  overrides: DataSourceOverrides = {},
): DataSourceOptions {
  return {
    type: config.type,
    host: config.host,
    port: config.port,
    ssl: config.ssl,
    username: config.username,
    password: config.password,
    database: config.database,
    schema: config.schema,
    entities,
    migrations: [migrationsGlob],
    migrationsTableName: 'migrations',
    logging: process.env.NODE_ENV === 'development',
    ...overrides,
  };
}

/**
 * Resolves the config straight from `process.env` for callers outside Nest,
 * such as the TypeORM CLI and `scripts/create-schema.ts`.
 */
export function loadDataSourceOptions(
  overrides: DataSourceOverrides = {},
): DataSourceOptions {
  return buildDataSourceOptions(databaseConfig(), overrides);
}
