import { expect, test } from './fixtures.ts';

// Only macOS reads its badge back: Windows draws an overlay Electron cannot
// return, and Linux keeps a count only under launchers that show one.
test.skip(process.platform !== 'darwin', 'Only the Dock badge can be read back');

test('shows the unread count from WhatsApp’s title on the Dock icon', async ({ app, window }) => {
  await expect(window.getByTestId('fake-whatsapp')).toBeVisible();
  await window.evaluate(() => {
    document.title = '(2) WhatsApp';
  });
  await expect
    .poll(() => app.evaluate(({ app: electronApp }) => electronApp.getBadgeCount()))
    .toBe(2);
  await window.evaluate(() => {
    document.title = 'WhatsApp';
  });
  await expect
    .poll(() => app.evaluate(({ app: electronApp }) => electronApp.getBadgeCount()))
    .toBe(0);
});
