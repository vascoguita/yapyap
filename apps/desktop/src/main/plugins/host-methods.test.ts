import { Value } from 'typebox/value';
import { describe, expect, it, vi } from 'vitest';
import { hostMethods, type CallingPlugin } from './host-methods.ts';

const HELLO: CallingPlugin = {
  id: 'org.example.hello',
  name: 'Hello',
  settings: () => ({ model: 'small' }),
};

function services() {
  const stored = new Map<string, string>();
  const kept = new Map<string, unknown>();
  return {
    kept,
    storage: {
      get: vi.fn((key: string) => kept.get(key)),
      set: vi.fn((key: string, value: unknown) => {
        kept.set(key, value);
        return kept.size <= 2;
      }),
      delete: vi.fn((key: string) => kept.delete(key)),
    },
    notify: vi.fn(),
    quiet: vi.fn(() => false),
    insertDraft: vi.fn<(text: string) => Promise<boolean>>(() => Promise.resolve(true)),
    stored,
    secrets: {
      get: vi.fn((name: string) => Promise.resolve(stored.get(name))),
      set: vi.fn((name: string, value: string | undefined) => {
        if (value === undefined) {
          stored.delete(name);
        } else {
          stored.set(name, value);
        }
        return Promise.resolve(true);
      }),
    },
  };
}

const method = (name: string, plugin = HELLO, given = services()) => {
  const found = hostMethods(plugin, given)[name];
  if (found === undefined) {
    throw new Error(`No ${name}.`);
  }
  return found;
};

const accepts = (name: string, params: unknown) => Value.Check(method(name).params, params);

describe('notifications.show', () => {
  it('shows a notification that names the plugin, unless Do not disturb is on', async () => {
    const given = services();
    const show = method('notifications.show', HELLO, given);
    expect(show.capability).toBe('notifications:show');
    await show.run([{ title: 'Done', body: 'Your draft is ready.' }]);
    expect(given.notify).toHaveBeenCalledExactlyOnceWith('Hello: Done', 'Your draft is ready.');
    given.quiet.mockReturnValue(true);
    await show.run([{ title: 'Done', body: '' }]);
    expect(given.notify).toHaveBeenCalledOnce();
  });

  it('accepts only a short title and body, and nothing else', () => {
    expect(accepts('notifications.show', [{ title: 'Done', body: '' }])).toBe(true);
    expect(accepts('notifications.show', [{ title: '', body: '' }])).toBe(false);
    expect(accepts('notifications.show', [{ title: 'x'.repeat(121), body: '' }])).toBe(false);
    expect(accepts('notifications.show', [{ title: 'Done', body: 'x'.repeat(1001) }])).toBe(false);
    expect(
      accepts('notifications.show', [{ title: 'Done', body: '', icon: 'https://example.com/' }]),
    ).toBe(false);
    expect(accepts('notifications.show', [{ title: 'Done', body: '' }, 'more'])).toBe(false);
  });
});

describe('secrets', () => {
  it('keeps each plugin’s secrets under its own ID, behind secrets:own', async () => {
    const given = services();
    const other = { id: 'org.example.other', name: 'Other', settings: () => ({}) };
    for (const name of ['secrets.get', 'secrets.set', 'secrets.delete']) {
      expect(method(name).capability).toBe('secrets:own');
    }
    await method('secrets.set', HELLO, given).run(['apiKey', 'sk-hello']);
    await method('secrets.set', other, given).run(['apiKey', 'sk-other']);
    expect([...given.stored]).toEqual([
      ['org.example.hello/apiKey', 'sk-hello'],
      ['org.example.other/apiKey', 'sk-other'],
    ]);
    expect(await method('secrets.get', HELLO, given).run(['apiKey'])).toBe('sk-hello');
    await method('secrets.delete', other, given).run(['apiKey']);
    expect(await method('secrets.get', other, given).run(['apiKey'])).toBeUndefined();
    expect(await method('secrets.get', HELLO, given).run(['apiKey'])).toBe('sk-hello');
  });

  it('fails a call when the system cannot keep secrets safely', async () => {
    const given = services();
    given.secrets.set.mockResolvedValue(false);
    await expect(method('secrets.set', HELLO, given).run(['apiKey', 'sk'])).rejects.toThrow(
      'This system cannot keep secrets safely.',
    );
    await expect(method('secrets.delete', HELLO, given).run(['apiKey'])).rejects.toThrow();
  });

  it('accepts only plain names, so no call reaches outside the plugin’s namespace', () => {
    expect(accepts('secrets.get', ['api.key_2-b'])).toBe(true);
    for (const name of ['', '../org.example.other/apiKey', 'a/b', 'x'.repeat(65), 7]) {
      expect(accepts('secrets.get', [name])).toBe(false);
    }
    expect(accepts('secrets.set', ['apiKey', 'x'.repeat(8192)])).toBe(true);
    expect(accepts('secrets.set', ['apiKey', 'x'.repeat(8193)])).toBe(false);
    expect(accepts('secrets.set', ['apiKey', ''])).toBe(false);
    expect(accepts('secrets.delete', ['apiKey', 'more'])).toBe(false);
  });
});

describe('composer.insertDraft', () => {
  it('puts a draft in the open chat, behind composer:insert-draft, and never sends', async () => {
    const given = services();
    const draft = method('composer.insertDraft', HELLO, given);
    expect(draft.capability).toBe('composer:insert-draft');
    await draft.run(['Sounds good, see you at 8.']);
    expect(given.insertDraft).toHaveBeenCalledExactlyOnceWith('Sounds good, see you at 8.');
    given.insertDraft.mockResolvedValueOnce(false);
    await expect(draft.run(['Hi'])).rejects.toThrow('No chat is open.');
  });

  it('accepts one short text, and nothing else', () => {
    expect(accepts('composer.insertDraft', ['Hi'])).toBe(true);
    expect(accepts('composer.insertDraft', [''])).toBe(false);
    expect(accepts('composer.insertDraft', ['x'.repeat(4097)])).toBe(false);
    expect(accepts('composer.insertDraft', ['Hi', { send: true }])).toBe(false);
  });
});

describe('settings.get', () => {
  it('gives the plugin its own settings, without a grant, and takes nothing', async () => {
    const get = method('settings.get');
    expect(get.capability).toBeUndefined();
    await expect(get.run([])).resolves.toEqual({ model: 'small' });
    expect(accepts('settings.get', [])).toBe(true);
    expect(accepts('settings.get', ['other.plugin'])).toBe(false);
  });
});

describe('hostMethods', () => {
  it('offers no way to send a message', () => {
    expect(Object.keys(hostMethods(HELLO, services()))).toEqual([
      'settings.get',
      'notifications.show',
      'secrets.get',
      'secrets.set',
      'secrets.delete',
      'storage.get',
      'storage.set',
      'storage.delete',
      'composer.insertDraft',
    ]);
  });
});

describe('storage', () => {
  it('keeps values in the plugin’s own store, behind storage:local', async () => {
    const given = services();
    for (const name of ['storage.get', 'storage.set', 'storage.delete']) {
      expect(method(name).capability).toBe('storage:local');
    }
    await method('storage.set', HELLO, given).run(['last', { chat: 'Team', at: 3 }]);
    expect(await method('storage.get', HELLO, given).run(['last'])).toEqual({
      chat: 'Team',
      at: 3,
    });
    await method('storage.delete', HELLO, given).run(['last']);
    expect(await method('storage.get', HELLO, given).run(['last'])).toBeUndefined();
  });

  it('fails a write once the store is full', async () => {
    const given = services();
    await method('storage.set', HELLO, given).run(['a', 1]);
    await method('storage.set', HELLO, given).run(['b', 2]);
    await expect(method('storage.set', HELLO, given).run(['c', 3])).rejects.toThrow('full');
  });

  it('accepts a short key and any value, and nothing else', () => {
    expect(accepts('storage.set', ['last', null])).toBe(true);
    expect(accepts('storage.set', ['', 1])).toBe(false);
    expect(accepts('storage.set', ['x'.repeat(257), 1])).toBe(false);
    expect(accepts('storage.get', ['x'.repeat(256)])).toBe(true);
    expect(accepts('storage.delete', [7])).toBe(false);
    expect(accepts('storage.get', ['a', 'b'])).toBe(false);
  });
});
