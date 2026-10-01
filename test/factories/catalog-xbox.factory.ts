import { Factory } from 'fishery';
import { CatalogXbox } from '../../src/database/entities/index.js';

/**
 * Fishery factory for `CatalogXbox`. Builds a real entity instance via
 * `new CatalogXbox()` — construction only, no database access; the specs
 * persist it through a TypeORM repository.
 *
 * Deterministic defaults: a pending fixture offer — `broadcasted: false`,
 * `dev-`-prefixed fixture id. Callers override per scenario with
 * `build({ ... })`.
 */
export const catalogXboxFactory = Factory.define<CatalogXbox>(() => {
  const game = new CatalogXbox();
  game.id = 'dev-xbox-pending-offer';
  game.title = 'Fixture Xbox Game';
  game.description = 'A deterministic fixture offer.';
  game.price = 0;
  game.size = null;
  game.developer = 'Fixture Studio';
  game.image = null;
  game.broadcasted = false;
  return game;
});
