import { readFileSync } from 'node:fs';
import { expect, test } from './fixtures.ts';

test('opens a window that loads the fake WhatsApp page', async ({ app, window, fakeWhatsApp }) => {
  await expect(window.getByTestId('fake-whatsapp')).toBeVisible();
  expect(new URL(window.url()).origin).toBe(fakeWhatsApp.origin);
  expect(await window.title()).toBe('WhatsApp');
  // ready-to-show can land after the page renders, especially under Xvfb.
  await expect
    .poll(() =>
      app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().map((w) => w.isVisible())),
    )
    .toEqual([true]);
});

test('runs WhatsApp in a sandboxed, isolated renderer without Node.js', async ({ window }) => {
  const exposed = await window.evaluate(() => ({
    require: typeof (globalThis as Record<string, unknown>)['require'],
    process: typeof (globalThis as Record<string, unknown>)['process'],
  }));
  expect(exposed).toEqual({ require: 'undefined', process: 'undefined' });
});

test('runs every web page in an operating-system sandbox', async ({ app, window }) => {
  await expect(window.getByTestId('fake-whatsapp')).toBeVisible();
  const renderers = await app.evaluate(({ app }) =>
    app
      .getAppMetrics()
      .filter((metric) => metric.type === 'Tab')
      .map(({ pid, sandboxed }) => ({ pid, sandboxed })),
  );
  expect(renderers.length).toBeGreaterThan(0);
  for (const { pid, sandboxed } of renderers) {
    // Electron reports sandboxing only on macOS and Windows; on Linux, Chromium's
    // sandbox shows up as a seccomp-bpf filter on the renderer process.
    const status =
      process.platform === 'linux' ? readFileSync(`/proc/${String(pid)}/status`, 'utf8') : '';
    expect(process.platform === 'linux' ? /^Seccomp:\s+2$/m.test(status) : sandboxed).toBe(true);
  }
});

test('offers web pages no <webview> element', async ({ window }) => {
  await expect(window.getByTestId('fake-whatsapp')).toBeVisible();
  expect(await window.evaluate(() => customElements.get('webview') === undefined)).toBe(true);
});

test('presents itself to WhatsApp as the bundled Chromium in desktop Chrome form', async ({
  app,
  window,
}) => {
  await expect(window.getByTestId('fake-whatsapp')).toBeVisible();
  const chrome = await app.evaluate(() => process.versions.chrome);
  const major = chrome.split('.')[0] ?? '';
  const seen = await window.evaluate(async () => ({
    userAgent: navigator.userAgent,
    headers: (await (await fetch('/__headers')).json()) as Record<string, string>,
  }));
  expect(seen.userAgent).toMatch(
    new RegExp(
      `^Mozilla/5\\.0 \\(.+\\) AppleWebKit/537\\.36 \\(KHTML, like Gecko\\) Chrome/${major}\\.0\\.0\\.0 Safari/537\\.36$`,
    ),
  );
  expect(seen.userAgent).not.toMatch(/Electron|YapYap/i);
  expect(seen.headers['user-agent']).toBe(seen.userAgent);
  expect(seen.headers['sec-ch-ua']).toContain(`"Google Chrome";v="${major}"`);
});

test('hands keyboard focus to WhatsApp when its window is focused', async ({ app, window }) => {
  await expect(window.getByTestId('fake-whatsapp')).toBeVisible();
  await expect
    .poll(() =>
      app.evaluate(({ BrowserWindow, webContents }) => {
        BrowserWindow.getAllWindows()[0]?.focus();
        return webContents.getFocusedWebContents()?.getURL();
      }),
    )
    .toMatch(/^http:\/\/127\.0\.0\.1:\d+\//);
});
