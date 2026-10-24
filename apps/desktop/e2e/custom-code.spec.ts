import type { ElectronApplication, Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, test } from './fixtures.ts';

const PAGE = 'app://chrome/custom-code.html';

async function openCustomCode(app: ElectronApplication): Promise<Page> {
  await app.evaluate(({ Menu }) => {
    Menu.getApplicationMenu()
      ?.items.flatMap((menu) => menu.submenu?.items ?? [])
      .find((entry) => entry.label === 'Custom CSS and JavaScript…')
      ?.click();
  });
  await expect.poll(() => app.windows().some((page) => page.url() === PAGE)).toBe(true);
  const page = app.windows().find((candidate) => candidate.url() === PAGE);
  if (page === undefined) {
    throw new Error('The Custom CSS and JavaScript window did not open.');
  }
  return page;
}

const outline = (window: Page) =>
  window.evaluate(() => getComputedStyle(document.body).outlineColor);

test('shows custom CSS as it is typed, and runs saved scripts apart from WhatsApp’s', async ({
  app,
  window,
  profile,
}) => {
  await expect(window.getByTestId('fake-whatsapp')).toBeVisible();
  const before = await outline(window);
  const editor = await openCustomCode(app);
  await expect(editor.getByText(/can read your chats/)).toBeVisible();
  // Off by default: CSS typed now changes nothing in WhatsApp.
  await editor.getByLabel('CSS', { exact: true }).fill('body { outline: 3px solid rgb(1, 2, 3) }');
  await expect.poll(() => outline(window)).toBe(before);
  await editor.getByLabel('Use custom CSS and JavaScript').check();
  await expect.poll(() => outline(window)).toBe('rgb(1, 2, 3)');
  // A broken script for all accounts must not stop the account's own.
  await editor.getByLabel('JavaScript', { exact: true }).fill(')( not JavaScript');
  await editor.getByLabel('Applies to').selectOption({ label: 'WhatsApp' });
  await editor
    .getByLabel('JavaScript', { exact: true })
    .fill("document.body.dataset.custom = 'ran'; globalThis.customMarker = 1;");
  await editor.getByRole('button', { name: 'Save' }).click();
  await expect(editor.getByText('Saved.')).toBeVisible();
  await window.reload();
  await expect(window.getByTestId('fake-whatsapp')).toBeVisible();
  await expect.poll(() => window.evaluate(() => document.body.dataset['custom'])).toBe('ran');
  // The script shares the page's DOM, never its JavaScript.
  expect(await window.evaluate(() => 'customMarker' in globalThis)).toBe(false);
  await expect.poll(() => outline(window)).toBe('rgb(1, 2, 3)');
  const saved = await readFile(join(profile, 'custom-code.json'), 'utf8');
  expect(JSON.parse(saved)).toMatchObject({ enabled: true });
  expect(await readFile(join(profile, 'settings.json'), 'utf8')).not.toContain('customMarker');
});
