import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from './fixtures.ts';
import {
  chromePage,
  clickMenu,
  installExtension,
  runExtensionCommand,
} from './extension-helpers.ts';

// `pnpm build` builds the example extension with the app, as an author would build theirs.
const built = (file: string) =>
  readFile(
    fileURLToPath(new URL(`../../../extensions/example/dist/${file}`, import.meta.url)),
    'utf8',
  );

test('the example extension drafts the greeting the user chose in the open chat', async ({
  app,
  profile,
  window,
}) => {
  await expect(window.getByTestId('fake-whatsapp')).toBeVisible();
  const manifest = JSON.parse(await built('manifest.json')) as Record<string, unknown>;
  await installExtension(app, profile, manifest, await built('main.js'));
  await clickMenu(app, 'Extensions…');
  const extensions = await chromePage(app, '/extensions.html');
  await extensions.getByText('Settings').click();
  await extensions.getByLabel('Greeting').fill('Good morning! Coffee at 10?');
  await extensions.getByLabel('Greeting').blur();
  // The command reads the settings when it runs, so it waits until they are saved.
  const records = () => readFile(join(profile, 'extensions', '.extensions.json'), 'utf8');
  await expect.poll(records).toContain('Good morning! Coffee at 10?');
  await expect
    .poll(() => runExtensionCommand(app, 'Greeter: Draft a greeting'), { timeout: 20_000 })
    .toBe(true);
  await expect(window.getByTestId('composer')).toHaveText('Good morning! Coffee at 10?');
});
