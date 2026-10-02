import type { EntityManager } from 'typeorm';
import {
  CatalogEpic,
  CatalogXbox,
  Guild,
  Subscription,
} from '../../src/database/entities/index.js';

/**
 * Clears the E2E tables. This intentionally removes every row in those tables;
 * E2E tests must use the dedicated test database.
 */
export async function cleanTestDatabase(em: EntityManager): Promise<void> {
  await em.getRepository(CatalogEpic).deleteAll();
  await em.getRepository(CatalogXbox).deleteAll();
  await em.getRepository(Subscription).deleteAll();
  await em.getRepository(Guild).deleteAll();
}
