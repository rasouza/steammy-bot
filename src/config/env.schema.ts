import { z } from 'zod';

/**
 * Parses a "true"/"false" style environment variable.
 * Anything other than an explicit "true" is treated as false.
 */
const booleanish = (defaultValue: 'true' | 'false') =>
  z
    .enum(['true', 'false'])
    .default(defaultValue)
    .transform((value) => value === 'true');

export const databaseSchema = z.object({
  DATABASE_HOST: z.string().min(1),
  DATABASE_PORT: z.coerce.number().int().positive().default(5432),
  DATABASE_NAME: z.string().min(1),
  DATABASE_USER: z.string().min(1),
  DATABASE_PASSWORD: z.string().min(1),
  DATABASE_SSL: booleanish('false'),
});

/**
 * Validates the whole environment at bootstrap.
 *
 * Must stay `.passthrough()`: ConfigModule hands the entire `process.env`
 * to this schema, so a strict object would reject every ambient variable
 * (PATH, USERNAME, ...) and prevent the app from booting.
 */
export const envSchema = z
  .object({
    /**
     * Deliberately has no default: an unset NODE_ENV must not silently
     * behave like development.
     */
    NODE_ENV: z.enum(['development', 'production', 'test']).optional(),
    BOT_TOKEN: z.string().min(1, 'BOT_TOKEN is required'),
    TEST_GUILD_ID: z.string().optional(),
    API_PORT: z.coerce.number().int().positive().default(4000),
    /**
     * Kill switch for the scheduled announcement pass (spec FR-013).
     * Defaults to TRUE: a missing variable must never mute announcements
     * on deploy (research R4) — set it to 'false' explicitly to disable.
     */
    BROADCAST_ENABLED: booleanish('true'),
    ...databaseSchema.shape,
  })
  .passthrough();

export type DatabaseEnv = z.infer<typeof databaseSchema>;
export type Env = z.infer<typeof envSchema>;
