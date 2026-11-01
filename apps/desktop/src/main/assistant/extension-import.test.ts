import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { chatId } from './chats.ts';
import {
  ASSISTANT_EXTENSION,
  importAssistantExtension,
  type ImportSources,
} from './extension-import.ts';

const ACCOUNT = '11111111-2222-4333-8444-555555555555';
const OTHER = 'org.example.other';

let root: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'yapyap-import-'));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

/** The extension as it was installed: its record, its files and its key-value store. */
async function installed(settings: object | undefined, stored: Record<string, unknown> = {}) {
  const records = {
    version: 1,
    extensions: {
      [ASSISTANT_EXTENSION]: {
        id: ASSISTANT_EXTENSION,
        capabilities: ['assistant:bar', 'local-model'],
        ...(settings === undefined ? {} : { settings }),
      },
      [OTHER]: { id: OTHER },
    },
  };
  await writeFile(join(root, '.extensions.json'), JSON.stringify(records));
  await mkdir(join(root, ASSISTANT_EXTENSION, '0.1.0'), { recursive: true });
  await mkdir(join(root, '.storage'), { recursive: true });
  const entries = Object.fromEntries(
    Object.entries(stored).map(([key, value]) => [key, JSON.stringify(value)]),
  );
  await writeFile(
    join(root, '.storage', `${ASSISTANT_EXTENSION}.json`),
    JSON.stringify({ version: 1, entries }),
  );
}

function sources(secrets: Record<string, string> = {}, own: Record<string, string> = {}) {
  let assistant: Record<string, unknown> = { provider: 'auto', model: 'auto', messages: '10' };
  const deps: ImportSources = {
    root,
    storage: join(root, '.storage'),
    extensionSecrets: {
      get: (name) => Promise.resolve(secrets[name]),
      forgetAll: vi.fn(),
    },
    clearPartition: vi.fn(() => Promise.resolve()),
    keys: {
      get: (provider) => Promise.resolve(own[provider]),
      save: vi.fn(() => Promise.resolve(true)),
    },
    settings: {
      current: () => ({ assistant }) as never,
      update: (change) => {
        assistant = (change({ assistant } as never) as unknown as { assistant: typeof assistant })
          .assistant;
      },
    },
    chats: { adopt: vi.fn() },
    accounts: () => [ACCOUNT],
    state: { setNotice: vi.fn() },
  };
  return { deps, assistant: () => assistant };
}

const records = async () =>
  JSON.parse(await readFile(join(root, '.extensions.json'), 'utf8')) as {
    extensions: Record<string, unknown>;
  };

describe('importAssistantExtension', () => {
  it('does nothing without the extension, or without readable records', async () => {
    const { deps } = sources();
    expect(await importAssistantExtension(deps)).toBe(false);
    await writeFile(join(root, '.extensions.json'), JSON.stringify({ extensions: {} }));
    expect(await importAssistantExtension(deps)).toBe(false);
    expect(deps.state.setNotice).not.toHaveBeenCalled();
  });

  it('takes over the provider, model, messages, keys and chats, then uninstalls the extension', async () => {
    await installed(
      { provider: 'anthropic', context: 20 },
      { model: 'claude-opus-5-5', allowedChats: [chatId('Ana'), 'junk'] },
    );
    const { deps, assistant } = sources(
      {
        [`${ASSISTANT_EXTENSION}/apiKey.anthropic`]: 'sk-ant',
        [`${ASSISTANT_EXTENSION}/apiKey.openai`]: 'sk-openai',
      },
      { openai: 'mine' },
    );
    expect(await importAssistantExtension(deps)).toBe(true);
    expect(assistant()).toEqual({
      provider: 'anthropic',
      model: 'claude-opus-5-5',
      messages: '20',
    });
    expect(deps.keys.save).toHaveBeenCalledExactlyOnceWith('anthropic', 'sk-ant');
    expect(deps.chats.adopt).toHaveBeenCalledWith([chatId('Ana'), 'junk'], [ACCOUNT]);
    expect(deps.state.setNotice).toHaveBeenCalledWith('moved');
    expect(Object.keys((await records()).extensions)).toEqual([OTHER]);
    await expect(stat(join(root, ASSISTANT_EXTENSION))).rejects.toThrow();
    await expect(stat(join(root, '.storage', `${ASSISTANT_EXTENSION}.json`))).rejects.toThrow();
    expect(deps.extensionSecrets.forgetAll).toHaveBeenCalledWith(`${ASSISTANT_EXTENSION}/`);
    expect(deps.clearPartition).toHaveBeenCalledWith(ASSISTANT_EXTENSION);
  });

  it('turns a server on this computer into the local provider, and nothing else', async () => {
    await installed({ provider: 'compatible', endpoint: 'http://localhost:11434/v1' });
    const local = sources();
    await importAssistantExtension(local.deps);
    expect(local.assistant()).toMatchObject({
      provider: 'local',
      localServer: 'http://localhost:11434/v1',
    });
    await installed({ provider: 'compatible', endpoint: 'https://llm.example.org/v1' });
    const remote = sources();
    await importAssistantExtension(remote.deps);
    expect(remote.assistant()).toEqual({ provider: 'auto', model: 'auto', messages: '10' });
  });

  it('asks to download the private model again, which lived in the extension’s storage', async () => {
    await installed({ provider: 'built-in' });
    const chosen = sources();
    await importAssistantExtension(chosen.deps);
    expect(chosen.assistant()).toMatchObject({ provider: 'built-in' });
    expect(chosen.deps.state.setNotice).toHaveBeenCalledWith('moved-redownload');
    await installed(undefined, { builtIn: { model: 'qwen', ready: true } });
    const picked = sources();
    await importAssistantExtension(picked.deps);
    expect(picked.assistant()).toMatchObject({ provider: 'built-in' });
  });

  it('uses the server the extension found when nothing was chosen, and leaves out bad values', async () => {
    await installed(
      { context: 7 },
      { localServer: { endpoint: 'http://localhost:11435/v1' }, model: '', allowedChats: 'x' },
    );
    const found = sources();
    await importAssistantExtension(found.deps);
    expect(found.assistant()).toEqual({
      provider: 'local',
      localServer: 'http://localhost:11435/v1',
      model: 'auto',
      messages: '10',
    });
    expect(found.deps.chats.adopt).toHaveBeenCalledWith([], [ACCOUNT]);
    await installed({}, { localServer: { endpoint: 'http://example.org:1/v1' } });
    const elsewhere = sources();
    await importAssistantExtension(elsewhere.deps);
    expect(elsewhere.assistant()).toMatchObject({ provider: 'auto' });
    await installed({});
    const nothing = sources();
    await importAssistantExtension(nothing.deps);
    expect(nothing.assistant()).toMatchObject({ provider: 'auto' });
  });
});
