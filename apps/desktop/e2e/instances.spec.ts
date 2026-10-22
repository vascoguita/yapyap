import { expect, launchAgain, test } from './fixtures.ts';

test('a second launch hands its chat link to the running window and exits', async ({
  app,
  window,
  fakeWhatsApp,
  profile,
}) => {
  await expect(window.getByTestId('fake-whatsapp')).toBeVisible();
  const second = await launchAgain(fakeWhatsApp.origin, profile, [
    '--evil-flag',
    'https://wa.me/447700900123?text=Hi',
  ]);
  expect(second, second.stderr).toEqual(expect.objectContaining({ code: 0, signal: null }));
  await expect
    .poll(() => window.url())
    .toBe(`${fakeWhatsApp.origin}/send?phone=447700900123&text=Hi`);
  expect(app.windows()).toHaveLength(1);
});

test('a second launch with no valid link only brings the window back', async ({
  window,
  fakeWhatsApp,
  profile,
}) => {
  await expect(window.getByTestId('fake-whatsapp')).toBeVisible();
  const second = await launchAgain(fakeWhatsApp.origin, profile, ['https://example.com/']);
  expect(second, second.stderr).toEqual(expect.objectContaining({ code: 0, signal: null }));
  expect(window.url()).toBe(`${fakeWhatsApp.origin}/`);
});
