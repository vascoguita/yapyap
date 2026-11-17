import type { ElectronApplication, Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { allowAllChats, CLAUDE_ANSWER, claudeAnswer, readyClaude } from '../assistant-helpers.ts';
import { startFakeWhatsApp } from '../fake-whatsapp-server.ts';
import { closeApp, expect, launchApp, seedSettings, test } from '../fixtures.ts';
import { chromePage, clickMenu } from '../chrome-helpers.ts';

/**
 * Screenshots for the README, the website (#384) and the app stores, taken
 * on the showcase page with invented people, never on a real account.
 */
const OUT = join(import.meta.dirname, '..', '..', '..', '..', 'docs', 'public', 'screenshots');
const SCALE = 2;
const PERSONAL = '0b6c3f0e-58a4-4a39-9a43-6f0c1c1f6a01';
const WORK = '7d2e9b1c-3f4a-4c5d-8e6f-1a2b3c4d5e6f';

/** The main window's size; wide enough for three suggested replies in a row. */
const MAIN = { width: 1440, height: 880 };

async function seed(profile: string, theme: 'light' | 'dark'): Promise<void> {
  // No menu bar, so the main window's pictures show only YapYap and WhatsApp.
  await seedSettings(profile, { appearance: { theme, autoHideMenuBar: true } });
  // The window opens where screenshots want it, as it would where the user left it.
  await writeFile(
    join(profile, 'window-state.json'),
    JSON.stringify({
      bounds: { x: 0, y: 0, ...MAIN },
      maximized: false,
      fullScreen: false,
    }),
  );
  await writeFile(
    join(profile, 'accounts.json'),
    JSON.stringify({
      version: 1,
      active: PERSONAL,
      accounts: [
        { id: PERSONAL, name: 'Personal', color: 'green', enabled: true },
        { id: WORK, name: 'Work', color: 'blue', enabled: true },
      ],
    }),
  );
}

/** Encodes the PNG for the website too, as a much smaller WebP. */
function webp(png: string, name: string): void {
  execFileSync('ffmpeg', [
    ...['-loglevel', 'error', '-y', '-i', png],
    ...['-c:v', 'libwebp', '-quality', '86', join(OUT, `${name}.webp`)],
  ]);
}

/**
 * Saves what a web contents shows, as Electron renders it. Playwright's own
 * screenshots of these pages emulate a viewport of their own, so the picture
 * would not match the window.
 */
async function capturePage(app: ElectronApplication, url: string, file: string): Promise<void> {
  const png = await app.evaluate(async ({ webContents }, wanted) => {
    const pages = webContents.getAllWebContents().filter((page) => page.getURL() === wanted);
    for (const page of pages) {
      const persona: unknown = await page.executeJavaScript(
        "localStorage.getItem('showcase-persona')",
      );
      if (!wanted.startsWith('http') || persona !== 'work') {
        return (await page.capturePage()).toPNG().toString('base64');
      }
    }
    return undefined;
  }, url);
  if (png === undefined) {
    throw new Error(`No page at ${url}.`);
  }
  await writeFile(file, Buffer.from(png, 'base64'));
}

/**
 * AppStream metainfo needs PNG, and the website shows the much smaller WebP,
 * so each picture is kept only in the formats something uses.
 */
type Format = 'png' | 'webp';

/** A chrome window, such as Settings, as it renders. */
async function captureWindow(
  app: ElectronApplication,
  path: string,
  name: string,
  formats: readonly Format[],
): Promise<void> {
  const page = await chromePage(app, path);
  // Waits for the fonts and two painted frames, so the shot is what a person would see.
  await page.evaluate(async () => {
    await document.fonts.ready;
    for (let frame = 0; frame < 2; frame += 1) {
      await new Promise((painted) => requestAnimationFrame(painted));
    }
  });
  await mkdir(OUT, { recursive: true });
  const png = join(OUT, `${name}.png`);
  await capturePage(app, page.url(), png);
  if (formats.includes('webp')) {
    webp(png, name);
  }
  if (!formats.includes('png')) {
    await rm(png);
  }
}

/**
 * Gives the Work account its own persona in its own storage, which outlives
 * a restart, so both accounts load as themselves, photos included, the
 * next time YapYap starts.
 */
async function preparePersonas(origin: string, profile: string): Promise<void> {
  const app = await launchApp(origin, profile);
  try {
    await expect
      .poll(() =>
        app.evaluate(
          ({ webContents }, work) =>
            webContents
              .getAllWebContents()
              .some(
                (contents) => contents.session.storagePath?.endsWith(`account-${work}`) === true,
              ),
          WORK,
        ),
      )
      .toBe(true);
    await app.evaluate(async ({ webContents }, work) => {
      const page = webContents
        .getAllWebContents()
        .find((contents) => contents.session.storagePath?.endsWith(`account-${work}`) === true);
      await page?.executeJavaScript("localStorage.setItem('showcase-persona', 'work')");
    }, WORK);
  } finally {
    await closeApp(app);
  }
}

test('Settings window', async ({ profile }) => {
  const showcase = await startFakeWhatsApp('showcase.html');
  await seed(profile, 'light');
  const app = await launchApp(showcase.origin, profile, [
    `--force-device-scale-factor=${String(SCALE)}`,
  ]);
  try {
    await clickMenu(app, 'Settings…');
    // The assistant has a picture of its own; this one shows the page Settings opens at.
    const settings = await chromePage(app, '/settings.html');
    await expect(settings.getByRole('heading', { level: 1, name: 'General' })).toBeVisible();
    await captureWindow(app, '/settings.html', 'settings', ['png']);
  } finally {
    await closeApp(app);
    await showcase.close();
  }
});

test('Accounts window, for the get-started guide (#385)', async ({ profile }) => {
  const showcase = await startFakeWhatsApp('showcase.html');
  await seed(profile, 'light');
  await preparePersonas(showcase.origin, profile);
  const app = await launchApp(showcase.origin, profile, [
    `--force-device-scale-factor=${String(SCALE)}`,
  ]);
  try {
    await clickMenu(app, 'Manage Accounts…');
    await captureWindow(app, '/accounts.html', 'accounts', ['webp']);
    expect(existsSync(join(OUT, 'accounts.webp'))).toBe(true);
  } finally {
    await closeApp(app);
    await showcase.close();
  }
});

test('AI Assistant settings', async ({ profile }) => {
  const showcase = await startFakeWhatsApp('showcase.html');
  await seed(profile, 'light');
  await preparePersonas(showcase.origin, profile);
  const app = await launchApp(showcase.origin, profile, [
    `--force-device-scale-factor=${String(SCALE)}`,
  ]);
  try {
    const settings = await readyClaude(app, CLAUDE_ANSWER);
    await expect(settings.getByText('Ready. Using Claude (Anthropic).')).toBeVisible();
    // Saving the key scrolled to it and kept focus on its button; the shot starts at the top.
    await settings.evaluate(() => {
      (document.activeElement as HTMLElement | null)?.blur();
      document.querySelector('main')?.scrollTo(0, 0);
    });
    await captureWindow(app, '/settings.html', 'assistant', ['png', 'webp']);
  } finally {
    await closeApp(app);
    await showcase.close();
  }
});

/**
 * The main window as the screen shows it: the account sidebar and WhatsApp
 * are separate views, and the AI Assistant draws inside WhatsApp's page, so
 * only the screen has them together. The window sits at the screen's corner.
 */
async function captureScreen(name: string, formats: readonly Format[]): Promise<void> {
  const png = join(OUT, `${name}.png`);
  execFileSync('ffmpeg', [
    ...['-loglevel', 'error', '-y', '-f', 'x11grab', '-draw_mouse', '0'],
    ...['-video_size', `${String(MAIN.width * SCALE)}x${String(MAIN.height * SCALE)}`],
    ...['-i', `${String(process.env['DISPLAY'])}+0,0`, '-frames:v', '1', png],
  ]);
  if (formats.includes('webp')) {
    webp(png, name);
  }
  if (!formats.includes('png')) {
    await rm(png);
  }
}

/** The Personal account's WhatsApp, which the main window shows. */
async function personalPage(app: ElectronApplication): Promise<Page> {
  for (const page of app.windows().filter((each) => each.url().startsWith('http'))) {
    const persona = await page.evaluate(() => localStorage.getItem('showcase-persona'));
    if (persona !== 'work') {
      return page;
    }
  }
  throw new Error('The Personal account has no page.');
}

/**
 * Brings the main window forward, as the user's click would: with no window
 * manager, nothing has focus, and the AI Assistant waits for the window to be seen.
 */
async function focusMainWindow(app: ElectronApplication): Promise<void> {
  await expect(async () => {
    expect(
      await app.evaluate(({ BaseWindow }) => {
        const main = BaseWindow.getAllWindows().find(
          (window) => window.getContentView().children.length > 0,
        );
        main?.focus();
        return main?.isFocused() ?? false;
      }),
    ).toBe(true);
  }).toPass();
}

/** Waits for fonts and two painted frames, so the shot is what a person would see. */
async function painted(page: Page): Promise<void> {
  await page.evaluate(async () => {
    await document.fonts.ready;
    for (let frame = 0; frame < 2; frame += 1) {
      await new Promise((done) => requestAnimationFrame(done));
    }
  });
}

/** Three replies to the open chat's last message, from Inês. */
const REPLIES = claudeAnswer('Amazing, thanks Inês! 🙌\nSee you at 10!\nI’ll bring snacks');

test('Main window, with the AI Assistant', async ({ profile }) => {
  const showcase = await startFakeWhatsApp('showcase.html');
  await seed(profile, 'dark');
  await preparePersonas(showcase.origin, profile);
  const app = await launchApp(showcase.origin, profile, [
    `--force-device-scale-factor=${String(SCALE)}`,
  ]);
  try {
    const settings = await readyClaude(app, REPLIES, REPLIES, REPLIES);
    await allowAllChats(settings);
    const page = await personalPage(app);
    await focusMainWindow(app);
    // Suggestions come by themselves, as the chat's last message is someone
    // else's. They draw in a closed shadow root, so the run waits for them.
    await page.waitForTimeout(3000);
    // Nothing focused, so no focus ring draws on the page.
    await page.evaluate(() => {
      (document.activeElement as HTMLElement | null)?.blur();
    });
    await painted(page);
    await captureScreen('main', ['png', 'webp']);
    // A draft brings the rewrite button, whose arrow lists every way to rewrite.
    await page.getByTestId('composer').click();
    await page.keyboard.type('hey can we meet at the station at 10 instead, i think thats better');
    const arrow = await page.evaluate(() => {
      const row = document.querySelector('.compose-row');
      const tool = row?.children[row.children.length - 2]?.getBoundingClientRect();
      return tool === undefined ? null : { x: tool.right - 22, y: tool.top + tool.height / 2 };
    });
    expect(arrow).not.toBeNull();
    await page.mouse.click(arrow?.x ?? 0, arrow?.y ?? 0);
    // Away from the arrow, so its tooltip goes and no item shows as hovered.
    await page.mouse.move(40, 40);
    await page.waitForTimeout(1000);
    await painted(page);
    await captureScreen('rewrite', ['webp']);
  } finally {
    await closeApp(app);
    await showcase.close();
  }
});
