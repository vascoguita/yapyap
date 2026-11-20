import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { closeApp, expect, launchApp, seedSettings, test, whatsAppPage } from './fixtures.ts';
import { chromePage, clickMenu, showSettingsPage } from './chrome-helpers.ts';
import { clickLastItem, lastMenu, recordMenus, shownMenus } from './menu-helpers.ts';

test('offers editing on a right click in the message box, and leads to Settings › Spelling', async ({
  app,
  window,
}) => {
  await recordMenus(app);
  await window.getByTestId('composer').click({ button: 'right' });
  await expect
    .poll(() => lastMenu(app))
    .toEqual(['Cut', 'Copy', 'Paste', '', 'Select All', '', 'Check Spelling']);
  const opened = app.waitForEvent('window');
  await clickLastItem(app);
  const settings = await opened;
  await settings.waitForURL('app://chrome/settings.html#spelling');
  await expect(settings.getByRole('switch', { name: 'Check spelling' })).not.toBeChecked();
});

// macOS selects the word under the pointer on a right click, so Copy is offered there.
test(
  'shows no menu where there is nothing to edit or copy',
  { tag: '@not-macos' },
  async ({ app, window }) => {
    await recordMenus(app);
    await window.getByTestId('fake-whatsapp').click({ button: 'right', position: { x: 2, y: 2 } });
    await window.getByTestId('composer').click({ button: 'right' });
    await expect.poll(() => lastMenu(app)).toBeDefined();
    expect(await shownMenus(app)).toBe(1);
  },
);

// macOS picks spelling languages itself.
test(
  'picks spelling languages from a searchable list in Settings',
  { tag: '@not-macos' },
  async ({ fakeWhatsApp, profile }) => {
    await seedSettings(profile, { spelling: { enabled: true } });
    // Spelling on makes Chromium fetch a dictionary; a dead proxy keeps the
    // test off the network, while loopback still reaches the fake page.
    const app = await launchApp(fakeWhatsApp.origin, profile, [
      '--proxy-server=http://127.0.0.1:1',
    ]);
    try {
      const window = await whatsAppPage(app);
      await recordMenus(app);
      await window.getByTestId('composer').click({ button: 'right' });
      await expect.poll(() => lastMenu(app)).toContain('Languages…');
      const opened = app.waitForEvent('window');
      await app.evaluate(() => {
        (globalThis as unknown as { shownMenus: Electron.Menu[] }).shownMenus
          .at(-1)
          ?.items.find((item) => item.label === 'Languages…')
          ?.click();
      });
      const languages = await opened;
      await languages.waitForURL('app://chrome/settings.html#spelling');
      await expect(languages.getByRole('switch', { name: 'Check spelling' })).toBeChecked();
      // Which one depends on whether the system's language has a dictionary.
      await expect(
        languages.getByText(/Your system’s language: |No dictionary for your system’s language/),
      ).toBeVisible();
      await languages.getByRole('searchbox', { name: 'Search languages' }).fill('portugues');
      await languages.getByRole('checkbox', { name: /português \(Portugal\)/ }).check();
      await expect(languages.getByText('1 language chosen')).toBeVisible();
      await expect
        .poll(async () => {
          const saved = JSON.parse(await readFile(join(profile, 'settings.json'), 'utf8')) as {
            spelling?: { languages?: string[] };
          };
          return saved.spelling?.languages;
        })
        .toEqual(['pt-PT']);
    } finally {
      await closeApp(app);
    }
  },
);

test(
  'shows a dictionary that could not be downloaded, offers Try Again, and says where dictionaries stay (#704)',
  { tag: '@not-macos' },
  async ({ fakeWhatsApp, profile }) => {
    await seedSettings(profile, { spelling: { enabled: true, languages: ['pt-PT'] } });
    // A dead proxy makes the dictionary's download fail, and keeps the test off the network.
    const app = await launchApp(fakeWhatsApp.origin, profile, [
      '--proxy-server=http://127.0.0.1:1',
    ]);
    try {
      await whatsAppPage(app);
      await clickMenu(app, 'Settings…');
      const settings = await chromePage(app, '/settings.html');
      await showSettingsPage(settings, 'Spelling');
      const portuguese = settings.getByRole('listitem').filter({ hasText: 'português (Portugal)' });
      await expect(portuguese.getByText('Could not download')).toBeVisible({ timeout: 20_000 });
      await portuguese.getByRole('button', { name: 'Try Again' }).click();
      // Trying again keeps the language chosen.
      await expect(portuguese.getByRole('checkbox')).toBeChecked();
      await expect(settings.getByText('1 language chosen')).toBeVisible();
      await expect(
        settings.getByText(`in ${join(profile, 'Dictionaries')}. A language you untick`, {
          exact: false,
        }),
      ).toBeVisible();
      await expect(settings.getByRole('button', { name: 'Show Folder' })).toBeVisible();
    } finally {
      await closeApp(app);
    }
  },
);
