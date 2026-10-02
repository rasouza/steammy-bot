import 'reflect-metadata';

import { config as loadEnv } from 'dotenv';
import { DataSource } from 'typeorm';

import { databaseConfig, type DatabaseConfig } from '../../config/index.js';
import {
  buildDataSourceOptions,
  loadDataSourceOptions,
} from '../data-source-options.js';

loadEnv({ quiet: true });

const SAFE_IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** The server-level database every PostgreSQL installation ships with. */
const MAINTENANCE_DATABASE = 'postgres';

/**
 * TypeORM never creates a Postgres schema on its own, and it creates the
 * `migrations` bookkeeping table inside `driver.options.schema`. Both mean
 * the target schema must already exist before any migration can run.
 *
 * The logical database is likewise never created by TypeORM, so this script
 * provisions both: `CREATE DATABASE` when the configured database is missing
 * (once per server — compose and CI create theirs, so this is usually a
 * no-op), then the schema (once per database).
 *
 * Safe to run repeatedly.
 */
async function main(): Promise<void> {
  const config = databaseConfig();
  const { schema } = config;

  if (!SAFE_IDENTIFIER.test(schema)) {
    throw new Error(
      `Refusing to create schema with an unsafe name: ${JSON.stringify(schema)}`,
    );
  }

  await ensureDatabase(config);

  const dataSource = new DataSource(loadDataSourceOptions({ migrations: [] }));

  await dataSource.initialize();

  try {
    await dataSource.query(`CREATE SCHEMA IF NOT EXISTS "${schema}"`);

    const rows = await dataSource.query<{ nspname: string }[]>(
      'SELECT nspname FROM pg_namespace WHERE nspname = $1',
      [schema],
    );

    console.log(
      rows.length > 0
        ? `Schema "${schema}" is ready.`
        : `Failed to create schema "${schema}".`,
    );

    if (rows.length === 0) {
      process.exitCode = 1;
    }
  } finally {
    await dataSource.destroy();
  }
}

/**
 * `CREATE DATABASE` cannot run inside a transaction and cannot target the
 * database it creates, so the existence check runs over a connection to the
 * maintenance database on the same server. No-op when the target already
 * exists (the normal case) or when it *is* the maintenance database.
 */
async function ensureDatabase(config: DatabaseConfig): Promise<void> {
  const target = config.database;

  if (target === MAINTENANCE_DATABASE) {
    return;
  }

  const maintenance = new DataSource(
    buildDataSourceOptions(
      { ...config, database: MAINTENANCE_DATABASE },
      { migrations: [] },
    ),
  );

  await maintenance.initialize();

  try {
    const rows = await maintenance.query<{ present: boolean }[]>(
      'SELECT EXISTS (SELECT 1 FROM pg_database WHERE datname = $1) AS present',
      [target],
    );

    if (rows[0]?.present) {
      console.log(`Database "${target}" is ready.`);
      return;
    }

    if (!SAFE_IDENTIFIER.test(target)) {
      throw new Error(
        `Refusing to create database with an unsafe name: ${JSON.stringify(target)}`,
      );
    }

    await maintenance.query(`CREATE DATABASE "${target}"`);
    console.log(`Database "${target}" created.`);
  } finally {
    await maintenance.destroy();
  }
}

main().catch((error: unknown) => {
  console.error(
    'Failed to initialise the database:',
    error instanceof Error ? error.message : error,
  );
  process.exit(1);
});
