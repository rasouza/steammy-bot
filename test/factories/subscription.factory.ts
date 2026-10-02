import { Factory } from 'fishery';
import { Subscription } from '../../src/database/entities/index.js';
import { EPIC_PLATFORM } from '../../src/gamesources/epic/index.js';

/**
 * Fishery factory for the `Subscription` entity (composite PK: channel id +
 * platform + guild id). Builds a real entity instance via `new
 * Subscription()` — construction only, no database access; the specs
 * persist it through a TypeORM repository.
 *
 * Deterministic defaults: the active scenario's channel and guild, Epic
 * platform. Callers override per scenario with `build({ ... })`.
 */
export const subscriptionFactory = Factory.define<Subscription>(() => {
  const subscription = new Subscription();
  subscription.id = '150000000000000001';
  subscription.platform = EPIC_PLATFORM.type;
  subscription.guildId = 'dev-e2e-guild-active';
  return subscription;
});
