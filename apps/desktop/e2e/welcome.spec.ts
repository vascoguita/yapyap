import { closeApp, expect, launchApp, test } from './fixtures.ts';

test('greets the first launch with a welcome whose choices apply at once, and never again', async ({
  fakeWhatsApp,
  profile,
}) => {
  const first = await launchApp(fakeWhatsApp.origin, profile, [], { firstRun: true });
  try {
    await expect
      .poll(() => first.windows().some((page) => page.url().endsWith('/welcome.html')))
      .toBe(true);
    const welcome = first.windows().find((page) => page.url().endsWith('/welcome.html'));
    if (welcome === undefined) {
      throw new Error('No welcome.');
    }
    await expect(welcome.getByRole('heading', { name: 'Welcome to YapYap' })).toBeVisible();
    await welcome.getByRole('radio', { name: 'Dark', exact: true }).check();
    await expect
      .poll(() => first.evaluate(({ nativeTheme }) => nativeTheme.themeSource))
      .toBe('dark');
    await welcome.getByRole('button', { name: 'Start Using YapYap' }).click();
    await expect.poll(() => welcome.isClosed()).toBe(true);
  } finally {
    await closeApp(first);
  }
  const again = await launchApp(fakeWhatsApp.origin, profile, [], { firstRun: true });
  try {
    await expect
      .poll(() => again.windows().some((page) => page.url().startsWith('http')))
      .toBe(true);
    expect(again.windows().some((page) => page.url().endsWith('/welcome.html'))).toBe(false);
  } finally {
    await closeApp(again);
  }
});
