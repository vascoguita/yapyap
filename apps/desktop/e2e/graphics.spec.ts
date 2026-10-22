import type { ElectronApplication, Page } from '@playwright/test';
import { expect, launchApp, test } from './fixtures.ts';

/** The display backend diagnostics name: Linux CI runs on its virtual X11 display. */
const DISPLAY = process.platform === 'linux' ? 'X11 \\(automatic\\)' : 'native';

async function technicalDetails(app: ElectronApplication): Promise<string> {
  await app.firstWindow();
  const opened = app.waitForEvent('window');
  await app.evaluate(({ Menu }) => {
    Menu.getApplicationMenu()
      ?.items.flatMap((menu) => menu.submenu?.items ?? [])
      .find((entry) => entry.label === 'About YapYap')
      ?.click();
  });
  const about: Page = await opened;
  await about.waitForURL('app://chrome/about.html');
  await about.getByRole('button', { name: 'Copy technical details' }).click();
  await expect(about.getByRole('status')).toHaveText('Copied to the clipboard.');
  return app.evaluate(({ clipboard }) => clipboard.readText());
}

test('reports the graphics mode in the technical details', async ({ app }) => {
  expect(await technicalDetails(app)).toMatch(
    new RegExp(`\\nGraphics hardware accelerated, display ${DISPLAY}$`),
  );
});

test('starts without hardware acceleration with --safe-mode', async ({ fakeWhatsApp, profile }) => {
  const app = await launchApp(fakeWhatsApp.origin, profile, ['--safe-mode']);
  try {
    expect(await technicalDetails(app)).toMatch(
      new RegExp(`\\nGraphics software rendering \\(safe mode\\), display ${DISPLAY}$`),
    );
    const status = await app.evaluate(({ app: electronApp }) => electronApp.getGPUFeatureStatus());
    expect(status.gpu_compositing).toMatch(/^disabled/);
  } finally {
    await app.close();
  }
});
