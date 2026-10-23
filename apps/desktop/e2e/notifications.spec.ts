import type { ElectronApplication } from '@playwright/test';
import { expect, test } from './fixtures.ts';

/**
 * Records system notifications instead of showing them, so tests never put
 * notifications on the developer's desktop and can click them.
 */
async function recordNotifications(app: ElectronApplication): Promise<void> {
  await app.evaluate(({ Notification }) => {
    const shown: { title: string; body: string; closed: boolean }[] = [];
    const recorded: Electron.Notification[] = [];
    Object.assign(globalThis, {
      shownNotifications: shown,
      clickLatestNotification: () => recorded.at(-1)?.emit('click'),
    });
    // CI runners have no notification service, and recording needs none.
    Notification.isSupported = () => true;
    Notification.prototype.show = function show(this: Electron.Notification) {
      recorded.push(this);
      shown.push({ title: this.title, body: this.body, closed: false });
    };
    Notification.prototype.close = function close(this: Electron.Notification) {
      const entry = shown.find((candidate) => candidate.title === this.title);
      if (entry !== undefined) {
        entry.closed = true;
      }
    };
  });
}

const shown = (app: ElectronApplication) =>
  app.evaluate(
    () =>
      (
        globalThis as unknown as {
          shownNotifications: { title: string; body: string; closed: boolean }[];
        }
      ).shownNotifications,
  );

test('turns WhatsApp’s notifications into system ones that open the chat and go away when read', async ({
  app,
  window,
}) => {
  await recordNotifications(app);
  await expect(window.getByTestId('fake-whatsapp')).toBeVisible();
  // notify.js wires its buttons once the page has loaded.
  await window.waitForLoadState('load');
  await window.getByTestId('notify').click();
  await expect(window.getByTestId('notify-result')).toHaveText('permission granted');
  await expect
    .poll(() => shown(app))
    .toEqual([{ title: 'Test Chat One', body: 'Hello from the test', closed: false }]);
  await app.evaluate(() => {
    (globalThis as unknown as { clickLatestNotification: () => void }).clickLatestNotification();
  });
  await expect(window.getByTestId('notify-result')).toHaveText('clicked');
  await window.getByTestId('notify-read').click();
  await expect.poll(async () => (await shown(app))[0]?.closed).toBe(true);
});
