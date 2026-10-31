import { expect, test } from './fixtures.ts';

test('copies diagnostics with the GPU summary and recent log from the Help menu', async ({
  app,
  window,
}) => {
  await expect(window.getByTestId('fake-whatsapp')).toBeVisible();
  await app.evaluate(({ Menu }) => {
    Menu.getApplicationMenu()
      ?.items.flatMap((menu) => menu.submenu?.items ?? [])
      .find((entry) => entry.label === 'Copy Diagnostics')
      ?.click();
  });
  await expect
    .poll(() => app.evaluate(({ clipboard }) => clipboard.readText()))
    .toMatch(
      /^YapYap \S+ \(development\)\n[\s\S]*\nGPU gpu_compositing=\S+, .*\nUpdates manual \(development\)\nWhatsApp view=chats, chat_open=true \(landmarks v9\)\n\nRecent log:\n/,
    );
});
