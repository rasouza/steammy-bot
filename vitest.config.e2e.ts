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
    coverage: {
      provider: 'v8',
      // Separate from the unit report so the unit and e2e coverage runs
      // never clobber each other — coverage cleans only its own directory.
      // Codecov merges both lcov uploads into one report per commit.
      reportsDirectory: './coverage-e2e',
      include: ['src/**/*.ts'],
      reporter: ['text', 'lcov'],
    },
  },
});
