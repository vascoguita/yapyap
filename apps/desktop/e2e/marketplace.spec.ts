import { generateKeyPairSync } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { ElectronApplication } from '@playwright/test';
import { closeApp, expect, launchApp, test } from './fixtures.ts';
import { chromePage, clickMenu } from './extension-helpers.ts';
import { AUTHOR_HOST, fakeMarketplace, marketplaceEnv } from './marketplace-helpers.ts';

/** The install results YapYap showed, as their message and detail. */
async function stubMessages(app: ElectronApplication): Promise<() => Promise<string[]>> {
  // The result shows in a message box, which would wait for a click on a real desktop.
  await app.evaluate(({ dialog }) => {
    const shown: string[] = [];
    Object.assign(globalThis, { marketplaceMessages: shown });
    dialog.showMessageBox = (options: unknown) => {
      const { message, detail } = options as { message?: string; detail?: string };
      shown.push(`${message ?? ''} ${detail ?? ''}`);
      return Promise.resolve({ response: 0, checkboxChecked: false });
    };
  });
  return () =>
    app.evaluate(
      () => (globalThis as { marketplaceMessages?: string[] }).marketplaceMessages ?? [],
    );
}

const recordsIn = (profile: string) => () =>
  readFile(join(profile, 'extensions', '.extensions.json'), 'utf8').catch(() => '');

test('installs a third-party extension from its author’s latest release, and offers the next one', async ({
  fakeWhatsApp,
  profile,
}) => {
  const marketplace = await fakeMarketplace();
  const app = await launchApp(fakeWhatsApp.origin, profile, [], {
    env: marketplaceEnv(marketplace),
  });
  try {
    await stubMessages(app);
    await clickMenu(app, 'Extensions…');
    const extensions = await chromePage(app, '/extensions.html');
    await extensions.getByRole('tab', { name: 'Marketplace' }).click();
    await expect(extensions.getByRole('heading', { name: 'Hello' })).toBeVisible();
    await expect(extensions.getByText('Third-party', { exact: true })).toBeVisible();
    await expect(extensions.getByText(`Downloads from ${AUTHOR_HOST}`)).toBeVisible();
    await extensions.getByRole('button', { name: 'Install Hello' }).click();
    const consent = await chromePage(app, '/extension-consent.html');
    await expect(
      consent.getByText(`It downloads from ${AUTHOR_HOST}, its author’s server`),
    ).toBeVisible();
    const install = consent.getByRole('button', { name: 'Install' });
    // Nobody reviewed it, so the user must accept the risk, as for a file.
    await expect(install).toBeDisabled();
    await consent.getByRole('checkbox').check();
    await Promise.all([consent.waitForEvent('close'), install.click().catch(() => undefined)]);
    await expect.poll(recordsIn(profile), { timeout: 20_000 }).toContain('"org.example.hello"');
    await expect(
      extensions.locator('.marketplace').getByText('Installed', { exact: true }),
    ).toBeVisible({ timeout: 20_000 });
    // The author releases 1.1.0 at the same address; opening the tab again offers it.
    marketplace.release('org.example.hello', '1.1.0');
    await extensions.getByRole('tab', { name: 'Installed' }).click();
    await extensions.getByRole('tab', { name: 'Marketplace' }).click();
    const update = extensions.getByRole('button', { name: 'Update Hello to 1.1.0' });
    await expect(update).toBeVisible({ timeout: 20_000 });
    // It asks for nothing new and is signed by the pinned key, so it installs without asking.
    await update.click();
    await expect.poll(recordsIn(profile), { timeout: 20_000 }).toMatch(/"version": ?"1\.1\.0"/);
  } finally {
    await closeApp(app);
    marketplace.server.close();
  }
});

test('refuses a third-party archive signed by a key other than the listed one', async ({
  fakeWhatsApp,
  profile,
}) => {
  const marketplace = await fakeMarketplace([
    {
      id: 'org.example.hello',
      name: 'Hello',
      summary: 'Says hello in your drafts.',
      review: 'unreviewed',
      capabilities: ['composer:insert-draft'],
      hosts: [],
      wrongKey: true,
    },
  ]);
  const app = await launchApp(fakeWhatsApp.origin, profile, [], {
    env: marketplaceEnv(marketplace),
  });
  try {
    const messages = await stubMessages(app);
    await clickMenu(app, 'Extensions…');
    const extensions = await chromePage(app, '/extensions.html');
    await extensions.getByRole('tab', { name: 'Marketplace' }).click();
    await extensions.getByRole('button', { name: 'Install Hello' }).click();
    await expect
      .poll(messages, { timeout: 20_000 })
      .toContainEqual(expect.stringContaining('is not this extension signed by the key'));
    expect(await recordsIn(profile)()).not.toContain('"org.example.hello"');
    const consentOpen = await app.evaluate(({ webContents }) =>
      webContents.getAllWebContents().some((contents) => contents.getURL().includes('consent')),
    );
    expect(consentOpen).toBe(false);
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
