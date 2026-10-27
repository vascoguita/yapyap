import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env['CI']),
  retries: 0,
  timeout: 60_000,
  reporter: process.env['CI'] ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: { trace: 'retain-on-failure' },
  // Fonts and native controls differ by OS, so each OS keeps its own baselines.
  snapshotPathTemplate: '{testDir}/__screenshots__/{platform}/{testFilePath}/{arg}{ext}',
  expect: { toHaveScreenshot: { maxDiffPixelRatio: 0.01, animations: 'disabled' } },
  projects: [
    { name: 'e2e', testIgnore: ['smoke/**', 'bench/**', 'screenshots/**'] },
    // Slow and machine-dependent, so it runs nightly rather than on every PR.
    { name: 'bench', testMatch: 'bench/**/*.spec.ts' },
    // Runs against an installed package; see YAPYAP_PACKAGED_EXECUTABLE.
    { name: 'smoke', testMatch: 'smoke/**/*.spec.ts' },
    // Takes the website's screenshots on the showcase page; run by `pnpm screenshots` (#384).
    { name: 'screenshots', testMatch: 'screenshots/**/*.spec.ts' },
  ],
});
