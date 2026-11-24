import { reportedDiagnostics } from './chrome-helpers.ts';
import { expect, test } from './fixtures.ts';

test('shows diagnostics with the GPU summary and recent log in Report a Problem', async ({
  app,
  window,
}) => {
  await expect(window.getByTestId('fake-whatsapp')).toBeVisible();
  expect(await reportedDiagnostics(app)).toMatch(
    /^YapYap \S+ \(development\)\n[\s\S]*\nGPU gpu_compositing=\S+, .*\nUpdates manual \(development\)\nWhatsApp view=chats, chat_open=true \(landmarks v13\)\n\nRecent log:\n/,
  );
});
