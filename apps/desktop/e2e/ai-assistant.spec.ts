import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  builtAssistant,
  CLAUDE_ANSWER,
  claudeAnswer,
  readyAssistant,
} from './assistant-helpers.ts';
import { expect, test } from './fixtures.ts';
import { chromePage, installPlugin } from './plugin-helpers.ts';

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
