import type { ElectronApplication, Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { openFromMenu, showSettingsPage } from './chrome-helpers.ts';
import { expect, test } from './fixtures.ts';

/** Settings › Custom code, where the user's own CSS and JavaScript live (#710). */
async function openCustomCode(app: ElectronApplication): Promise<Page> {
  const settings = await openFromMenu(app, 'Settings…', 'settings.html');
  await showSettingsPage(settings, 'Custom code');
  await expect(settings.getByRole('button', { name: 'Save' })).toBeEnabled();
  return settings;
}

const outline = (window: Page) =>
  window.evaluate(() => getComputedStyle(document.body).outlineColor);

/** Waits until WhatsApp's page has the outline `color`. */
const outlined = async (window: Page, color: string): Promise<void> => {
  await expect(async () => {
    expect(await outline(window)).toBe(color);
  }).toPass();
};

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
  await editor.getByLabel('CSS for all accounts').fill('body { outline: 3px solid rgb(1, 2, 3) }');
  await outlined(window, before);
  await editor.getByRole('switch', { name: 'Use custom CSS and JavaScript' }).check();
  await outlined(window, 'rgb(1, 2, 3)');
  // A broken script for all accounts must not stop the account's own.
  await editor.getByLabel('JavaScript for all accounts').fill(')( not JavaScript');
  await editor.getByLabel('Applies to').selectOption({ label: 'WhatsApp' });
  // The account's own boxes are named for it, and what all accounts run there is folded under them (#748).
  await editor.getByRole('button', { name: 'Show' }).click();
  await expect(editor.getByText(')( not JavaScript')).toBeVisible();
  await editor
    .getByLabel('JavaScript for WhatsApp')
    .fill("document.body.dataset.custom = 'ran'; globalThis.customMarker = 1;");
  await editor.getByRole('button', { name: 'Save' }).click();
  await expect(editor.getByText('Saved.')).toBeVisible();
  await window.reload();
  await expect(window.getByTestId('fake-whatsapp')).toBeVisible();
  await expect(async () => {
    expect(await window.evaluate(() => document.body.dataset['custom'])).toBe('ran');
  }).toPass();
  // The script shares the page's DOM, never its JavaScript.
  expect(await window.evaluate(() => 'customMarker' in globalThis)).toBe(false);
  await outlined(window, 'rgb(1, 2, 3)');
  const saved = await readFile(join(profile, 'custom-code.json'), 'utf8');
  expect(JSON.parse(saved)).toMatchObject({ enabled: true });
  expect(await readFile(join(profile, 'settings.json'), 'utf8')).not.toContain('customMarker');
});

test('asks before another page throws away unsaved code, and takes its preview back', async ({
  app,
  window,
}) => {
  await expect(window.getByTestId('fake-whatsapp')).toBeVisible();
  const before = await outline(window);
  const editor = await openCustomCode(app);
  await editor.getByRole('switch', { name: 'Use custom CSS and JavaScript' }).check();
  await editor.getByLabel('CSS for all accounts').fill('body { outline: 3px solid rgb(4, 5, 6) }');
  await outlined(window, 'rgb(4, 5, 6)');
  const pages = editor.getByRole('navigation', { name: 'Settings sections' });
  await pages.getByRole('button', { name: 'Backup', exact: true }).click();
  const prompt = editor.getByRole('alertdialog');
  await expect(prompt).toContainText('Discard your unsaved changes to the code?');
  await prompt.getByRole('button', { name: 'Keep Editing' }).click();
  await expect(editor.getByRole('heading', { level: 1, name: 'Custom code' })).toBeVisible();
  await expect(editor.getByLabel('CSS for all accounts')).toHaveValue(/rgb\(4, 5, 6\)/);
  await pages.getByRole('button', { name: 'Backup', exact: true }).click();
  await prompt.getByRole('button', { name: 'Discard' }).click();
  await expect(editor.getByRole('heading', { level: 1, name: 'Backup' })).toBeVisible();
  await outlined(window, before);
});
