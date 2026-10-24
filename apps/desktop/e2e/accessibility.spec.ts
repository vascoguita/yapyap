import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import type { ElectronApplication, Page } from '@playwright/test';
import type { AxeResults, RunOptions } from 'axe-core';
import { expect, test, whatsAppPage } from './fixtures.ts';

/** YapYap's own windows, by the menu item that opens them. */
const PAGES = [
  ['About YapYap', 'about.html'],
  ['Settings…', 'settings.html'],
  ['Manage Accounts…', 'accounts.html'],
  ['Plugins…', 'plugins.html'],
  ['Custom CSS and JavaScript…', 'custom-code.html'],
  ['Keyboard Shortcuts…', 'shortcuts.html'],
  ['Downloads…', 'downloads.html'],
  ['New Chat with Number…', 'new-chat.html'],
  ['Report a Problem…', 'report.html'],
] as const;

async function openChrome(app: ElectronApplication, label: string, page: string): Promise<Page> {
  await whatsAppPage(app);
  const opened = app.waitForEvent('window');
  await app.evaluate(({ Menu }, wanted) => {
    Menu.getApplicationMenu()
      ?.items.flatMap((menu) => menu.submenu?.items ?? [])
      .find((entry) => entry.label === wanted)
      ?.click();
  }, label);
  const window = await opened;
  await window.waitForURL(`app://chrome/${page}`);
  await window.waitForLoadState('load');
  return window;
}

const AXE = createRequire(import.meta.url).resolve('axe-core/axe.min.js');

/**
 * What axe finds against WCAG 2.2 AA, one line per rule and element. Axe is
 * evaluated over the DevTools protocol, which YapYap's strict CSP does not
 * govern, so the page itself keeps refusing inline and foreign scripts.
 */
async function violations(page: Page): Promise<string[]> {
  await page.evaluate(await readFile(AXE, 'utf8'));
  const options: RunOptions = {
    runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] },
  };
  const results = await page.evaluate(async (given) => {
    const { axe } = globalThis as unknown as {
      axe: { run: (context: Document, options: RunOptions) => Promise<AxeResults> };
    };
    const { violations: found } = await axe.run(document, given);
    return found.map(({ id, nodes }) => ({
      id,
      targets: nodes.map((node) => String(node.target)),
    }));
  }, options);
  return results.flatMap(({ id, targets }) => targets.map((target) => `${id}: ${target}`));
}

// Contrast differs between themes, so each page is checked in both.
for (const theme of ['light', 'dark'] as const) {
  for (const [label, page] of PAGES) {
    test(`${page} passes the WCAG 2.2 AA checks axe can make, ${theme}`, async ({ app }) => {
      await whatsAppPage(app);
      await app.evaluate(({ nativeTheme }, source) => {
        nativeTheme.themeSource = source;
      }, theme);
      const window = await openChrome(app, label, page);
      await expect(window.locator('body')).not.toBeEmpty();
      expect(await violations(window)).toEqual([]);
    });
  }
}

test('the axe check finds a problem when there is one', async ({ app }) => {
  const about = await openChrome(app, 'About YapYap', 'about.html');
  await about.evaluate(() => {
    const button = document.createElement('button');
    button.id = 'unlabelled';
    document.body.append(button);
  });
  expect(await violations(about)).toContain('button-name: #unlabelled');
});
