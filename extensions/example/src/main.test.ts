import type { ExtensionHost, SettingValue } from '@yapyap/extension-sdk';
import { describe, expect, it, vi } from 'vitest';
import greeter from './main.ts';

function fakeHost(settings: Readonly<Record<string, SettingValue>>) {
  const handlers = new Map<string, () => void | Promise<void>>();
  const insertDraft = vi.fn(() => Promise.resolve());
  const host = {
    commands: {
      onRun: (id: string, handler: () => void | Promise<void>) => handlers.set(id, handler),
    },
    settings: { get: () => Promise.resolve(settings) },
    composer: { insertDraft },
  } as unknown as ExtensionHost;
  return { host, insertDraft, run: (id: string) => handlers.get(id)?.() };
}

describe('greeter', () => {
  it('drafts the greeting the user chose when they run its command', async () => {
    const { host, insertDraft, run } = fakeHost({ greeting: 'Good morning!' });
    greeter.activate(host);
    expect(insertDraft).not.toHaveBeenCalled();
    await run('draft-greeting');
    expect(insertDraft).toHaveBeenCalledWith('Good morning!');
  });

  it('drafts its own greeting until the user chooses one', async () => {
    const { host, insertDraft, run } = fakeHost({});
    greeter.activate(host);
    await run('draft-greeting');
    expect(insertDraft).toHaveBeenCalledWith('Hello! How are you?');
  });
});
