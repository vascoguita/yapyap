import type { ElectronApplication, Page } from '@playwright/test';
import { expect, test } from './fixtures.ts';

async function openChrome(app: ElectronApplication, label: string, page: string): Promise<Page> {
  await app.firstWindow();
  const opened = app.waitForEvent('window');
  await app.evaluate(({ Menu }, wanted) => {
    Menu.getApplicationMenu()
      ?.items.flatMap((menu) => menu.submenu?.items ?? [])
      .find((entry) => entry.label === wanted)
      ?.click();
  }, label);
  const window = await opened;
  await window.waitForURL(`app://chrome/${page}`);
  return window;
}

const prefersDark = (page: Page) =>
  page.evaluate(() => matchMedia('(prefers-color-scheme: dark)').matches);

test('switches YapYap and WhatsApp between themes live', async ({ app, window }) => {
  const settings = await openChrome(app, 'Settings…', 'settings.html');
  await settings.getByRole('radio', { name: 'Dark' }).check();
  await expect.poll(() => prefersDark(window)).toBe(true);
  await expect.poll(() => prefersDark(settings)).toBe(true);
  await settings.getByRole('radio', { name: 'Light' }).check();
  await expect.poll(() => prefersDark(window)).toBe(false);
  expect(await app.evaluate(({ nativeTheme }) => nativeTheme.themeSource)).toBe('light');
});

test('turns transitions off for people who prefer reduced motion', async ({ app }) => {
  const settings = await openChrome(app, 'Settings…', 'settings.html');
  const duration = () =>
    settings
      .locator('button, .notice')
      .first()
      .evaluate((element) => getComputedStyle(element).transitionDuration);
  await settings.getByRole('checkbox', { name: 'Use hardware acceleration' }).uncheck();
  expect(await duration()).not.toBe('0s');
  await settings.emulateMedia({ reducedMotion: 'reduce' });
  expect(await duration()).toBe('0s');
});

for (const theme of ['light', 'dark'] as const) {
  test(`app chrome looks right in the ${theme} theme`, async ({ app }) => {
    await app.evaluate(({ nativeTheme }, source) => {
      nativeTheme.themeSource = source;
    }, theme);
    const about = await openChrome(app, 'About YapYap', 'about.html');
    await expect(about.getByRole('heading', { name: 'YapYap' })).toBeVisible();
    // Versions change with every dependency update; the layout is what matters.
    await expect(about).toHaveScreenshot(`about-${theme}.png`, { mask: [about.locator('dl')] });
    const settings = await openChrome(app, 'Settings…', 'settings.html');
    await expect(settings.getByRole('group', { name: 'Theme' })).toBeVisible();
    await expect(settings).toHaveScreenshot(`settings-${theme}.png`);
  });
}
