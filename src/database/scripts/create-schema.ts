import 'reflect-metadata';

import { config as loadEnv } from 'dotenv';
import { DataSource } from 'typeorm';

import { databaseConfig } from '../../config';
import { loadDataSourceOptions } from '../data-source-options';

loadEnv({ quiet: true });

const SAFE_IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;

/**
 * TypeORM never creates a Postgres schema on its own, and it creates the
 * `migrations` bookkeeping table inside `driver.options.schema`. Both mean
 * the target schema must already exist before any migration can run.
 *
 * Safe to run repeatedly.
 */
async function main(): Promise<void> {
  const { schema } = databaseConfig();

  if (!SAFE_IDENTIFIER.test(schema)) {
    throw new Error(
      `Refusing to create schema with an unsafe name: ${JSON.stringify(schema)}`,
    );
  }

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

main().catch((error: unknown) => {
  console.error(
    'Failed to initialise the database schema:',
    error instanceof Error ? error.message : error,
  );
  process.exit(1);
});
