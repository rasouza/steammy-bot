import { defineConfig } from 'vitest/config';

export default defineConfig({
  root: './',
  test: {
    include: ['**/*.spec.ts'],
    exclude: ['**/*.e2e-spec.ts', '**/node_modules/**', '**/dist/**', '**/build/**'],
    globals: true,
    environment: 'node',
    coverage: {
      provider: 'v8',
      reportsDirectory: './coverage',
      include: ['src/**/*.ts'],
    },
  },
});
