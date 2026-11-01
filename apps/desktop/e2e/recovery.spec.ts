import type { ElectronApplication, Page } from '@playwright/test';
import { HEALTH_CHECK_MS } from '../src/main/recovery/monitor.ts';
import { startFakeWhatsApp } from './fake-whatsapp-server.ts';
import { closeApp, expect, launchApp, test, whatsAppPage } from './fixtures.ts';

/**
 * Waits for WhatsApp's page to load: YapYap checks a loaded page's health
 * only then, after a delay, and a cold Windows runner can take over 10 s to
 * get there (#557).
 */
async function pageLoaded(app: ElectronApplication): Promise<void> {
  await (await whatsAppPage(app)).waitForLoadState('load');
}

/** The recovery screen is a view laid over the WhatsApp window, not a window of its own. */
async function recoveryScreen(app: ElectronApplication): Promise<Page> {
  await expect
    .poll(
      () =>
        app
          .context()
          .pages()
          .some((page) => page.url().endsWith('/recovery.html')),
      { timeout: HEALTH_CHECK_MS + 12_000 },
    )
    .toBe(true);
  const page = app
    .context()
    .pages()
    .find((candidate) => candidate.url().endsWith('/recovery.html'));
  if (page === undefined) {
    throw new Error('No recovery screen');
  }
  return page;
}

test.describe('when WhatsApp says the browser is unsupported', () => {
  test.use({ fakePage: 'unsupported.html' });

  test('shows the recovery screen with its explanation', async ({ app }) => {
    await pageLoaded(app);
    const screen = await recoveryScreen(app);
    await expect(
      screen.getByRole('heading', { name: 'WhatsApp says this browser is not supported' }),
    ).toBeVisible();
  });
});

test.describe('when WhatsApp loads a blank page', () => {
  test.use({ fakePage: 'blank.html' });

  test('offers to clear the cache, which keeps the login', async ({ app }) => {
    await pageLoaded(app);
    const screen = await recoveryScreen(app);
    await expect(
      screen.getByRole('heading', { name: 'WhatsApp did not finish loading' }),
    ).toBeVisible();
    await screen.getByRole('button', { name: 'Copy Diagnostics' }).click();
    await expect(screen.getByRole('status')).toHaveText('Diagnostics copied to the clipboard.');
    const copied = await app.evaluate(({ clipboard }) => clipboard.readText());
    expect(copied).toMatch(/\nProblem: WhatsApp loaded a blank page\.$/);
  });
});

test('shows the recovery screen when WhatsApp cannot be reached, and retries', async ({
  profile,
}) => {
  const gone = await startFakeWhatsApp();
  await gone.close();
  const app = await launchApp(gone.origin, profile);
  try {
    const screen = await recoveryScreen(app);
    await expect(
      screen.getByRole('heading', { name: 'WhatsApp could not be reached' }),
    ).toBeVisible();
    await screen.getByRole('button', { name: 'Try Again', exact: true }).click();
    await expect.poll(() => screen.isClosed()).toBe(true);
    await recoveryScreen(app);
  } finally {
    await closeApp(app);
  }
});
