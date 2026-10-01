/**
 * Deterministic environment for the e2e suite. Runs before each test file is
 * imported, so these defaults are in place before any config resolution:
 *
 * - the bundled compose Postgres (docker-compose.yml, defaults `steammy_dev`)
 *   unless the caller exports DATABASE_* explicitly;
 * - a dummy BOT_TOKEN: nothing in the suite can log in — the Discord client
 *   is a test double, never the real one.
 *
 * `??=` never overrides an exported value, so CI or a developer can point the
 * suite at another throwaway database without editing code.
 */
process.env.BOT_TOKEN ??= 'e2e-dummy-token';
process.env.DATABASE_HOST ??= '127.0.0.1';
process.env.DATABASE_PORT ??= '5432';
process.env.DATABASE_NAME ??= 'steammy_dev';
process.env.DATABASE_USER ??= 'steammy_dev';
process.env.DATABASE_PASSWORD ??= 'steammy_dev';
process.env.DATABASE_SSL ??= 'false';
