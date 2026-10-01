import { Factory } from 'fishery';
import { CatalogEpic } from '../../src/database/entities/index.js';
import { PENDING_GAME_ID } from '../fixtures/broadcast.fixture.js';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Fishery factory for the `CatalogEpic` entity. Builds a real entity
 * instance via `new CatalogEpic()` — construction only, no database access;
 * the specs persist it through a TypeORM repository.
 *
 * Deterministic defaults: the pending fixture offer — inside its window,
 * `broadcasted: false`, `dev-`-prefixed id (so `purgeFixtureRows` owns the
 * row). Callers override per scenario with `build({ ... })`.
 */
export const catalogEpicFactory = Factory.define<CatalogEpic>(() => {
  const game = new CatalogEpic();
  game.id = PENDING_GAME_ID;
  game.title = 'Fixture Free Game';
  game.description = 'A deterministic fixture offer.';
  game.price = 0;
  game.size = null;
  game.developer = 'Fixture Studio';
  game.image = null;
  game.broadcasted = false;
  game.offer_start_at = new Date(Date.now() - DAY_MS);
  game.offer_end_at = new Date(Date.now() + 30 * DAY_MS);
  return game;
});
