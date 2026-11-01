import { createHash } from 'node:crypto';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  barNames,
  barSays,
  CLAUDE_ANSWER,
  claudeRequests,
  readyClaude,
} from './assistant-helpers.ts';
import { clickInBar } from './extension-helpers.ts';
import { closeApp, expect, launchApp, test, whatsAppPage } from './fixtures.ts';

const ID = 'org.guita.yapyap.ai-assistant';

/** The AI assistant extension as an earlier YapYap installed it, allowed in the fake page's open chat. */
async function installedExtension(profile: string): Promise<void> {
  const root = join(profile, 'extensions');
  await mkdir(join(root, ID, '0.1.0'), { recursive: true });
  await mkdir(join(root, '.storage'), { recursive: true });
  await writeFile(join(root, ID, '0.1.0', 'manifest.json'), '{}');
  const record = {
    id: ID,
    version: '0.1.0',
    fingerprint: null,
    firstParty: true,
    developer: true,
    capabilities: ['chat:read-active', 'assistant:bar', 'local-model'],
    hosts: ['api.anthropic.com'],
    settings: { provider: 'anthropic', context: 20 },
  };
  await writeFile(
    join(root, '.extensions.json'),
    JSON.stringify({ version: 1, extensions: { [ID]: record } }),
  );
  const allowed = [createHash('sha256').update('Test Chat One').digest('hex')];
  const entries = {
    model: JSON.stringify('claude-opus-5-5'),
    allowedChats: JSON.stringify(allowed),
  };
  await writeFile(join(root, '.storage', `${ID}.json`), JSON.stringify({ version: 1, entries }));
}

test('takes over the AI assistant extension’s setup, uninstalls it, and says so once', async ({
  fakeWhatsApp,
  profile,
}) => {
  await installedExtension(profile);
  const app = await launchApp(fakeWhatsApp.origin, profile);
  try {
    const window = await whatsAppPage(app);
    await expect(window.getByTestId('fake-whatsapp')).toBeVisible();
    await barSays(app, /^The AI assistant is now part of YapYap\./);
    const records = await readFile(join(profile, 'extensions', '.extensions.json'), 'utf8');
    expect(records).not.toContain(ID);
    await expect(stat(join(profile, 'extensions', ID))).rejects.toThrow();
    const saved = JSON.parse(await readFile(join(profile, 'settings.json'), 'utf8')) as {
      assistant: Record<string, unknown>;
    };
    expect(saved.assistant).toMatchObject({
      provider: 'anthropic',
      model: 'claude-opus-5-5',
      messages: '20',
    });
    await clickInBar(app, window, 'Close');
    await readyClaude(app, CLAUDE_ANSWER);
    // The chat the extension was allowed in needs no new consent.
    await clickInBar(app, window, 'Suggest replies');
    await expect.poll(() => barNames(app)).toContain('Can we do 9?');
    expect((await claudeRequests(app))[0]).toContain('"model":"claude-opus-5-5"');
  } finally {
    await closeApp(app);
  }
});
