import type { ElectronApplication, Page } from '@playwright/test';
import { closeApp, expect, launchApp, test, whatsAppPage } from './fixtures.ts';

/** The call window, if one is open: whether it shows, and the session it runs on. */
const callWindow = (app: ElectronApplication) =>
  app.evaluate(({ BrowserWindow, webContents }) => {
    const all = webContents.getAllWebContents();
    const call = all.find((contents) => contents.getURL().endsWith('/call.html'));
    const account = all.find(
      (contents) => contents.getURL().startsWith('http') && contents !== call,
    );
    if (call === undefined || account === undefined) {
      return null;
    }
    return {
      visible: BrowserWindow.fromWebContents(call)?.isVisible() ?? false,
      sameSession: call.session === account.session,
    };
  });

for (const button of ['call', 'call-blank']) {
  test(`keeps a WhatsApp call in a window of its account (${button})`, async ({ app, window }) => {
    await expect(window.getByTestId('fake-whatsapp')).toBeVisible();
    // call.js wires its buttons once the page has loaded.
    await window.waitForLoadState('load');
    await window.getByTestId(button).click();
    await expect.poll(() => callWindow(app)).toEqual({ visible: true, sameSession: true });
    // Playwright lists a new page a moment after Electron creates it.
    const isCall = (page: Page) => page.url().endsWith('/call.html');
    await expect.poll(() => app.windows().some(isCall)).toBe(true);
    const call = app.windows().find(isCall);
    if (call === undefined) {
      throw new Error('No call window.');
    }
    // Hang up closes its own window, which can end the click before
    // Playwright sees it finish; the window closing is what counts.
    await Promise.all([
      call.waitForEvent('close'),
      call
        .getByTestId('hang-up')
        .click()
        .catch(() => undefined),
    ]);
    await expect.poll(() => callWindow(app)).toBeNull();
  });
}

test('gives a call the microphone with echo cancellation, noise suppression and gain control on', async ({
  fakeWhatsApp,
  profile,
}) => {
  // Chromium's fake camera and microphone stand in for real ones.
  const app = await launchApp(fakeWhatsApp.origin, profile, ['--use-fake-device-for-media-stream']);
  const page = await whatsAppPage(app);
  await expect(page.getByTestId('fake-whatsapp')).toBeVisible();
  // The user allows the devices, in YapYap and, on macOS, in the system.
  await app.evaluate(({ dialog, systemPreferences }) => {
    dialog.showMessageBox = () => Promise.resolve({ response: 0, checkboxChecked: false });
    systemPreferences.askForMediaAccess = () => Promise.resolve(true);
  });
  const tracks = await page.evaluate(async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
    const report = stream.getTracks().map((track) => {
      const { echoCancellation, noiseSuppression, autoGainControl } = track.getSettings();
      return {
        kind: track.kind,
        live: track.readyState === 'live',
        echoCancellation,
        noiseSuppression,
        autoGainControl,
      };
    });
    for (const track of stream.getTracks()) {
      track.stop();
    }
    return report.sort((a, b) => a.kind.localeCompare(b.kind));
  });
  expect(tracks).toEqual([
    {
      kind: 'audio',
      live: true,
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
    { kind: 'video', live: true },
  ]);
  await closeApp(app);
});
