import type { ElectronApplication } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, launchApp, test, whatsAppPage } from './fixtures.ts';

const whatsAppZoom = (app: ElectronApplication) =>
  app.evaluate(({ webContents }) =>
    webContents
      .getAllWebContents()
      .find((contents) => contents.getURL().startsWith('http'))
      ?.getZoomFactor(),
  );

async function clickView(app: ElectronApplication, label: string): Promise<void> {
  await app.evaluate(({ Menu }, wanted) => {
    Menu.getApplicationMenu()
      ?.items.find((menu) => menu.label.replaceAll('&', '') === 'View')
      ?.submenu?.items.find((item) => item.label === wanted)
      ?.click();
  }, label);
}

async function quit(app: ElectronApplication): Promise<void> {
  const exited = new Promise((resolve) => app.process().once('exit', resolve));
  await app.evaluate(({ app: electronApp }) => {
    setTimeout(() => {
      electronApp.quit();
    });
  });
  await exited;
}

test('zooms in 5% steps and keeps the level for the next launch', async ({
  app,
  window,
  fakeWhatsApp,
  profile,
}) => {
  await expect(window.getByTestId('fake-whatsapp')).toBeVisible();
  await clickView(app, 'Zoom In');
  await clickView(app, 'Zoom In');
  await expect.poll(() => whatsAppZoom(app)).toBeCloseTo(1.1);
  await clickView(app, 'Zoom Out');
  await expect.poll(() => whatsAppZoom(app)).toBeCloseTo(1.05);
  await quit(app);
  const again = await launchApp(fakeWhatsApp.origin, profile);
  try {
    await expect((await whatsAppPage(again)).getByTestId('fake-whatsapp')).toBeVisible();
    await expect.poll(() => whatsAppZoom(again)).toBeCloseTo(1.05);
    await clickView(again, 'Actual Size');
    await expect.poll(() => whatsAppZoom(again)).toBeCloseTo(1);
  } finally {
    await quit(again);
  }
});

test('starts at 100% when the stored zoom is invalid', async ({ fakeWhatsApp, profile }) => {
  await writeFile(
    join(profile, 'settings.json'),
    JSON.stringify({ schemaVersion: 1, appearance: { zoom: 99 } }),
  );
  const app = await launchApp(fakeWhatsApp.origin, profile);
  try {
    await expect((await whatsAppPage(app)).getByTestId('fake-whatsapp')).toBeVisible();
    await expect.poll(() => whatsAppZoom(app)).toBeCloseTo(1);
  } finally {
    await quit(app);
  }
});

test('sets the interface scale from Settings', async ({ app, window }) => {
  await expect(window.getByTestId('fake-whatsapp')).toBeVisible();
  const opened = app.waitForEvent('window');
  await app.evaluate(({ Menu }) => {
    Menu.getApplicationMenu()
      ?.items.flatMap((menu) => menu.submenu?.items ?? [])
      .find((entry) => entry.label === 'Settings…')
      ?.click();
  });
  const settings = await opened;
  await settings.waitForURL('app://chrome/settings.html');
  const scale = settings.getByRole('group', { name: 'Interface scale' });
  await expect(scale.getByRole('radio', { name: '100%' })).toBeChecked();
  await scale.getByRole('radio', { name: '125%' }).check();
  await expect.poll(() => whatsAppZoom(app)).toBe(1.25);
});
