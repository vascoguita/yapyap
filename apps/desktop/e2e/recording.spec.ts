import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { testManifest } from '../test/extensions.ts';
import { closeApp, expect, launchApp, test, whatsAppPage } from './fixtures.ts';
import {
  chromePage,
  installExtension,
  extensionPage,
  runExtensionCommand,
} from './extension-helpers.ts';

/** Asks to record or stop when the user picks its commands, and writes in its title how it went. */
const RECORDER = `
export default {
  activate(host) {
    document.title = 'waiting';
    host.commands.onRun('record', async () => {
      const result = await host.calls.record();
      globalThis.results = (globalThis.results ?? '') + ' ' + result;
      document.title = result;
    });
    host.commands.onRun('stop', async () => {
      await host.calls.stop();
      document.title = 'stopped ' + (await host.calls.recordings()).length;
    });
  },
};
`;

test('records a call only after the user clicks Record and confirms, and keeps it on this computer', async ({
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
    const manifest = testManifest({
      name: 'Recorder',
      capabilities: ['calls:record'],
      network: { hosts: [] },
      contributes: {
        commands: [
          { id: 'record', title: 'Record' },
          { id: 'stop', title: 'Stop' },
        ],
      },
    });
    await installExtension(app, profile, manifest, RECORDER);
    await expect
      .poll(async () => (await extensionPage(app))?.title, { timeout: 20_000 })
      .toBe('waiting');
    // After the install, whose own stub refuses everything: the user confirms the consent warning.
    await app.evaluate(({ dialog }) => {
      dialog.showMessageBox = () => Promise.resolve({ response: 0, checkboxChecked: true });
    });
    if (process.platform === 'darwin') {
      // Capturing a call's sound is not offered on macOS yet (ADR 0015): nothing is asked.
      await page.getByTestId('call').click();
      await expect.poll(() => runExtensionCommand(app, 'Recorder: Record')).toBe(true);
      await expect.poll(async () => (await extensionPage(app))?.title).toBe('unsupported');
      expect(app.windows().some((window) => window.url().endsWith('/record-prompt.html'))).toBe(
        false,
      );
      return;
    }
    // Nothing to record before a call starts.
    await expect.poll(() => runExtensionCommand(app, 'Recorder: Record')).toBe(true);
    await expect.poll(async () => (await extensionPage(app))?.title).toBe('no-call');

    await page.getByTestId('call').click();
    await expect
      .poll(() => app.windows().some((candidate) => candidate.url().endsWith('/call.html')))
      .toBe(true);
    await expect.poll(() => runExtensionCommand(app, 'Recorder: Record')).toBe(true);
    const prompt = await chromePage(app, '/record-prompt.html');
    await expect(prompt.getByText('Recorder wants to record this call.')).toBeVisible();
    // Nothing records before the click.
    expect((await extensionPage(app))?.title).toBe('no-call');
    await prompt.getByRole('button', { name: 'Record' }).click();
    await expect
      .poll(async () => (await extensionPage(app))?.title, { timeout: 20_000 })
      .toBe('recording');
    await expect(prompt.getByRole('status')).toContainText('Recording');
    await new Promise((resolve) => setTimeout(resolve, 2500));
    await expect.poll(() => runExtensionCommand(app, 'Recorder: Stop')).toBe(true);
    await expect
      .poll(async () => (await extensionPage(app))?.title, { timeout: 20_000 })
      .toBe('stopped 1');

    const folder = join(music, 'YapYap');
    const [file, ...others] = await readdir(folder);
    expect(others).toEqual([]);
    expect(file).toMatch(/^YapYap call \d{4}-\d{2}-\d{2} \d{2}\.\d{2}\.webm$/);
    const recorded = await stat(join(folder, file ?? ''));
    expect(recorded.size).toBeGreaterThan(0);
    // WebM files start with the EBML magic number.
    expect([...(await readFile(join(folder, file ?? ''))).subarray(0, 4)]).toEqual([
      0x1a, 0x45, 0xdf, 0xa3,
    ]);
  } finally {
    await closeApp(app);
  }
});
