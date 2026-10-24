import type { ElectronApplication } from '@playwright/test';

type Recorded = typeof globalThis & { shownMenus: Electron.Menu[] };

/** Records each context menu instead of showing it, which Playwright cannot see. */
export const recordMenus = (app: ElectronApplication): Promise<void> =>
  app.evaluate(({ Menu }) => {
    const shown: Electron.Menu[] = [];
    Object.assign(globalThis, { shownMenus: shown });
    Menu.prototype.popup = function record(this: Electron.Menu) {
      shown.push(this);
    };
  });

/** How many context menus were shown since `recordMenus`. */
export const shownMenus = (app: ElectronApplication): Promise<number> =>
  app.evaluate(() => (globalThis as Recorded).shownMenus.length);

/** The labels of the last context menu shown. */
export const lastMenu = (app: ElectronApplication): Promise<string[] | undefined> =>
  app.evaluate(() => (globalThis as Recorded).shownMenus.at(-1)?.items.map((item) => item.label));

/** Clicks the last item of the last context menu shown. */
export const clickLastItem = (app: ElectronApplication): Promise<void> =>
  app.evaluate(() => {
    (globalThis as Recorded).shownMenus.at(-1)?.items.at(-1)?.click();
  });
