import { defineConfig } from 'vitest/config';

// Stryker's Vitest runner cannot place mutants into multi-project runs, so
// mutation testing uses this single flat project over the same test files.
export default defineConfig({
  test: {
    include: [
      'apps/*/src/**/*.test.ts',
      'packages/*/src/**/*.test.ts',
      'plugins/*/src/**/*.test.ts',
      'scripts/src/**/*.test.ts',
    ],
    environment: 'node',
  },
});
