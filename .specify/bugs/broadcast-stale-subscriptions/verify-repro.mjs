/**
 * Post-fix verification for `.specify/bugs/broadcast-stale-subscriptions/`.
 *
 * Read-only: the only network traffic is SELECTs against the database. The
 * Discord client and both catalog repositories are stubs, so nothing is
 * written anywhere and no Discord API call is made.
 *
 * Two things are proven against REAL data:
 *   1. The TypeORM query shape added by the fix
 *      (`find({ where, relations: { guild: true } })`) actually populates
 *      `guild.deleted` — cross-checked against a raw JOIN.
 *   2. The compiled `BroadcastService` (dist/) no longer fetches channels
 *      whose guild is soft-deleted, while still fetching every live one.
 *
 * Run from the repository root:  node .specify/bugs/<slug>/verify-repro.mjs
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = process.cwd();

function loadEnv(file) {
  const env = {};
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    if (!line.trim() || line.trim().startsWith('#')) continue;
    const i = line.indexOf('=');
    if (i === -1) continue;
    const key = line.slice(0, i).trim();
    const raw = line.slice(i + 1);
    const hash = raw.search(/\s#/);
    env[key] = (hash === -1 ? raw : raw.slice(0, hash))
      .trim()
      .replace(/^"(.*)"$/, '$1');
  }
  return env;
}

const fileUrl = (p) => pathToFileURL(resolve(ROOT, p)).href;

// Capture whatever the real Nest logger prints. ConsoleLogger writes straight
// to process.stdout/stderr unless forceConsole is set, so the streams are
// wrapped rather than console.*; WARN/DEBUG lines are asserted, not eyeballed.
const captured = { stdout: [], stderr: [] };
const stripAnsi = (s) => s.replace(/\u001b\[[0-9;]*m/g, '');
const writeOut = process.stdout.write.bind(process.stdout);
const writeErr = process.stderr.write.bind(process.stderr);
const captureStream = (bucket) => (chunk) => {
  captured[bucket].push(stripAnsi(String(chunk)));
  return true;
};
process.stdout.write = captureStream('stdout');
process.stderr.write = captureStream('stderr');
const out = (line) => writeOut(`${line}\n`);

const checks = [];
const record = (name, pass, detail) => checks.push({ name, pass, detail });

let summary = null;
let exitCode = 0;

try {
  const env = loadEnv(resolve(ROOT, '.env'));
  const sslOn = /^(true|1|yes)$/i.test(env.DATABASE_SSL || '');

  await import('reflect-metadata');
  const { DataSource } = await import('typeorm');
  const { ChannelType } = await import('discord.js');
  const { Subscription } = await import(fileUrl('dist/database/entities/index.js'));
  const { entities } = await import(
    fileUrl('dist/database/data-source-options.js')
  );
  const { BroadcastService } = await import(
    fileUrl('dist/modules/broadcast/broadcast.service.js')
  );
  const { GameEmbedService } = await import(
    fileUrl('dist/modules/broadcast/game-embed.service.js')
  );

  // ---- 1. The query shape, against the real database --------------------
  const ds = new DataSource({
    type: 'postgres',
    host: env.DATABASE_HOST,
    port: Number(env.DATABASE_PORT),
    database: env.DATABASE_NAME,
    username: env.DATABASE_USER,
    password: env.DATABASE_PASSWORD,
    ssl: sslOn ? { rejectUnauthorized: false } : false,
    schema: 'steammy_bot',
    entities,
  });
  await ds.initialize();

  let subs;
  let raw;
  try {
    subs = await ds.getRepository(Subscription).find({
      where: { platform: 'xbox' },
      relations: { guild: true },
    });
    raw = await ds.query(
      `SELECT s.id, s.platform, g.deleted
         FROM steammy_bot.subscription s
         JOIN steammy_bot.guild g ON g.id = s.guild_id
        WHERE s.platform = 'xbox'`,
    );
  } finally {
    await ds.destroy();
  }

  const rawDeleted = new Map(
    raw.map((r) => [`${r.id}|${r.platform}`, Boolean(r.deleted)]),
  );
  const relationLoaded = subs.every((s) => s.guild && typeof s.guild.deleted === 'boolean');
  const relationMatchesJoin = subs.every(
    (s) => rawDeleted.get(`${s.id}|${s.platform}`) === s.guild.deleted,
  );

  const deletedRows = subs.filter((s) => s.guild.deleted);
  const liveRows = subs.filter((s) => !s.guild.deleted);

  record(
    'relations:{guild:true} populates guild.deleted (real TypeORM query)',
    relationLoaded,
    `${subs.length} xbox rows returned, ${subs.filter((s) => s.guild).length} carry a guild relation`,
  );
  record(
    'relation values match a raw JOIN cross-check',
    relationMatchesJoin,
    `${subs.length}/${subs.length} rows agree`,
  );

  // ---- 2. The compiled BroadcastService, against those real rows --------
  const fetched = [];
  const client = {
    channels: {
      fetch: async (id) => {
        fetched.push(id);
        return {
          type: ChannelType.GuildText,
          name: 'verify-channel',
          guild: { name: 'verify-guild' },
          send: async () => undefined,
        };
      },
    },
  };

  const subscriptionRepository = {
    find: async (options = {}) =>
      subs.filter((s) => !options.where || s.platform === options.where.platform),
  };
  const xboxRepository = {
    find: async () => [
      { id: 'verify-game', title: 'Verify Game', description: 'verification' },
    ],
    save: async (entity) => entity,
  };
  const epicRepository = {
    find: async () => [],
    save: async (entity) => entity,
  };

  const service = new BroadcastService(
    client,
    epicRepository,
    xboxRepository,
    subscriptionRepository,
    new GameEmbedService(),
  );

  await service.broadcastXbox();

  const deletedIds = new Set(deletedRows.map((s) => s.id));
  const fetchedFromDeleted = fetched.filter((id) => deletedIds.has(id));
  const skippedLogged = captured.stdout.filter((l) =>
    l.includes('Skipping broadcast to channel'),
  );
  const warns = captured.stdout.filter((l) =>
    l.includes('Could not send broadcast to channel'),
  );

  record(
    'no channel fetch for any soft-deleted-guild subscription',
    fetchedFromDeleted.length === 0,
    `${fetchedFromDeleted.length} of ${deletedRows.length} orphan rows fetched`,
  );
  record(
    'every live-guild subscription is still fetched (guard not over-filtering)',
    fetched.length === liveRows.length,
    `fetched ${fetched.length}, live rows ${liveRows.length}`,
  );
  record(
    'one debug skip line per ignored orphan row',
    skippedLogged.length === deletedRows.length,
    `debug lines ${skippedLogged.length}, orphan rows ${deletedRows.length}`,
  );
  record(
    'no WARN lines emitted for the ignored orphan rows',
    warns.length === 0,
    `captured WARN lines: ${warns.length}`,
  );

  // Pre-fix behaviour of the same rows, for the before/after comparison:
  // the old loop had no guard, so it called fetch() for every row.
  summary = {
    total: subs.length,
    live: liveRows.length,
    deleted: deletedRows.length,
    fetched: fetched.length,
  };
} catch (error) {
  record(
    'verification script ran without error',
    false,
    error?.stack || String(error),
  );
  exitCode = 1;
} finally {
  process.stdout.write = writeOut;
  process.stderr.write = writeErr;
}

if (summary) {
  out('');
  out('== Summary ==');
  out(`xbox subscription rows (real DB):     ${summary.total}`);
  out(`  live guilds:                        ${summary.live}`);
  out(`  soft-deleted guilds (the bug):      ${summary.deleted}`);
  out(
    `pre-fix fetch() calls per broadcast:  ${summary.total}  (=> ~${summary.deleted} WARN lines)`,
  );
  out(`post-fix fetch() calls per broadcast: ${summary.fetched}`);
}
out('');
out('== Checks ==');
for (const c of checks) {
  out(`${c.pass ? 'PASS' : 'FAIL'}  ${c.name}  [${c.detail}]`);
}
if (captured.stderr.length > 0) {
  out('== stderr captured during run ==');
  for (const line of captured.stderr) writeErr(`  ${line}\n`);
}

if (checks.some((c) => !c.pass)) exitCode = 1;
out(exitCode === 0 ? '\nRESULT: PASS' : '\nRESULT: FAIL');
process.exit(exitCode);
