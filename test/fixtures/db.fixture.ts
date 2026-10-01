import { Pool } from 'pg';
import type { EntityManager } from 'typeorm';
import { DATABASE_SCHEMA } from '../../src/config/index.js';

/**
 * Database bootstrap shared by every e2e spec: schema creation and the
 * fixture-row purge. Both suites write rows prefixed `dev-`, which is exactly
 * what `purgeFixtureRows` deletes — tests can never touch rows they did not
 * create.
 */

/**
 * The Postgres schema must exist before TypeORM initializes: TypeORM never
 * creates a schema, and it creates the `migrations` bookkeeping table inside
 * it (same prerequisite as `npm run db:init`). Runs against the same
 * DATABASE_* connection the test module will use.
 */
export async function ensureDatabaseSchema(): Promise<void> {
  const pool = new Pool({
    host: process.env.DATABASE_HOST,
    port: Number(process.env.DATABASE_PORT ?? 5432),
    database: process.env.DATABASE_NAME,
    user: process.env.DATABASE_USER,
    password: process.env.DATABASE_PASSWORD,
    ssl: process.env.DATABASE_SSL === 'true',
  });

  try {
    await pool.query(`CREATE SCHEMA IF NOT EXISTS "${DATABASE_SCHEMA}"`);
  } finally {
    await pool.end();
  }
}

/**
 * Removes every fixture row from the previous test. Deleting the guilds
 * cascades to their subscriptions (FK `ON DELETE CASCADE`), so catalog rows
 * plus guilds are the whole cleanup. Raw SQL is schema-qualified by hand:
 * TypeORM only qualifies the SQL it generates itself, never `em.query`.
 */
export async function purgeFixtureRows(em: EntityManager): Promise<void> {
  await em.query(
    `DELETE FROM "${DATABASE_SCHEMA}".catalog_epic WHERE id LIKE 'dev-%'`,
  );
  await em.query(
    `DELETE FROM "${DATABASE_SCHEMA}".catalog_xbox WHERE id LIKE 'dev-%'`,
  );
  await em.query(
    `DELETE FROM "${DATABASE_SCHEMA}".guild WHERE id LIKE 'dev-%'`,
  );
}
