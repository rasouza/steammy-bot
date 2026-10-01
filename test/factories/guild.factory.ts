import { Factory } from 'fishery';
import { Guild } from '../../src/database/entities/index.js';
import { ACTIVE_GUILD_ID } from '../fixtures/broadcast.fixture.js';

/**
 * Fishery factory for the `Guild` entity. Builds a real entity instance via
 * `new Guild()` — construction only: no repositories, no `EntityManager`, no
 * database access. Persistence stays visible in the specs, which save the
 * built instance through a TypeORM repository.
 *
 * Deterministic defaults: the active scenario guild (`dev-`-prefixed, so
 * `purgeFixtureRows` owns the row), `deleted: false`, no randomness.
 * Callers override per scenario with `build({ ... })`.
 */
export const guildFactory = Factory.define<Guild>(() => {
  const guild = new Guild();
  guild.id = ACTIVE_GUILD_ID;
  guild.prefix = null;
  guild.deleted = false;
  guild.lastInteract = new Date();
  return guild;
});
