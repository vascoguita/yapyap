import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from './fixtures.ts';
import { chromePage, installPlugin } from './plugin-helpers.ts';

// `pnpm build` bundles the assistant with Vite, as its release would be.
const DIST = fileURLToPath(new URL('../../../plugins/ai-assistant/dist/', import.meta.url));

/** The built assistant, under a third-party ID: only YapYap's own key may sign its real one. */
async function builtAssistant() {
  const manifest = JSON.parse(await readFile(join(DIST, 'manifest.json'), 'utf8')) as Record<
    string,
    unknown
  >;
  const names = (await readdir(DIST)).filter((name) => name.endsWith('.js'));
  const files = Object.fromEntries(
    await Promise.all(
      names.map(async (name) => [name, await readFile(join(DIST, name), 'utf8')] as const),
    ),
  );
  const { 'main.js': main = '', ...others } = files;
  return { manifest: { ...manifest, id: 'org.example.ai-assistant' }, main, others };
}

test('keeps the key the user pastes in the assistant’s panel with YapYap’s secrets', async ({
  app,
  profile,
}) => {
  // The test system has no keyring, so encryption is stood in for, reversibly.
  await app.evaluate(({ safeStorage }) => {
    safeStorage.isAsyncEncryptionAvailable = () => Promise.resolve(true);
    safeStorage.getSelectedStorageBackend = () => 'gnome_libsecret';
    safeStorage.encryptStringAsync = (text: string) =>
      Promise.resolve(Buffer.from(`sealed:${text}`));
    safeStorage.decryptStringAsync = (sealed: Buffer) =>
      Promise.resolve({
        result: sealed.toString().slice('sealed:'.length),
        shouldReEncrypt: false,
      });
  });
  const { manifest, main, others } = await builtAssistant();
  await installPlugin(app, profile, manifest, main, others);
  const open = () =>
    app.evaluate(({ Menu }) => {
      const plugins = Menu.getApplicationMenu()
        ?.items.flatMap((menu) => menu.submenu?.items ?? [])
        .find((entry) => entry.label === 'Plugin Commands');
      const panel = plugins?.submenu?.items.find(
        (entry) => entry.label === 'AI assistant: Assistant',
      );
      panel?.click();
      return panel !== undefined;
    });
  await expect.poll(open, { timeout: 20_000 }).toBe(true);
  const panel = await chromePage(app, '/__yapyap/panel.html');
  const status = panel.getByRole('status');
  await expect(status).toHaveText(
    'Using Claude (Anthropic), model claude-opus-5-5. Paste your API key to start.',
  );
  await panel.getByLabel('API key').fill('sk-ant-e2e-key');
  await panel.getByRole('button', { name: 'Save key' }).click();
  await expect(status).toHaveText('Using Claude (Anthropic), model claude-opus-5-5. Ready.');
  await expect(panel.getByLabel('API key')).toHaveValue('');
  const kept = await readFile(join(profile, 'plugins', '.secrets.json'), 'utf8');
  expect(kept).not.toContain('sk-ant-e2e-key');
  await panel.getByRole('button', { name: 'Forget key' }).click();
  await expect(status).toContainText('Paste your API key to start.');
});
