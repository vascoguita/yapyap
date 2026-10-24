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

/** Claude's streamed answer with three replies, as the Messages API sends it. */
const CLAUDE_ANSWER = [
  {
    type: 'message_start',
    message: {
      id: 'msg_e2e',
      type: 'message',
      role: 'assistant',
      content: [],
      model: 'claude-opus-5-5',
      stop_reason: null,
      stop_sequence: null,
      usage: { input_tokens: 1, output_tokens: 1 },
    },
  },
  { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
  {
    type: 'content_block_delta',
    index: 0,
    delta: { type: 'text_delta', text: 'Yes, 8 works!\nCan we do 9?\nSee you there' },
  },
  { type: 'content_block_stop', index: 0 },
  {
    type: 'message_delta',
    delta: { stop_reason: 'end_turn', stop_sequence: null },
    usage: { output_tokens: 3 },
  },
  { type: 'message_stop' },
]
  .map((event) => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`)
  .join('');

test('suggests replies only in an allowed chat, after showing what it sends, and drafts the pick', async ({
  app,
  profile,
  window,
}) => {
  await expect(window.getByTestId('fake-whatsapp')).toBeVisible();
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
  // Claude is played by a handler on the plugin's own session; nothing reaches the real API.
  await app.evaluate(({ session }, body) => {
    const asked: string[] = [];
    Object.assign(globalThis, { claudeRequests: asked });
    session
      .fromPartition('persist:plugin:org.example.ai-assistant')
      .protocol.handle('https', async (request) => {
        asked.push(await request.text());
        return new Response(body, { headers: { 'content-type': 'text/event-stream' } });
      });
  }, CLAUDE_ANSWER);
  const open = () =>
    app.evaluate(({ Menu }) => {
      const panel = Menu.getApplicationMenu()
        ?.items.flatMap((menu) => menu.submenu?.items ?? [])
        .find((entry) => entry.label === 'Plugin Commands')
        ?.submenu?.items.find((entry) => entry.label === 'AI assistant: Assistant');
      panel?.click();
      return panel !== undefined;
    });
  await expect.poll(open, { timeout: 20_000 }).toBe(true);
  const panel = await chromePage(app, '/__yapyap/panel.html');
  await panel.getByLabel('API key').fill('sk-ant-e2e-key');
  await panel.getByRole('button', { name: 'Save key' }).click();
  await expect(panel.getByRole('status')).toContainText('Ready.');
  await panel.getByRole('button', { name: 'Look at this chat' }).click();
  await expect(panel.getByText('The assistant is off in “Test Chat One”.')).toBeVisible();
  await panel.getByRole('button', { name: 'Allow in this chat' }).click();
  const preview = panel.locator('#preview');
  await expect(preview).toContainText('Them: Dinner tonight?');
  await expect(preview).toContainText('Me: See you at 8');
  await panel.getByRole('button', { name: 'Send', exact: true }).click();
  await panel.getByRole('button', { name: 'Can we do 9?' }).click();
  await expect(window.getByTestId('composer')).toHaveText('Can we do 9?');
  const asked = await app.evaluate(
    () => (globalThis as { claudeRequests?: string[] }).claudeRequests ?? [],
  );
  expect(asked).toHaveLength(1);
  expect(asked[0]).toContain('Them: Dinner tonight?');
});
