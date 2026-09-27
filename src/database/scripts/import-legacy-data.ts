import 'reflect-metadata';

import { config as loadEnv } from 'dotenv';
import { Client } from 'pg';
import { z } from 'zod';

import { databaseConfig, type DatabaseConfig } from '../../config';

loadEnv({ quiet: true });

const SAFE_IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;
const BATCH_SIZE = 500;

const legacyEnv = z.object({
  LEGACY_SUPABASE_CONNECTION_STRING: z
    .string()
    .min(1, 'LEGACY_SUPABASE_CONNECTION_STRING is required'),
});

/**
 * Copied in foreign-key order: a subscription row points at a guild, so the
 * guilds have to land first.
 *
 * The column lists are explicit on both the read and the write side. The legacy
 * tables were produced by MikroORM and these by TypeORM, and although the two
 * schemas were verified to match exactly, `select *` would silently corrupt the
 * data the day either side gains a column.
 *
 * `data`, `image`, `pastebin`, `stat` and `user` are deliberately absent: the
 * TypeORM rewrite dropped them and nothing in the app reads them.
 */
const TABLES: { name: string; columns: string[] }[] = [
  {
    name: 'guild',
    columns: [
      'id',
      'prefix',
      'deleted',
      'last_interact',
      'created_at',
      'updated_at',
    ],
  },
  {
    name: 'subscription',
    columns: ['id', 'platform', 'guild_id', 'created_at', 'updated_at'],
  },
  {
    name: 'catalog_epic',
    columns: [
      'id',
      'title',
      'price',
      'size',
      'developer',
      'image',
      'description',
      'broadcasted',
      'offer_start_at',
      'offer_end_at',
      'created_at',
      'updated_at',
    ],
  },
  {
    name: 'catalog_xbox',
    columns: [
      'id',
      'title',
      'price',
      'size',
      'developer',
      'image',
      'description',
      'broadcasted',
      'created_at',
      'updated_at',
    ],
  },
];

/** Both ends of the copy are plain `pg` clients, so they share this shape. */
type Queryable = Pick<Client, 'query'>;

/**
 * Every identifier in this script is a compile-time constant or comes from the
 * validated database config, but the values are still interpolated into SQL, so
 * they are checked rather than trusted.
 */
function ident(name: string): string {
  if (!SAFE_IDENTIFIER.test(name)) {
    throw new Error(
      `Refusing to use an unsafe SQL identifier: ${JSON.stringify(name)}`,
    );
  }

  return `"${name}"`;
}

function parseArgs(): { dryRun: boolean; force: boolean } {
  const flags = new Set(process.argv.slice(2));

  return { dryRun: flags.has('--dry-run'), force: flags.has('--force') };
}

/**
 * Supabase's pooler accepts plaintext connections, so TLS is not implied by
 * anything: `pg` defaults to `ssl: false` and a connection string without an
 * `sslmode` parameter leaves it that way. The credentials would go out in the
 * clear. `rejectUnauthorized: false` matches Supabase's documented
 * `sslmode=require` behaviour for Node clients.
 */
async function openSource(connectionString: string): Promise<Client> {
  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 15000,
  });

  await client.connect();

  const stream = (
    client as unknown as { connection?: { stream?: { encrypted?: boolean } } }
  ).connection?.stream;

  if (stream?.encrypted !== true) {
    await client.end();
    throw new Error(
      'The legacy connection is not encrypted, refusing to send credentials in the clear.',
    );
  }

  return client;
}

/**
 * The target is opened with `pg` rather than through TypeORM on purpose:
 * `DataSource.query()` hands back the rows array directly, while
 * `QueryRunner.query()` and `pg` return a result envelope, so a single client
 * type keeps the two halves of the copy honest. The connection details still
 * come from the same `databaseConfig()` the app itself uses, so the host and
 * schema cannot drift from the running application.
 */
async function openTarget(config: DatabaseConfig): Promise<Client> {
  const client = new Client({
    host: config.host,
    port: config.port,
    user: config.username,
    password: config.password,
    database: config.database,
    ssl: config.ssl,
    connectionTimeoutMillis: 15000,
  });

  await client.connect();

  return client;
}

async function countRows(db: Queryable, schema: string, table: string) {
  const { rows } = await db.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM ${ident(schema)}.${ident(table)}`,
  );

  return rows[0].n;
}

async function columnsOf(
  db: Queryable,
  schema: string,
  table: string,
): Promise<string[]> {
  const { rows } = await db.query<{ column_name: string }>(
    `SELECT column_name
       FROM information_schema.columns
      WHERE table_schema = $1 AND table_name = $2
      ORDER BY column_name`,
    [schema, table],
  );

  return rows.map((row) => row.column_name);
}

/**
 * Reads a whole table in one statement rather than through a cursor. The legacy
 * endpoint is Supavisor in transaction mode (port 6543), which keeps no session
 * state between statements, so a server-side cursor would not survive the query
 * that opens it.
 */
async function copyTable(
  source: Queryable,
  target: Queryable,
  schema: string,
  table: { name: string; columns: string[] },
): Promise<number> {
  const { name, columns } = table;
  const columnList = columns.map(ident).join(', ');

  const { rows } = await source.query<Record<string, unknown>>(
    `SELECT ${columnList} FROM ${ident(schema)}.${ident(name)}`,
  );

  let inserted = 0;

  for (let offset = 0; offset < rows.length; offset += BATCH_SIZE) {
    const batch = rows.slice(offset, offset + BATCH_SIZE);
    const values: unknown[] = [];
    const tuples = batch.map((row) => {
      const placeholders = columns.map((column) => {
        values.push(row[column]);

        return `$${values.length}`;
      });

      return `(${placeholders.join(', ')})`;
    });

    await target.query(
      `INSERT INTO ${ident(schema)}.${ident(name)} (${columnList}) VALUES ${tuples.join(', ')}`,
      values,
    );

    inserted += batch.length;
  }

  return inserted;
}

async function main(): Promise<void> {
  const { dryRun, force } = parseArgs();
  const config = databaseConfig();
  const { schema } = config;
  const connectionString = legacyEnv.parse(
    process.env,
  ).LEGACY_SUPABASE_CONNECTION_STRING;

  const source = await openSource(connectionString);
  const target = await openTarget(config);

  try {
    console.log('Legacy source : supabase (read only)');
    console.log(
      `Target        : ${schema} @ ${config.database} on ${config.host}:${config.port}`,
    );
    console.log(
      `Mode          : ${
        dryRun
          ? 'dry run, no writes'
          : force
            ? 'forced truncate + copy'
            : 'copy'
      }`,
    );
    console.log('');

    // Schema compatibility is checked live rather than trusted from the
    // migration history, so the script stays safe if either database has
    // drifted since it was written.
    const problems: string[] = [];

    for (const table of TABLES) {
      const legacyColumns = await columnsOf(source, schema, table.name);
      const targetColumns = await columnsOf(target, schema, table.name);
      const absent = table.columns.filter((c) => !legacyColumns.includes(c));
      const missing = table.columns.filter((c) => !targetColumns.includes(c));
      const extra = legacyColumns.filter((c) => !table.columns.includes(c));

      if (absent.length > 0) {
        problems.push(
          `${table.name}: source lacks ${absent.join(', ')} that this script expects`,
        );
      }

      if (missing.length > 0) {
        problems.push(`${table.name}: target lacks ${missing.join(', ')}`);
      }

      if (extra.length > 0) {
        problems.push(
          `${table.name}: source has unexpected column(s) ${extra.join(', ')}, refusing to guess`,
        );
      }
    }

    if (problems.length > 0) {
      console.error('Schema check failed:');
      problems.forEach((problem) => console.error(`  - ${problem}`));
      process.exitCode = 1;
      return;
    }

    console.log(`Schema check   : all ${TABLES.length} tables match exactly`);
    console.log('');

    const plan: { table: string; source: number; target: number }[] = [];

    for (const table of TABLES) {
      plan.push({
        table: table.name,
        source: await countRows(source, schema, table.name),
        target: await countRows(target, schema, table.name),
      });
    }

    console.log('table              source   target');
    for (const row of plan) {
      console.log(
        `  ${row.table.padEnd(16)} ${String(row.source).padStart(6)}   ${String(row.target).padStart(6)}`,
      );
    }

    const occupied = plan.filter((row) => row.target > 0);
    if (occupied.length > 0 && !force) {
      console.error('');
      console.error(
        `Target already has data in: ${occupied.map((row) => row.table).join(', ')}`,
      );
      console.error('Re-run with --force to truncate those tables first.');
      process.exitCode = 1;
      return;
    }

    const total = plan.reduce((sum, row) => sum + row.source, 0);
    console.log('');
    console.log(`Total rows to copy: ${total}`);

    if (dryRun) {
      console.log('');
      console.log('Dry run complete. Nothing was written.');
      return;
    }

    await target.query('BEGIN');

    try {
      if (force) {
        await target.query(
          `TRUNCATE ${TABLES.map((table) => `${ident(schema)}.${ident(table.name)}`).join(', ')} RESTART IDENTITY CASCADE`,
        );
        console.log(`Truncated ${TABLES.length} tables.`);
      }

      for (const table of TABLES) {
        const inserted = await copyTable(source, target, schema, table);
        console.log(`  copied ${table.name.padEnd(16)} ${inserted} rows`);
      }

      await target.query('COMMIT');
    } catch (error) {
      await target.query('ROLLBACK');
      throw error;
    }

    console.log('');
    console.log('Verification');

    let failed = false;

    for (const row of plan) {
      const now = await countRows(target, schema, row.table);
      const ok = now === row.source;
      failed ||= !ok;
      console.log(
        `  ${ok ? 'ok  ' : 'FAIL'} ${row.table.padEnd(16)} ${now} of ${row.source} rows`,
      );
    }

    const { rows: orphans } = await target.query<{ n: number }>(
      `SELECT count(*)::int AS n
         FROM ${ident(schema)}."subscription" s
         LEFT JOIN ${ident(schema)}."guild" g ON g.id = s.guild_id
        WHERE g.id IS NULL`,
    );
    failed ||= orphans[0].n > 0;
    console.log(
      `  ${orphans[0].n === 0 ? 'ok  ' : 'FAIL'} orphaned subscriptions   ${orphans[0].n}`,
    );

    const { rows: split } = await target.query<{
      broadcasted: boolean;
      n: number;
    }>(
      `SELECT broadcasted, count(*)::int AS n
         FROM ${ident(schema)}."catalog_epic"
        GROUP BY broadcasted
        ORDER BY broadcasted`,
    );
    console.log(
      `  ..  catalog_epic broadcasted: ${split
        .map((row) => `${String(row.broadcasted)}=${row.n}`)
        .join(', ')}`,
    );

    if (failed) {
      process.exitCode = 1;
      return;
    }

    console.log('');
    console.log('Import complete.');
  } finally {
    await source.end();
    await target.end();
  }
}

main().catch((error: unknown) => {
  console.error(
    'Failed to import legacy data:',
    error instanceof Error ? error.message : error,
  );
  process.exit(1);
});
