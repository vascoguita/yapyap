import { availableParallelism } from 'node:os';
import { MUTATION_SCOPE } from './scripts/src/mutation/scope.ts';

export default {
  packageManager: 'pnpm',
  // The Vitest runner plugin does not activate mutants under Vitest 5 (every
  // mutant survives), so each mutant runs the suite as a command and is
  // switched on through the environment instead (ADR 0008, C12).
  testRunner: 'command',
  commandRunner: { command: 'pnpm exec vitest run --config vitest.mutation.config.ts' },
  // Each mutant runs a whole Vitest suite. One per CPU leaves no headroom on a
  // busy machine, and slow runs then show up as timeouts instead of kills.
  concurrency: Math.max(1, Math.floor(availableParallelism() / 2)),
  mutate: [...MUTATION_SCOPE, '!**/*.test.ts', '!**/*.d.ts', '!**/bin/**'],
  thresholds: { high: 95, low: 90, break: 90 },
  reporters: ['clear-text', 'progress', 'html', 'json'],
  htmlReporter: { fileName: 'reports/mutation/index.html' },
  jsonReporter: { fileName: 'reports/mutation/mutation.json' },
  tempDirName: '.stryker-tmp',
  cleanTempDir: 'always',
};
