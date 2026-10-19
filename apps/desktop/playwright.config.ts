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
  projects: [
    { name: 'e2e', testIgnore: 'smoke/**' },
    // Runs against an installed package; see YAPYAP_PACKAGED_EXECUTABLE.
    { name: 'smoke', testMatch: 'smoke/**/*.spec.ts' },
  ],
});
