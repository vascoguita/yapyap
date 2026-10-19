import { expect, test } from './fixtures.ts';

test('opens a window that loads the fake WhatsApp page', async ({ app, window, fakeWhatsApp }) => {
  await expect(window.getByTestId('fake-whatsapp')).toBeVisible();
  expect(new URL(window.url()).origin).toBe(fakeWhatsApp.origin);
  expect(await window.title()).toBe('WhatsApp');
  // ready-to-show can land after the page renders, especially under Xvfb.
  await expect
    .poll(() =>
      app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().map((w) => w.isVisible())),
    )
    .toEqual([true]);
});

test('runs WhatsApp in a sandboxed, isolated renderer without Node.js', async ({ window }) => {
  const exposed = await window.evaluate(() => ({
    require: typeof (globalThis as Record<string, unknown>)['require'],
    process: typeof (globalThis as Record<string, unknown>)['process'],
  }));
  expect(exposed).toEqual({ require: 'undefined', process: 'undefined' });
});
