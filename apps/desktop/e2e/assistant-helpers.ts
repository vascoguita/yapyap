import type { ElectronApplication, Page } from '@playwright/test';
import { expect } from './fixtures.ts';
import {
  builtExtension,
  chromePage,
  installExtension,
  type BuiltExtension,
} from './extension-helpers.ts';

/** The built assistant, under a third-party ID: only YapYap's own key may sign its real one. */
export const builtAssistant = (): Promise<BuiltExtension> =>
  builtExtension('ai-assistant', 'org.example.ai-assistant');

/** Claude's streamed answer saying `text`, as the Messages API sends it. */
export const claudeAnswer = (text: string): string =>
  [
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
      delta: { type: 'text_delta', text },
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

/** Three suggested replies. */
export const CLAUDE_ANSWER = claudeAnswer('Yes, 8 works!\nCan we do 9?\nSee you there');

/**
 * Installs the built assistant with a stand-in keyring and Claude answering
 * `answer`, opens its panel and saves a key; returns the panel.
 */
export async function readyAssistant(
  app: ElectronApplication,
  profile: string,
  answer: string,
): Promise<Page> {
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
  await installExtension(app, profile, manifest, main, others);
  // Claude is played by a handler on the extension's own session; nothing reaches the real API.
  await app.evaluate(({ session }, body) => {
    const asked: string[] = [];
    Object.assign(globalThis, { claudeRequests: asked });
    session
      .fromPartition('persist:extension:org.example.ai-assistant')
      .protocol.handle('https', async (request) => {
        asked.push(await request.text());
        return new Response(body, { headers: { 'content-type': 'text/event-stream' } });
      });
  }, answer);
  const open = () =>
    app.evaluate(({ Menu }) => {
      const panel = Menu.getApplicationMenu()
        ?.items.flatMap((menu) => menu.submenu?.items ?? [])
        .find((entry) => entry.label === 'Extension Commands')
        ?.submenu?.items.find((entry) => entry.label === 'AI assistant: Assistant');
      panel?.click();
      return panel !== undefined;
    });
  await expect.poll(open, { timeout: 20_000 }).toBe(true);
  const panel = await chromePage(app, '/__yapyap/panel.html');
  await panel.getByLabel('API key').fill('sk-ant-e2e-key');
  await panel.getByRole('button', { name: 'Save key' }).click();
  await expect(panel.getByRole('status')).toContainText('Ready.');
  return panel;
}
