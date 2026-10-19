import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      'apps/*/vitest.config.ts',
      'packages/*/vitest.config.ts',
      'plugins/*/vitest.config.ts',
    ],
    coverage: {
      provider: 'v8',
      include: ['apps/*/src/**', 'packages/*/src/**', 'plugins/*/src/**'],
      // Every exclusion must be justified in docs/adr/0005-test-strategy.md.
      exclude: ['**/*.d.ts', '**/*.test.ts'],
      thresholds: { lines: 100, branches: 100, functions: 100, statements: 100 },
      reporter: ['text', 'json-summary', 'lcov'],
    },
  },
});
