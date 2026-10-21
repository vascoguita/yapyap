import type { ElectronApplication } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, launchApp, test } from './fixtures.ts';

const whatsAppZoom = (app: ElectronApplication) =>
  app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()
      .find((window) => window.webContents.getURL().startsWith('http'))
      ?.webContents.getZoomFactor(),
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
    await expect((await again.firstWindow()).getByTestId('fake-whatsapp')).toBeVisible();
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
    await expect((await app.firstWindow()).getByTestId('fake-whatsapp')).toBeVisible();
    await expect.poll(() => whatsAppZoom(app)).toBeCloseTo(1);
  } finally {
    await quit(app);
  }
});
