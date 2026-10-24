import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from './fixtures.ts';
import { chromePage, clickMenu, installPlugin, runPluginCommand } from './plugin-helpers.ts';

// `pnpm build` builds the example plugin with the app, as an author would build theirs.
const built = (file: string) =>
  readFile(
    fileURLToPath(new URL(`../../../plugins/example/dist/${file}`, import.meta.url)),
    'utf8',
  );

test('the example plugin drafts the greeting the user chose in the open chat', async ({
  app,
  profile,
  window,
}) => {
  await expect(window.getByTestId('fake-whatsapp')).toBeVisible();
  const manifest = JSON.parse(await built('manifest.json')) as Record<string, unknown>;
  await installPlugin(app, profile, manifest, await built('main.js'));
  await clickMenu(app, 'Plugins…');
  const plugins = await chromePage(app, '/plugins.html');
  await plugins.getByText('Settings').click();
  await plugins.getByLabel('Greeting').fill('Good morning! Coffee at 10?');
  await plugins.getByLabel('Greeting').blur();
  // The command reads the settings when it runs, so it waits until they are saved.
  const records = () => readFile(join(profile, 'plugins', '.plugins.json'), 'utf8');
  await expect.poll(records).toContain('Good morning! Coffee at 10?');
  await expect
    .poll(() => runPluginCommand(app, 'Greeter: Draft a greeting'), { timeout: 20_000 })
    .toBe(true);
  await expect(window.getByTestId('composer')).toHaveText('Good morning! Coffee at 10?');
});
