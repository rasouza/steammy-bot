import type { EntityManager } from 'typeorm';
import { DATABASE_SCHEMA } from '../../src/config/index.js';

/**
 * Clears the E2E tables. This intentionally removes every row in those tables;
 * E2E tests must use the dedicated test database.
 */
export async function cleanTestDatabase(em: EntityManager): Promise<void> {
  await em.query(
    `TRUNCATE TABLE "${DATABASE_SCHEMA}".catalog_epic, "${DATABASE_SCHEMA}".catalog_xbox, "${DATABASE_SCHEMA}".guild CASCADE`,
  );
}
