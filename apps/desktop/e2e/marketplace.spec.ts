import { generateKeyPairSync } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { closeApp, expect, launchApp, test } from './fixtures.ts';
import { chromePage, clickMenu } from './extension-helpers.ts';
import { fakeMarketplace, marketplaceEnv } from './marketplace-helpers.ts';

test('installs a reviewed extension from the marketplace, through the usual consent', async ({
  fakeWhatsApp,
  profile,
}) => {
  const marketplace = await fakeMarketplace();
  const app = await launchApp(fakeWhatsApp.origin, profile, [], {
    env: marketplaceEnv(marketplace),
  });
  try {
    // The result shows in a message box, which would wait for a click on a real desktop.
    await app.evaluate(({ dialog }) => {
      dialog.showMessageBox = () => Promise.resolve({ response: 0, checkboxChecked: false });
    });
    await clickMenu(app, 'Extensions…');
    const extensions = await chromePage(app, '/extensions.html');
    await extensions.getByRole('tab', { name: 'Marketplace' }).click();
    await expect(extensions.getByRole('heading', { name: 'Hello' })).toBeVisible();
    await expect(extensions.getByText('Reviewed by YapYap')).toBeVisible();
    await extensions.getByRole('button', { name: 'Install Hello' }).click();
    const consent = await chromePage(app, '/extension-consent.html');
    await expect(consent.getByText(/YapYap reviewed this version/)).toBeVisible();
    const install = consent.getByRole('button', { name: 'Install' });
    // A reviewed extension needs no acknowledgement of risk, unlike one from a file.
    await expect(install).toBeEnabled();
    await Promise.all([consent.waitForEvent('close'), install.click().catch(() => undefined)]);
    // The extension is on disk, and the listing says so once it loads the list again.
    const records = () =>
      readFile(join(profile, 'extensions', '.extensions.json'), 'utf8').catch(() => '');
    await expect.poll(records, { timeout: 20_000 }).toContain('"org.example.hello"');
    await expect(
      extensions.locator('.marketplace').getByText('Installed', { exact: true }),
    ).toBeVisible({ timeout: 20_000 });
  } finally {
    await closeApp(app);
    marketplace.server.close();
  }
});

test('shows nothing it cannot verify', async ({ fakeWhatsApp, profile }) => {
  const marketplace = await fakeMarketplace();
  const stranger = generateKeyPairSync('ed25519').publicKey.export({ format: 'pem', type: 'spki' });
  const app = await launchApp(fakeWhatsApp.origin, profile, [], {
    env: {
      YAPYAP_TEST_MARKETPLACE_ORIGIN: marketplace.origin,
      YAPYAP_TEST_MARKETPLACE_ANCHOR: stranger,
    },
  });
  try {
    await clickMenu(app, 'Extensions…');
    const extensions = await chromePage(app, '/extensions.html');
    await extensions.getByRole('tab', { name: 'Marketplace' }).click();
    await expect(extensions.getByRole('alert')).toHaveText(/could not verify/);
    await expect(extensions.getByRole('heading', { name: 'Hello' })).toHaveCount(0);
  } finally {
    await closeApp(app);
    marketplace.server.close();
  }
});
