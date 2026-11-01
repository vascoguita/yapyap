import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import type { ChromeApi } from '../src/shared/chrome-api.ts';
import { testManifest } from '../test/extensions.ts';
import { closeApp, expect, launchApp, seedSettings, test, whatsAppPage } from './fixtures.ts';
import {
  chromePage,
  installExtension,
  EXTENSION_START_TIMEOUT,
  extensionTitle,
  recordedBytes,
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
      .poll(() => extensionTitle(app), { timeout: EXTENSION_START_TIMEOUT })
      .toBe('waiting');
    if (process.platform === 'darwin') {
      // Capturing a call's sound is not offered on macOS yet (ADR 0015): nothing is asked.
      await page.getByTestId('call').click();
      await expect.poll(() => runExtensionCommand(app, 'Recorder: Record')).toBe(true);
      await expect.poll(() => extensionTitle(app)).toBe('unsupported');
      expect(app.windows().some((window) => window.url().endsWith('/record-prompt.html'))).toBe(
        false,
      );
      return;
    }
    // Nothing to record before a call starts.
    await expect.poll(() => runExtensionCommand(app, 'Recorder: Record')).toBe(true);
    await expect.poll(() => extensionTitle(app)).toBe('no-call');

    await page.getByTestId('call').click();
    await expect
      .poll(() => app.windows().some((candidate) => candidate.url().endsWith('/call.html')))
      .toBe(true);
    await expect.poll(() => runExtensionCommand(app, 'Recorder: Record')).toBe(true);
    const prompt = await chromePage(app, '/record-prompt.html');
    await expect(prompt.getByText('Recorder wants to record this call.')).toBeVisible();
    // Nothing records before the click, and Record waits for the consent warning's box.
    expect(await extensionTitle(app)).toBe('no-call');
    await expect(prompt.getByRole('heading', { name: 'Before you record calls' })).toBeVisible();
    const record = prompt.getByRole('button', { name: 'Record' });
    await expect(record).toBeDisabled();
    // YapYap refuses Record without the tick even when the page sends it.
    await expect(
      prompt.evaluate(() =>
        (globalThis as unknown as { yapyap: ChromeApi }).yapyap.recordPrompt.answer(true, false),
      ),
    ).rejects.toThrow('Recording needs the consent warning confirmed.');
    expect(await extensionTitle(app)).toBe('no-call');
    await prompt.getByRole('checkbox', { name: /I will ask for it/ }).check();
    await record.click();
    await expect
      .poll(() => extensionTitle(app), { timeout: EXTENSION_START_TIMEOUT })
      .toBe('recording');
    await expect(prompt.getByText('Recording', { exact: true })).toBeVisible();
    const folder = join(music, 'YapYap');
    await expect
      .poll(() => recordedBytes(folder), { timeout: EXTENSION_START_TIMEOUT })
      .toBeGreaterThan(0);
    await expect.poll(() => runExtensionCommand(app, 'Recorder: Stop')).toBe(true);
    await expect
      .poll(() => extensionTitle(app), { timeout: EXTENSION_START_TIMEOUT })
      .toBe('stopped 1');

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

test('records as WAV when Settings says so, with the sizes in its header', async ({
  fakeWhatsApp,
  profile,
}) => {
  test.skip(process.platform === 'darwin', 'Recording is not offered on macOS yet (ADR 0015).');
  await seedSettings(profile, { recording: { format: 'wav' } });
  const app = await launchApp(fakeWhatsApp.origin, profile, ['--use-fake-device-for-media-stream']);
  try {
    const music = join(profile, 'music');
    await app.evaluate(({ app: electronApp }, folder) => {
      electronApp.setPath('music', folder);
    }, music);
    const page = await whatsAppPage(app);
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
      .poll(() => extensionTitle(app), { timeout: EXTENSION_START_TIMEOUT })
      .toBe('waiting');
    await page.getByTestId('call').click();
    await expect.poll(() => runExtensionCommand(app, 'Recorder: Record')).toBe(true);
    const prompt = await chromePage(app, '/record-prompt.html');
    await prompt.getByRole('checkbox').check();
    await prompt.getByRole('button', { name: 'Record' }).click();
    await expect
      .poll(() => extensionTitle(app), { timeout: EXTENSION_START_TIMEOUT })
      .toBe('recording');
    const folder = join(music, 'YapYap');
    // Over half a second of stereo 16-bit sound.
    await expect
      .poll(() => recordedBytes(folder), { timeout: EXTENSION_START_TIMEOUT })
      .toBeGreaterThan(100_000);
    await expect.poll(() => runExtensionCommand(app, 'Recorder: Stop')).toBe(true);
    await expect
      .poll(() => extensionTitle(app), { timeout: EXTENSION_START_TIMEOUT })
      .toBe('stopped 1');
    const [file] = await readdir(folder);
    expect(file).toMatch(/^YapYap call .+\.wav$/);
    const bytes = await readFile(join(folder, file ?? ''));
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.length);
    expect(bytes.subarray(0, 4).toString()).toBe('RIFF');
    expect(view.getUint32(4, true)).toBe(bytes.length - 8);
    expect(view.getUint32(40, true)).toBe(bytes.length - 44);
    expect(bytes.length).toBeGreaterThan(100_000);
  } finally {
    await closeApp(app);
  }
});
