import { defineConfig } from 'vitest/config';

export default defineConfig({
  root: './',
  test: {
    include: ['**/*.e2e-spec.ts'],
    exclude: ['**/node_modules/**', '**/dist/**', '**/build/**'],
    globals: true,
    environment: 'node',
    // Database-backed specs share one Postgres: migrations must not race.
    fileParallelism: false,
    setupFiles: ['./test/setup/e2e-env.ts'],
  },
});
