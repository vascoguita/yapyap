import { expect, test } from './fixtures.ts';

test('opens a chat with a number from the Account menu, without saving it', async ({
  app,
  window,
  fakeWhatsApp,
}) => {
  await expect(window.getByTestId('fake-whatsapp')).toBeVisible();
  const opened = app.waitForEvent('window');
  await app.evaluate(({ Menu }) => {
    Menu.getApplicationMenu()
      ?.items.flatMap((menu) => menu.submenu?.items ?? [])
      .find((entry) => entry.label === 'New Chat with Number…')
      ?.click();
  });
  const dialog = await opened;
  await dialog.waitForURL('app://chrome/new-chat.html');
  const number = dialog.getByLabel('Phone number, with the country code');
  const open = dialog.getByRole('button', { name: 'Open Chat' });
  await number.fill('07700 900123');
  await expect(open).toBeDisabled();
  await number.fill('+44 7700 900123');
  await open.click();
  await expect.poll(() => window.url()).toBe(`${fakeWhatsApp.origin}/send?phone=447700900123`);
  await expect.poll(() => dialog.isClosed()).toBe(true);
});
