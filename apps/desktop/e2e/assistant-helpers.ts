import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
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

/** Claude's models, newest first, as Anthropic lists them. */
const CLAUDE_MODELS = JSON.stringify({
  data: [
    {
      type: 'model',
      id: 'claude-opus-5-5',
      display_name: 'Claude Opus 5.5',
      created_at: '2026-01-01T00:00:00Z',
    },
    {
      type: 'model',
      id: 'claude-haiku-5-5',
      display_name: 'Claude Haiku 5.5',
      created_at: '2026-01-01T00:00:00Z',
    },
  ],
  has_more: false,
  first_id: null,
  last_id: null,
});

/**
 * Plays Claude on the assistant's own session, so nothing reaches the real
 * API: it lists two models, and answers every message with `answer`,
 * keeping what was asked in `claudeRequests`.
 */
export async function playClaude(app: ElectronApplication, answer: string): Promise<void> {
  await app.evaluate(
    ({ session }, { body, models }) => {
      const asked: string[] = [];
      Object.assign(globalThis, { claudeRequests: asked });
      session
        .fromPartition('persist:extension:org.example.ai-assistant')
        .protocol.handle('https', async (request) => {
          if (new URL(request.url).pathname === '/v1/models') {
            return new Response(models, { headers: { 'content-type': 'application/json' } });
          }
          asked.push(await request.text());
          return new Response(body, { headers: { 'content-type': 'text/event-stream' } });
        });
    },
    { body: answer, models: CLAUDE_MODELS },
  );
}

/** Three suggested replies. */
export const CLAUDE_ANSWER = claudeAnswer('Yes, 8 works!\nCan we do 9?\nSee you there');

/**
 * Installs the built assistant with a stand-in keyring and Claude answering
 * `answer`, opens its panel and saves a key; returns the panel.
 */
/** The test system has no keyring, so encryption is stood in for, reversibly. */
export async function standInKeyring(app: ElectronApplication): Promise<void> {
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
}

/** Opens the assistant's panel from the menu, once the assistant runs. */
export async function openAssistantPanel(app: ElectronApplication): Promise<Page> {
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
  return chromePage(app, '/__yapyap/panel.html');
}

/** A model server on this computer, as the E2E tests run it. */
export interface FakeModelServer {
  readonly port: number;
  /** The chat requests it answered, as their bodies. */
  readonly chats: string[];
  readonly close: () => void;
}

/**
 * An OpenAI-compatible server on a free loopback port, as Ollama or LM Studio
 * would run one: it lists one model and streams `answer` to every chat.
 */
export async function fakeModelServer(answer: string): Promise<FakeModelServer> {
  const chats: string[] = [];
  const server = createServer((request, response) => {
    if (request.method === 'GET' && request.url === '/v1/models') {
      response.setHeader('content-type', 'application/json');
      response.end(
        JSON.stringify({
          object: 'list',
          data: [{ id: 'tiny-e2e', object: 'model', created: 1, owned_by: 'e2e' }],
        }),
      );
      return;
    }
    if (request.method === 'POST' && request.url === '/v1/chat/completions') {
      let body = '';
      request.on('data', (chunk: Buffer) => (body += chunk.toString()));
      request.on('end', () => {
        chats.push(body);
        response.setHeader('content-type', 'text/event-stream');
        response.end(openAIAnswer(answer));
      });
      return;
    }
    response.statusCode = 404;
    response.end();
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return { port, chats, close: () => server.close() };
}

/** `text` as an OpenAI-compatible server streams a chat answer. */
const openAIAnswer = (text: string): string =>
  [
    { choices: [{ index: 0, delta: { role: 'assistant', content: text }, finish_reason: null }] },
    { choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] },
  ]
    .map(
      (chunk) =>
        `data: ${JSON.stringify({ id: 'e2e', object: 'chat.completion.chunk', created: 1, model: 'tiny-e2e', ...chunk })}\n\n`,
    )
    .join('')
    .concat('data: [DONE]\n\n');

/** A free loopback port where nothing listens, for a search that finds nothing. */
export async function quietPort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  await new Promise<void>((resolve) => {
    server.close(() => {
      resolve();
    });
  });
  return port;
}

export async function readyAssistant(
  app: ElectronApplication,
  profile: string,
  answer: string,
): Promise<Page> {
  await standInKeyring(app);
  const { manifest, main, others } = await builtAssistant();
  await installExtension(app, profile, manifest, main, others);
  await playClaude(app, answer);
  const panel = await openAssistantPanel(app);
  await panel.getByLabel('API key').fill('sk-ant-e2e-key');
  await panel.getByRole('button', { name: 'Save key' }).click();
  // Ready waits for the provider's list of models, which Auto picks from.
  await expect(panel.getByRole('status')).toContainText('Ready.', { timeout: 20_000 });
  return panel;
}
