import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      'apps/*/vitest.config.ts',
      'packages/*/vitest.config.ts',
      'plugins/*/vitest.config.ts',
      'scripts/vitest.config.ts',
    ],
    coverage: {
      provider: 'v8',
      include: [
        'apps/*/src/**/*.{ts,tsx}',
        'packages/*/src/**/*.ts',
        'plugins/*/src/**/*.{ts,tsx}',
        'scripts/src/**/*.ts',
      ],
      // Every exclusion must be justified in docs/adr/0005-test-strategy.md.
      exclude: [
        '**/*.d.ts',
        '**/*.test.ts',
        '**/*.test.tsx',
        'apps/desktop/src/main/index.ts',
        'apps/desktop/src/preload/*/index.ts',
        'scripts/src/bin/**',
        'packages/*/src/bin/**',
      ],
      thresholds: { lines: 100, branches: 100, functions: 100, statements: 100 },
      reporter: ['text', 'json-summary', 'lcov'],
    },
  },
});
