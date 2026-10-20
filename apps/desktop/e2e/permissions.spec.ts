import { expect, test } from './fixtures.ts';

test('grants WhatsApp notifications', async ({ window }) => {
  await expect(window.getByTestId('fake-whatsapp')).toBeVisible();
  expect(await window.evaluate(() => Notification.requestPermission())).toBe('granted');
});

test('denies permissions outside the WhatsApp allowlist', async ({ window }) => {
  await expect(window.getByTestId('fake-whatsapp')).toBeVisible();
  const geolocation = await window.evaluate(
    () =>
      new Promise<number>((resolve) => {
        navigator.geolocation.getCurrentPosition(
          () => {
            resolve(0);
          },
          (error) => {
            resolve(error.code);
          },
        );
      }),
  );
  expect(geolocation).toBe(1);
  const midi = await window.evaluate(() =>
    navigator.requestMIDIAccess().then(
      () => 'granted',
      (error: unknown) => (error instanceof DOMException ? error.name : 'error'),
    ),
  );
  expect(midi).toBe('NotAllowedError');
});
