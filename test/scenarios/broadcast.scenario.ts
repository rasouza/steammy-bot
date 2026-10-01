import type { EntityManager } from 'typeorm';
import {
  CatalogEpic,
  CatalogXbox,
  Guild,
  Subscription,
} from '../../src/database/entities/index.js';

/**
 * The scenario layer: factories build individual entities, this composes them
 * into the database state a broadcast test asserts against. A test declares
 * exactly which catalog rows exist, which guilds the bot serves (or has
 * left), and which channels subscribe to which platform — nothing is
 * inferred, so the data a reader sees in the test is the data that exists.
 *
 * Persisted in FK-safe order (guilds → subscriptions → games). Catalog rows
 * are routed to their table by entity type, so one call can seed both
 * platforms. Deliberately not a fixture framework: no defaults, no DSL, one
 * function.
 */
export interface BroadcastScenario {
  games?: (CatalogEpic | CatalogXbox)[];
  guilds?: Guild[];
  subscriptions?: Subscription[];
}

export async function createBroadcastScenario(
  manager: EntityManager,
  scenario: BroadcastScenario,
): Promise<void> {
  const { games = [], guilds = [], subscriptions = [] } = scenario;

  if (guilds.length > 0) {
    await manager.getRepository(Guild).save(guilds);
  }
  if (subscriptions.length > 0) {
    await manager.getRepository(Subscription).save(subscriptions);
  }

  const epicGames = games.filter(
    (game): game is CatalogEpic => game instanceof CatalogEpic,
  );
  const xboxGames = games.filter(
    (game): game is CatalogXbox => game instanceof CatalogXbox,
  );
  if (epicGames.length > 0) {
    await manager.getRepository(CatalogEpic).save(epicGames);
  }
  if (xboxGames.length > 0) {
    await manager.getRepository(CatalogXbox).save(xboxGames);
  }
}
