import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { closeApp, expect, launchApp, test, whatsAppPage } from './fixtures.ts';
import { builtExtension, chromePage, installExtension } from './extension-helpers.ts';

test('the call recorder extension records a call from its panel, after the user agrees', async ({
  fakeWhatsApp,
  profile,
}) => {
  // Chromium's fake microphone stands in for a real one; the call window plays a tone.
  const app = await launchApp(fakeWhatsApp.origin, profile, ['--use-fake-device-for-media-stream']);
  try {
    const music = join(profile, 'music');
    await app.evaluate(({ app: electronApp }, folder) => {
      electronApp.setPath('music', folder);
    }, music);
    const page = await whatsAppPage(app);
    await expect(page.getByTestId('fake-whatsapp')).toBeVisible();
    await page.waitForLoadState('load');
    const { manifest, main, others } = await builtExtension(
      'call-recorder',
      'org.example.call-recorder',
    );
    await installExtension(app, profile, manifest, main, others);
    // After the install, whose own stub refuses everything: the user confirms the consent warning.
    await app.evaluate(({ dialog }) => {
      dialog.showMessageBox = () => Promise.resolve({ response: 0, checkboxChecked: true });
    });
    const open = () =>
      app.evaluate(({ Menu }) => {
        const item = Menu.getApplicationMenu()
          ?.items.flatMap((menu) => menu.submenu?.items ?? [])
          .find((entry) => entry.label === 'Extension Commands')
          ?.submenu?.items.find((entry) => entry.label === 'Call recorder: Recordings');
        item?.click();
        return item !== undefined;
      });
    await expect.poll(open, { timeout: 20_000 }).toBe(true);
    // The commands get the keys the extension suggests, as nothing else has them.
    const keys = await app.evaluate(({ Menu }) =>
      Menu.getApplicationMenu()
        ?.items.flatMap((menu) => menu.submenu?.items ?? [])
        .find((entry) => entry.label === 'Extension Commands')
        ?.submenu?.items.filter((entry) => entry.label.startsWith('Call recorder: '))
        .map((entry) => `${entry.label}=${entry.accelerator ?? ''}`),
    );
    expect(keys).toEqual([
      'Call recorder: Record this call=CmdOrCtrl+Alt+R',
      'Call recorder: Stop recording=CmdOrCtrl+Alt+S',
      'Call recorder: Recordings=',
    ]);
    const panel = await chromePage(app, '/__yapyap/panel.html');
    const status = panel.locator('output');
    if (process.platform === 'darwin') {
      // Capturing a call's sound is not offered on macOS yet (ADR 0015).
      await expect(status).toHaveText('YapYap cannot record calls on this system yet.');
      return;
    }
    await expect(status).toHaveText('No call is running.');
    await expect(panel.getByText('No recordings yet.')).toBeVisible();

    await page.getByTestId('call').click();
    await expect(status).toHaveText('A call is running.');
    await panel.getByRole('button', { name: 'Record' }).click();
    const prompt = await chromePage(app, '/record-prompt.html');
    await expect(prompt.getByText('Call recorder wants to record this call.')).toBeVisible();
    await prompt.getByRole('button', { name: 'Record' }).click();
    await expect(status).toContainText('Recording since');
    await new Promise((resolve) => setTimeout(resolve, 2500));
    await panel.getByRole('button', { name: 'Stop' }).click();
    await expect(panel.getByRole('button', { name: 'Show in folder' })).toHaveCount(1);
    expect(await readdir(join(music, 'YapYap'))).toEqual([
      expect.stringMatching(/^YapYap call .+\.webm$/) as unknown,
    ]);
  } finally {
    await closeApp(app);
  }
});
