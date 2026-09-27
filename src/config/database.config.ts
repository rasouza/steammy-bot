import { registerAs } from '@nestjs/config';

import { databaseSchema, type DatabaseEnv } from './env.schema';

export interface DatabaseConfig {
  type: 'postgres';
  host: string;
  port: number;
  ssl: boolean;
  username: string;
  password: string;
  database: string;
  /**
   * Hardcoded on purpose. Both environments (dev and prod) are separate
   * databases that use this exact schema name, which keeps the schema
   * literal baked into generated migrations identical everywhere.
   */
  schema: string;
}

export const DATABASE_SCHEMA = 'steammy_bot';

/**
 * Callable without Nest's DI container, which lets the TypeORM CLI reuse it.
 * See `src/database/data-source-options.ts`.
 */
export default registerAs('database', (): DatabaseConfig => {
  const env: DatabaseEnv = databaseSchema.parse(process.env);

  return {
    type: 'postgres',
    host: env.DATABASE_HOST,
    port: env.DATABASE_PORT,
    ssl: env.DATABASE_SSL,
    username: env.DATABASE_USER,
    password: env.DATABASE_PASSWORD,
    database: env.DATABASE_NAME,
    schema: DATABASE_SCHEMA,
  };
});
