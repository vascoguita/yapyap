import type { ElectronApplication, Page } from '@playwright/test';
import { startFakeWhatsApp } from './fake-whatsapp-server.ts';
import { expect, launchApp, test } from './fixtures.ts';

/** The recovery screen is a view laid over the WhatsApp window, not a window of its own. */
async function recoveryScreen(app: ElectronApplication): Promise<Page> {
  await expect
    .poll(
      () =>
        app
          .context()
          .pages()
          .some((page) => page.url().endsWith('/recovery.html')),
      {
        timeout: 20_000,
      },
    )
    .toBe(true);
  const page = app
    .context()
    .pages()
    .find((candidate) => candidate.url().endsWith('/recovery.html'));
  if (page === undefined) throw new Error('No recovery screen');
  return page;
}

test.describe('when WhatsApp says the browser is unsupported', () => {
  test.use({ fakePage: 'unsupported.html' });

  test('shows the recovery screen with its explanation', async ({ app }) => {
    const screen = await recoveryScreen(app);
    await expect(
      screen.getByRole('heading', { name: 'WhatsApp says this browser is not supported' }),
    ).toBeVisible();
  });
});

test.describe('when WhatsApp loads a blank page', () => {
  test.use({ fakePage: 'blank.html' });

  test('offers to clear the cache, which keeps the login', async ({ app }) => {
    const screen = await recoveryScreen(app);
    await expect(
      screen.getByRole('heading', { name: 'WhatsApp did not finish loading' }),
    ).toBeVisible();
    await screen.getByRole('button', { name: 'Copy diagnostics' }).click();
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
    await screen.getByRole('button', { name: 'Try again', exact: true }).click();
    await expect.poll(() => screen.isClosed()).toBe(true);
    await recoveryScreen(app);
  } finally {
    await app.close();
  }
});
