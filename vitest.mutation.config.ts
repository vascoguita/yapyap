import { defineConfig } from 'vitest/config';

// Stryker's Vitest runner cannot place mutants into multi-project runs, so
// mutation testing uses this single flat project over the same test files.
export default defineConfig({
  test: {
    include: [
      'apps/*/src/**/*.test.ts',
      'packages/*/src/**/*.test.ts',
      'extensions/*/src/**/*.test.ts',
      'scripts/src/**/*.test.ts',
    ],
    environment: 'node',
    setupFiles: ['vitest.mutation.setup.ts'],
    // Stryker already runs one suite per CPU; a worker pool inside each suite
    // oversubscribes the machine until mutants time out instead of failing.
    maxWorkers: 1,
  },
});
