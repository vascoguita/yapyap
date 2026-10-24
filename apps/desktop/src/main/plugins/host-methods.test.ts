import { Value } from 'typebox/value';
import { describe, expect, it, vi } from 'vitest';
import { hostMethods } from './host-methods.ts';

const HELLO = { id: 'org.example.hello', name: 'Hello' };

function services() {
  const stored = new Map<string, string>();
  return {
    notify: vi.fn(),
    quiet: vi.fn(() => false),
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
    const other = { id: 'org.example.other', name: 'Other' };
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

describe('hostMethods', () => {
  it('offers no way to send a message', () => {
    expect(Object.keys(hostMethods(HELLO, services()))).toEqual([
      'notifications.show',
      'secrets.get',
      'secrets.set',
      'secrets.delete',
    ]);
  });
});
