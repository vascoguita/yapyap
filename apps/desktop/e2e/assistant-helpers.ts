import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { ElectronApplication, Page } from '@playwright/test';
import { ADAPTER_WORLD_ID } from '../src/adapter/world.ts';
import { chromePage, clickMenu, showSettingsPage } from './chrome-helpers.ts';
import { expect, mainWindow, whatsAppContents } from './fixtures.ts';

/** A control of the assistant bar, and where on the page the user would click it. */
interface BarControl {
  readonly name: string;
  readonly disabled: boolean;
  readonly x: number;
  readonly y: number;
}

interface KeptBar {
  readonly host: HTMLElement;
  readonly parts: {
    readonly bar: HTMLElement;
    readonly text: HTMLElement;
    readonly notice: HTMLElement;
  };
}

/**
 * Runs in the adapter's isolated world, where YapYap keeps the bar: its
 * shadow root is closed, so nothing else, Playwright included, can look in.
 * A suggestion is named by its text, an icon button by its label. The fake
 * page scrolls as a whole, so the control named `shown`, or else the bar,
 * is scrolled into view first: the summary's box hangs below the chat's
 * header, far above the bar.
 */
function readBarControls(shown: string | null): BarControl[] | null {
  const kept = (globalThis as { yapyapAssistantBarView?: KeptBar }).yapyapAssistantBarView;
  if (kept?.host.isConnected !== true) {
    return null;
  }
  const root = kept.parts.bar.getRootNode() as ShadowRoot;
  const nameOf = (control: HTMLButtonElement) =>
    control.getAttribute('aria-label') ?? control.textContent;
  const buttons = [...root.querySelectorAll<HTMLButtonElement>('button')];
  (buttons.find((control) => nameOf(control) === shown) ?? kept.host).scrollIntoView({
    block: 'center',
  });
  return (
    buttons
      // Controls in a hidden row take no room, and cannot be clicked.
      .filter((control) => control.getClientRects().length > 0)
      .map((control) => {
        const box = control.getBoundingClientRect();
        return {
          name: nameOf(control),
          disabled: control.disabled,
          x: box.x + box.width / 2,
          y: box.y + box.height / 2,
        };
      })
  );
}

/** Runs in the adapter's isolated world, as {@link readBarControls} does: the notice, while it shows. */
function readBarNotice(): string | null {
  const kept = (globalThis as { yapyapAssistantBarView?: KeptBar }).yapyapAssistantBarView;
  const shown = kept?.host.isConnected === true && kept.parts.notice.getClientRects().length > 0;
  return shown ? kept.parts.text.textContent : null;
}

/** Runs `read` in the adapter's isolated world of WhatsApp's page, where the bar lives, given `value`. */
const inBarWorld = async (
  app: ElectronApplication,
  read: (value: string | null) => unknown,
  value: string | null = null,
): Promise<unknown> =>
  (await whatsAppContents(app)).evaluate(
    (page, { code, world }): Promise<unknown> =>
      page.executeJavaScriptInIsolatedWorld(world, [{ code }]),
    { code: `(${read.toString()})(${JSON.stringify(value)})`, world: ADAPTER_WORLD_ID },
  );

/** The notice above the message box in the active account's WhatsApp, or null while none shows. */
export const barNotice = async (app: ElectronApplication): Promise<string | null> => {
  const notice = await inBarWorld(app, readBarNotice);
  return typeof notice === 'string' ? notice : null;
};

/** What the summary's box shows, and where it hangs: its distances from the chat's header and inline end (#705). */
interface ShownSummary {
  readonly title: string;
  readonly line: string | null;
  readonly headings: string[];
  readonly items: string[];
  readonly covers: string | null;
  readonly below: number;
  readonly end: number;
}

/**
 * Runs in the adapter's isolated world, as {@link readBarControls} does:
 * the summary's box while it shows, or null.
 */
function readBarSummary(): ShownSummary | null {
  const kept = (globalThis as { yapyapAssistantBarView?: { parts: { card: HTMLElement } } })
    .yapyapAssistantBarView;
  const card = kept?.parts.card;
  if (card === undefined || card.getClientRects().length === 0) {
    return null;
  }
  const texts = (selector: string) =>
    [...card.querySelectorAll(selector)].map((node) => node.textContent);
  const covers = card.querySelector<HTMLElement>('.covers');
  const box = card.getBoundingClientRect();
  const edge = (selector: string, side: 'bottom' | 'right') =>
    document.querySelector(selector)?.getBoundingClientRect()[side] ?? 0;
  return {
    title: String(card.querySelector('h2')?.textContent),
    line: texts('.card-line')[0] ?? null,
    headings: texts('h3'),
    items: texts('li'),
    covers: covers === null || covers.hidden ? null : covers.textContent,
    below: Math.round(box.top - edge('#main header', 'bottom')),
    end: Math.round(edge('#main', 'right') - box.right),
  };
}

/** The summary's box in the active account's WhatsApp, or null while none shows (#705). */
export const barSummary = async (app: ElectronApplication): Promise<ShownSummary | null> =>
  ((await inBarWorld(app, readBarSummary)) ?? null) as ShownSummary | null;

/** The assistant bar's controls that show in the active account's WhatsApp, or null while it is not there. */
const assistantBarControls = async (
  app: ElectronApplication,
  shown: string | null = null,
): Promise<BarControl[] | null> =>
  ((await inBarWorld(app, readBarControls, shown)) ?? null) as BarControl[] | null;

/**
 * Clicks a control of the assistant bar as the user would, with the mouse:
 * the bar ignores clicks that page scripts make up.
 */
export async function clickInBar(
  app: ElectronApplication,
  page: Page,
  name: string,
): Promise<void> {
  let control: BarControl | undefined;
  await expect(async () => {
    control = (await assistantBarControls(app, name))?.find(
      (each) => each.name === name && !each.disabled,
    );
    expect(control, `the bar’s ${name}`).toBeDefined();
  }).toPass();
  if (control === undefined) {
    throw new Error(`The bar has no ${name}.`);
  }
  await page.mouse.click(control.x, control.y);
}

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
    { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text } },
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
      id: 'claude-sonnet-5-5',
      display_name: 'Claude Sonnet 5.5',
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
 * An answer Claude gives only to a request that contains `when`, such as
 * a message of the chat or "Rewrite my draft": the chat a window opens on
 * may be asked about first, so tests that need different answers pick them
 * by what is asked rather than by order (#723).
 */
interface AnswerWhen {
  readonly when: string;
  readonly body: string;
  /** How long Claude takes to answer, so a test can see the assistant wait. */
  readonly delay?: number;
}

/**
 * Plays Claude on the assistant's own session, so nothing reaches the real
 * API: it lists two models, and answers every message with the first
 * {@link AnswerWhen} it matches, else with the next of the other
 * `answers`, the last one again once they run out, keeping what was asked
 * in `claudeRequests`.
 */
async function playClaude(
  app: ElectronApplication,
  ...answers: readonly (string | AnswerWhen)[]
): Promise<void> {
  await app.evaluate(
    ({ session }, { bodies, rules, models }) => {
      const asked: string[] = [];
      Object.assign(globalThis, { claudeRequests: asked });
      session.fromPartition('yapyap-assistant').protocol.handle('https', async (request) => {
        if (new URL(request.url).pathname === '/v1/models') {
          return new Response(models, { headers: { 'content-type': 'application/json' } });
        }
        const text = await request.text();
        asked.push(text);
        const rule = rules.find(({ when }) => text.includes(when));
        await new Promise((resolve) => setTimeout(resolve, rule?.delay ?? 0));
        const body = rule?.body ?? bodies[Math.min(asked.length, bodies.length) - 1] ?? '';
        return new Response(body, { headers: { 'content-type': 'text/event-stream' } });
      });
    },
    {
      bodies: answers.filter((answer) => typeof answer === 'string'),
      rules: answers.filter((answer) => typeof answer !== 'string'),
      models: CLAUDE_MODELS,
    },
  );
}

/** What Claude was asked since {@link playClaude}, as the request bodies. */
export const claudeRequests = (app: ElectronApplication): Promise<string[]> =>
  app.evaluate(() => (globalThis as { claudeRequests?: string[] }).claudeRequests ?? []);

/**
 * How many requests Claude got once none came for three seconds, longer
 * than a look at the chat and a message settling take together. The chat
 * a window opens on may be asked about too, and on a slow start its
 * request can come after a test's message, so a test counts from here
 * (#725).
 */
export async function settledRequests(app: ElectronApplication, page: Page): Promise<number> {
  let count = 0;
  await expect(async () => {
    const before = (await claudeRequests(app)).length;
    await page.waitForTimeout(3000);
    count = (await claudeRequests(app)).length;
    expect(count).toBe(before);
  }).toPass({ timeout: 30_000 });
  return count;
}

/**
 * Runs in the adapter's isolated world, where YapYap keeps the message box's
 * rewrite button (#609): its controls that show, named as the user hears them.
 */
function readToolControls(): BarControl[] | null {
  const kept = (
    globalThis as { yapyapComposerToolView?: { host: HTMLElement; parts: { tool: HTMLElement } } }
  ).yapyapComposerToolView;
  if (kept?.host.isConnected !== true) {
    return null;
  }
  return [...kept.parts.tool.querySelectorAll<HTMLButtonElement>('button')]
    .filter((control) => control.getClientRects().length > 0)
    .map((control) => {
      const box = control.getBoundingClientRect();
      return {
        name:
          control.getAttribute('aria-label') ??
          control.querySelector('.name')?.textContent ??
          control.textContent,
        disabled: control.disabled,
        x: box.x + box.width / 2,
        y: box.y + box.height / 2,
      };
    });
}

/**
 * Clicks a control of the message box's rewrite button, or a way in its
 * list, as the user would, with the mouse: it ignores clicks page scripts make up.
 */
export async function clickInTool(
  app: ElectronApplication,
  page: Page,
  name: string,
): Promise<void> {
  let control: BarControl | undefined;
  await expect(async () => {
    const controls = ((await inBarWorld(app, readToolControls)) ?? []) as BarControl[];
    control = controls.find((each) => each.name === name && !each.disabled);
    expect(control, `the rewrite button’s ${name}`).toBeDefined();
  }).toPass();
  if (control === undefined) {
    throw new Error(`The rewrite button has no ${name}.`);
  }
  await page.mouse.click(control.x, control.y);
}

/** Three suggested replies. */
export const CLAUDE_ANSWER = claudeAnswer('Yes, 8 works!\nCan we do 9?\nSee you there');

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

/** Opens Settings from the menu, at its Assistant page. */
export async function openAssistantSettings(app: ElectronApplication): Promise<Page> {
  await clickMenu(app, 'Settings…');
  const settings = await chromePage(app, '/settings.html');
  await showSettingsPage(settings, 'AI Assistant');
  return settings;
}

/** Saves an API key for Claude in Settings › Assistant, with Claude played by {@link playClaude}. */
export async function readyClaude(
  app: ElectronApplication,
  ...answers: readonly (string | AnswerWhen)[]
): Promise<Page> {
  await standInKeyring(app);
  await playClaude(app, ...answers);
  const settings = await openAssistantSettings(app);
  // Only the chosen provider shows its key field.
  await settings.getByRole('radio', { name: 'Claude (Anthropic)' }).check();
  await settings.getByLabel('API key', { exact: true }).fill('sk-ant-e2e-key');
  await settings.getByRole('button', { name: 'Save Key' }).click();
  await expect(settings.locator('#provider-anthropic-pill')).toHaveText('Key saved');
  return settings;
}

/** The names of the bar's controls that show: the suggestions, and the notice's buttons. */
export const barNames = async (app: ElectronApplication): Promise<string[]> =>
  (await assistantBarControls(app))?.map(({ name }) => name) ?? [];

/** The names of the rewrite button's controls that show; none while it is away. */
export const toolNames = async (app: ElectronApplication): Promise<string[]> =>
  (((await inBarWorld(app, readToolControls)) ?? []) as BarControl[]).map(({ name }) => name);

/**
 * Focuses YapYap's main window, as the user's click would: a virtual
 * display without a window manager focuses nothing on its own, and the
 * assistant follows the open chat only while the window is on screen.
 */
export async function focusMain(app: ElectronApplication): Promise<void> {
  const main = await mainWindow(app);
  await expect(async () => {
    expect(
      await main.evaluate((owner) => {
        owner.focus();
        return owner.isFocused();
      }),
    ).toBe(true);
  }).toPass();
}

/** A message from someone else arrives in the open chat of the fake WhatsApp page. */
export async function messageArrives(page: Page, id: string, text: string): Promise<void> {
  await page.evaluate(
    ({ id, text }) => {
      const row = document.createElement('div');
      row.setAttribute('role', 'row');
      const message = document.createElement('div');
      message.dataset['id'] = id;
      // As WhatsApp marks a message's text for copying, which is where the chat reader finds it.
      const copyable = document.createElement('div');
      copyable.dataset['prePlainText'] = '[20:05, 24/10/2026] Test Chat One: ';
      const body = document.createElement('span');
      body.dataset['testid'] = 'selectable-text';
      body.textContent = text;
      copyable.append(body);
      message.append(copyable);
      row.append(message);
      const rows = document.querySelectorAll('#main [role="row"]');
      rows[rows.length - 1]?.after(row);
    },
    { id, text },
  );
}

/**
 * The contact edits message `id` in the open chat of the fake WhatsApp
 * page, as WhatsApp shows an edit: the same row, with the same ID, says
 * `text` now, and "Edited" shows beside its time (#739).
 */
export async function messageEdited(page: Page, id: string, text: string): Promise<void> {
  await page.evaluate(
    ({ id, text }) => {
      const message = document.querySelector(`#main [data-id="${id}"]`);
      const body = message?.querySelector('[data-pre-plain-text] [data-testid="selectable-text"]');
      if (message === null || body === null || body === undefined) {
        throw new Error(`No message ${id} to edit`);
      }
      body.textContent = text;
      const edited = document.createElement('span');
      edited.textContent = 'Edited';
      message.append(edited);
    },
    { id, text },
  );
}

/**
 * The user chooses Reply on message `id` in the open chat of the fake
 * WhatsApp page, which quotes it above the message box, as WhatsApp does,
 * with its sender's name, its text and a × that removes it (#740).
 */
export async function chooseReply(page: Page, id: string, author: string): Promise<void> {
  await page.evaluate(
    ({ id, author }) => {
      const body = document.querySelector(
        `#main [data-id="${id}"] [data-pre-plain-text] [data-testid="selectable-text"]`,
      );
      if (body === null) {
        throw new Error(`No message ${id} to reply to`);
      }
      document.querySelector('[data-testid="reply-preview"]')?.remove();
      const preview = document.createElement('div');
      preview.dataset['testid'] = 'reply-preview';
      const quote = document.createElement('div');
      quote.dataset['testid'] = 'quoted-message';
      const sender = document.createElement('span');
      sender.dataset['testid'] = 'author';
      sender.textContent = author;
      const text = document.createElement('span');
      text.textContent = body.textContent;
      quote.append(sender, text);
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.dataset['testid'] = 'cancel-reply';
      remove.setAttribute('aria-label', 'Cancel reply');
      remove.textContent = '×';
      preview.append(quote, remove);
      // WhatsApp puts it after the message box, and draws it over the space above it.
      document.querySelector('#main footer')?.append(preview);
    },
    { id, author },
  );
}

/**
 * Where the fake page lays out the chat's end, the assistant's bar, the
 * quote of the message the user replies to and the message box, as the
 * top or bottom edges that meet (#740); 0 for one that is not there.
 */
export async function replyLayout(page: Page): Promise<{
  readonly chatEnd: number;
  readonly barTop: number;
  readonly barEnd: number;
  readonly quoteTop: number;
  readonly boxTop: number;
}> {
  return page.evaluate(() => {
    const box = (selector: string) =>
      document.querySelector(selector)?.getBoundingClientRect() ?? new DOMRect();
    const footer = document.querySelector('#main footer');
    const bar = footer?.previousElementSibling?.getBoundingClientRect() ?? new DOMRect();
    return {
      chatEnd: box('[data-testid="conversation-panel-body"]').bottom,
      barTop: bar.top,
      barEnd: bar.bottom,
      quoteTop: box('[data-testid="reply-preview"]').top,
      boxTop: box('#main footer').top,
    };
  });
}

/** The user removes the message they chose to reply to with its ×, as on WhatsApp (#740). */
export async function removeReply(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Cancel reply' }).click();
  await expect(page.getByTestId('reply-preview')).toHaveCount(0);
}

/**
 * Adds a sticker from the contact as the chat's last item, as WhatsApp
 * draws one: a bubble with no text and no copy mark (#723).
 */
export async function stickerArrives(page: Page, id: string): Promise<void> {
  await page.evaluate((id) => {
    const row = document.createElement('div');
    row.setAttribute('role', 'row');
    const message = document.createElement('div');
    message.dataset['id'] = id;
    const bubble = document.createElement('div');
    bubble.dataset['testid'] = 'msg-container';
    const sticker = document.createElement('div');
    sticker.dataset['testid'] = 'sticker-container';
    sticker.append(document.createElement('img'));
    bubble.append(sticker);
    message.append(bubble);
    row.append(message);
    const rows = document.querySelectorAll('#main [role="row"]');
    rows[rows.length - 1]?.after(row);
  }, id);
}

/**
 * Lets the assistant work in every chat, as the user can in Settings ›
 * Assistant, then closes Settings unless the test still needs it: without
 * a window manager, the main window keeps the focus only once it is the
 * one window left.
 */
export async function allowAllChats(settings: Page, close = true): Promise<void> {
  await settings.getByRole('radio', { name: 'All chats' }).check();
  await expect(settings.getByRole('radio', { name: 'All chats' })).toBeChecked();
  if (close) {
    await settings.close();
  }
}

/** A model server on this computer, as the E2E tests run it. */
export interface FakeModelServer {
  readonly port: number;
  /** The chat requests it answered, as their bodies. */
  readonly chats: string[];
  readonly close: () => void;
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

/**
 * `count` messages from someone else arrive in the open chat of the fake
 * WhatsApp page, each as tall as a short bubble, so the chat scrolls.
 */
export async function messagesArrive(page: Page, count: number): Promise<void> {
  await page.evaluate((count) => {
    for (let at = 0; at < count; at += 1) {
      const row = document.createElement('div');
      row.setAttribute('role', 'row');
      row.style.minBlockSize = '60px';
      const message = document.createElement('div');
      message.dataset['id'] = `3EB0U${String(at)}`;
      const copyable = document.createElement('div');
      copyable.dataset['prePlainText'] = '[21:00, 24/10/2026] Test Chat Two: ';
      const body = document.createElement('span');
      body.dataset['testid'] = 'selectable-text';
      body.textContent = `Unread message ${String(at + 1)}`;
      copyable.append(body);
      message.append(copyable);
      row.append(message);
      const rows = document.querySelectorAll('#main [role="row"]');
      rows[rows.length - 1]?.after(row);
    }
  }, count);
}

/** The chat list row named `name` in the fake WhatsApp page shows `count` unread messages (#705). */
export async function unreadBadge(page: Page, name: string, count: number): Promise<void> {
  await page.evaluate(
    ({ name, count }) => {
      const row = [...document.querySelectorAll('#pane-side [role="row"]')].find(
        (each) =>
          each.querySelector('[data-testid="cell-frame-title"] span[title]')?.textContent === name,
      );
      const secondary = row?.querySelector('[data-testid="cell-frame-secondary"]');
      row?.querySelector('[data-testid="icon-unread-count"]')?.remove();
      const badge = document.createElement('span');
      badge.dataset['testid'] = 'icon-unread-count';
      badge.textContent = String(count);
      secondary?.append(badge);
    },
    { name, count },
  );
}

/** The user opens the chat named `name` from the fake WhatsApp page's chat list. */
export async function openChat(page: Page, name: string): Promise<void> {
  await page.locator('#pane-side [role="row"]', { hasText: name }).dispatchEvent('mousedown');
  await expect(page.locator('#main header')).toHaveText(name);
}
