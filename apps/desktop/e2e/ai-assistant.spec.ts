import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { ElectronApplication } from '@playwright/test';
import {
  builtAssistant,
  CLAUDE_ANSWER,
  claudeAnswer,
  fakeModelServer,
  openAssistantPanel,
  playClaude,
  quietPort,
  readyAssistant,
  standInKeyring,
} from './assistant-helpers.ts';
import { closeApp, expect, launchApp, test, whatsAppPage } from './fixtures.ts';
import { chromePage, clickInBar, installExtension } from './extension-helpers.ts';

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
  await installExtension(app, profile, manifest, main, others);
  await playClaude(app, CLAUDE_ANSWER);
  const open = () =>
    app.evaluate(({ Menu }) => {
      const extensions = Menu.getApplicationMenu()
        ?.items.flatMap((menu) => menu.submenu?.items ?? [])
        .find((entry) => entry.label === 'Extension Commands');
      const panel = extensions?.submenu?.items.find(
        (entry) => entry.label === 'AI assistant: Assistant',
      );
      panel?.click();
      return panel !== undefined;
    });
  await expect.poll(open, { timeout: 20_000 }).toBe(true);
  const panel = await chromePage(app, '/__yapyap/panel.html');
  const status = panel.getByRole('status');
  await expect(status).toHaveText('Using Claude (Anthropic). Paste your API key to start.');
  await panel.getByLabel('API key').fill('sk-ant-e2e-key');
  await panel.getByRole('button', { name: 'Save key' }).click();
  // Auto picks the newest of Claude's quick models from what the provider lists.
  await expect(status).toHaveText('Using Claude (Anthropic), model claude-haiku-5-5. Ready.', {
    timeout: 20_000,
  });
  await expect(panel.getByLabel('API key')).toHaveValue('');
  const kept = await readFile(join(profile, 'extensions', '.secrets.json'), 'utf8');
  expect(kept).not.toContain('sk-ant-e2e-key');
  await panel.getByRole('button', { name: 'Forget key' }).click();
  await expect(status).toContainText('Paste your API key to start.');
});

test('suggests replies only in an allowed chat, after showing what it sends, and drafts the pick', async ({
  app,
  profile,
  window,
}) => {
  await expect(window.getByTestId('fake-whatsapp')).toBeVisible();
  const panel = await readyAssistant(app, profile, CLAUDE_ANSWER);
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

test('rewrites the draft only after showing it, and puts the rewrite in its place', async ({
  app,
  profile,
  window,
}) => {
  await expect(window.getByTestId('fake-whatsapp')).toBeVisible();
  const composer = window.getByTestId('composer');
  await composer.click();
  await window.keyboard.type('running late');
  const panel = await readyAssistant(
    app,
    profile,
    claudeAnswer('“I am running a little late, sorry!”'),
  );
  await panel.getByLabel('Style').selectOption('friendlier');
  await panel.getByRole('button', { name: 'Rewrite my draft' }).click();
  await panel.getByRole('button', { name: 'Allow in this chat' }).click();
  await expect(panel.locator('#preview')).toContainText('running late');
  await expect(panel.locator('#preview')).toContainText('warmer and friendlier');
  await panel.getByRole('button', { name: 'Send', exact: true }).click();
  await panel.getByRole('button', { name: 'I am running a little late, sorry!' }).click();
  await expect(composer).toHaveText('I am running a little late, sorry!');
});

test('summarizes the chat in the panel, and leaves the message box alone', async ({
  app,
  profile,
  window,
}) => {
  await expect(window.getByTestId('fake-whatsapp')).toBeVisible();
  const panel = await readyAssistant(app, profile, claudeAnswer('- Dinner tonight at 8.'));
  await panel.getByRole('button', { name: 'Summarize this chat' }).click();
  await panel.getByRole('button', { name: 'Allow in this chat' }).click();
  await expect(panel.locator('#preview')).toContainText('Summarize this WhatsApp chat');
  await panel.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(panel.locator('#summary')).toHaveText('- Dinner tonight at 8.');
  await expect(window.getByTestId('composer')).toHaveText('');
});

test('catches up on the unread chats from the chat list, sending only after the preview', async ({
  app,
  profile,
  window,
}) => {
  await expect(window.getByTestId('fake-whatsapp')).toBeVisible();
  const panel = await readyAssistant(
    app,
    profile,
    claudeAnswer('- Test Chat Two asks if you are coming tomorrow.'),
  );
  await panel.getByRole('button', { name: 'Catch up on unread chats' }).click();
  // Only the fake page's second chat is unread: 2 messages, the latest previewed in the list.
  const entry = 'Chat: Test Chat Two\nUnread: 2\nLatest message: Are you coming tomorrow?';
  await expect(panel.locator('#preview')).toContainText(entry);
  await expect(panel.locator('#replies')).toContainText('No chat is opened or marked as read.');
  const asked = () =>
    app.evaluate(() => (globalThis as { claudeRequests?: string[] }).claudeRequests ?? []);
  expect(await asked()).toEqual([]);
  await panel.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(panel.locator('#summary')).toHaveText(
    '- Test Chat Two asks if you are coming tomorrow.',
  );
  const requests = await asked();
  expect(requests).toHaveLength(1);
  expect(requests[0]).toContain(JSON.stringify(entry).slice(1, -1));
  // Nothing was opened or read: the open chat and the badge are as they were.
  await expect(window.locator('#main > header')).toHaveText('Test Chat One');
  await expect(window.getByTestId('icon-unread-count')).toHaveText('2');
  await expect(window.getByTestId('composer')).toHaveText('');
});

const SEARCH_PROMPT = 'Let AI assistant look for AI models on this computer?';

/** What YapYap asked the user since the assistant was installed, leaving out the install's own message. */
const prompts = async (app: ElectronApplication): Promise<string[]> =>
  (
    await app.evaluate(() => (globalThis as { extensionPrompts?: string[] }).extensionPrompts ?? [])
  ).filter((message) => message.endsWith('?'));

/**
 * Starts YapYap looking for model servers only at `ports`, so a test never
 * reaches a model the developer runs, and installs the built assistant,
 * allowing the prompts in `allow`.
 */
async function assistantLooking(
  { origin, profile }: { readonly origin: string; readonly profile: string },
  ports: readonly number[],
  allow: readonly string[],
): Promise<ElectronApplication> {
  const app = await launchApp(origin, profile, [], {
    env: { YAPYAP_TEST_MODEL_PORTS: ports.join(',') },
  });
  await standInKeyring(app);
  const { manifest, main, others } = await builtAssistant();
  await installExtension(app, profile, manifest, main, others, allow);
  return app;
}

test('finds the model running on this computer with one click, and suggests replies with it', async ({
  fakeWhatsApp,
  profile,
}) => {
  const server = await fakeModelServer('Yes, 8 works!\nCan we do 9?\nSee you there');
  const allowServer = `Let AI assistant use the server at localhost:${String(server.port)} on this computer?`;
  const ports = [await quietPort(), server.port];
  const app = await assistantLooking({ origin: fakeWhatsApp.origin, profile }, ports, [
    SEARCH_PROMPT,
    allowServer,
  ]);
  try {
    const window = await whatsAppPage(app);
    await expect(window.getByTestId('fake-whatsapp')).toBeVisible();
    // Someone who set nothing up is offered the model on this computer in the bar.
    await clickInBar(app, window, 'Find a model');
    await expect
      .poll(() => prompts(app), { timeout: 20_000 })
      .toEqual([SEARCH_PROMPT, allowServer]);
    const records = await readFile(join(profile, 'extensions', '.extensions.json'), 'utf8');
    expect(records).toContain('"modelSearch": true');
    const panel = await openAssistantPanel(app);
    await expect(panel.getByRole('status')).toHaveText(
      'Using a model server on this computer, model tiny-e2e. Ready.',
      { timeout: 20_000 },
    );
    await expect(panel.locator('#find')).toBeHidden();
    await panel.getByRole('button', { name: 'Look at this chat' }).click();
    await panel.getByRole('button', { name: 'Allow in this chat' }).click();
    await panel.getByRole('button', { name: 'Send', exact: true }).click();
    await panel.getByRole('button', { name: 'Can we do 9?' }).click();
    await expect(window.getByTestId('composer')).toHaveText('Can we do 9?');
    expect(server.chats).toHaveLength(1);
    expect(server.chats[0]).toContain('Them: Dinner tonight?');
    expect(server.chats[0]).toContain('"model":"tiny-e2e"');
    // YapYap asked each question once.
    expect(await prompts(app)).toEqual([SEARCH_PROMPT, allowServer]);
  } finally {
    await closeApp(app);
    server.close();
  }
});

test('says plainly when no model runs on this computer', async ({ fakeWhatsApp, profile }) => {
  const app = await assistantLooking(
    { origin: fakeWhatsApp.origin, profile },
    [await quietPort()],
    [SEARCH_PROMPT],
  );
  try {
    await whatsAppPage(app);
    const panel = await openAssistantPanel(app);
    const status = panel.getByRole('status');
    await expect(status).toHaveText('Using Claude (Anthropic). Paste your API key to start.');
    await panel.getByRole('button', { name: 'Find a model' }).click();
    await expect(panel.locator('#replies')).toHaveText(
      'No AI model runs on this computer. Install Ollama from ollama.com and download a model, or choose a provider in Extensions → AI assistant → Settings.',
      { timeout: 20_000 },
    );
    await expect(status).toHaveText('Using Claude (Anthropic). Paste your API key to start.');
    expect(await prompts(app)).toEqual([SEARCH_PROMPT]);
  } finally {
    await closeApp(app);
  }
});
