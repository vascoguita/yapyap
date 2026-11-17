import type { ElectronApplication, Page } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { closeApp, expect, launchApp, seedSettings } from '../fixtures.ts';

/**
 * What the README's, website's and app stores' pictures share: two invented
 * accounts on the showcase page, in a window at the screen's corner.
 */
export const SCALE = 2;
export const PERSONAL = '0b6c3f0e-58a4-4a39-9a43-6f0c1c1f6a01';
const WORK = '7d2e9b1c-3f4a-4c5d-8e6f-1a2b3c4d5e6f';

/** The main window's size; wide enough for three suggested replies in a row. */
export const MAIN = { width: 1440, height: 880 };

export async function seed(profile: string, theme: 'light' | 'dark'): Promise<void> {
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

/**
 * Gives the Work account its own persona in its own storage, which outlives
 * a restart, so both accounts load as themselves, photos included, the
 * next time YapYap starts.
 */
export async function preparePersonas(origin: string, profile: string): Promise<void> {
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

/** The Personal account's WhatsApp, which the main window shows. */
export async function personalPage(app: ElectronApplication): Promise<Page> {
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
export async function focusMainWindow(app: ElectronApplication): Promise<void> {
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
export async function painted(page: Page): Promise<void> {
  await page.evaluate(async () => {
    await document.fonts.ready;
    for (let frame = 0; frame < 2; frame += 1) {
      await new Promise((done) => requestAnimationFrame(done));
    }
  });
}
