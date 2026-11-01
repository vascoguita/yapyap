import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { allowedChats, chatId, isChatId, MAX_ALLOWED } from './chats.ts';

const ACCOUNT = '11111111-2222-4333-8444-555555555555';
const OTHER = '66666666-7777-4888-8999-aaaaaaaaaaaa';

/** A file in memory, and the secrets as a map; `canKeep` false refuses every name. */
function stores(text = '', canKeep = true) {
  const file = { text, read: () => file.text, write: vi.fn((next: string) => (file.text = next)) };
  const kept = new Map<string, string>();
  const names = {
    get: (name: string) => Promise.resolve(kept.get(name)),
    set: (name: string, value: string | undefined) => {
      if (value === undefined) {
        kept.delete(name);
        return Promise.resolve(true);
      }
      if (canKeep) {
        kept.set(name, value);
      }
      return Promise.resolve(canKeep);
    },
    forgetAll: (prefix: string) => {
      for (const name of [...kept.keys()].filter((entry) => entry.startsWith(prefix))) {
        kept.delete(name);
      }
    },
  };
  return { file, kept, names };
}

describe('chatId', () => {
  it('is the SHA-256 of the chat’s name', () => {
    expect(chatId('Ana')).toBe(createHash('sha256').update('Ana').digest('hex'));
    expect(isChatId(chatId('Ana'))).toBe(true);
    expect(isChatId('Ana')).toBe(false);
  });
});

describe('allowedChats', () => {
  it('allows chats per account, keeping only fingerprints in the file and names encrypted', async () => {
    const { file, kept, names } = stores();
    const chats = allowedChats(file, names, vi.fn());
    expect(chats.isAllowed(ACCOUNT, 'Ana')).toBe(false);
    await chats.allow(ACCOUNT, 'Ana');
    expect(chats.isAllowed(ACCOUNT, 'Ana')).toBe(true);
    expect(chats.isAllowed(OTHER, 'Ana')).toBe(false);
    expect(file.text).not.toContain('Ana');
    expect(file.text).toContain(chatId('Ana'));
    expect([...kept.values()]).toEqual(['Ana']);
    expect(await chats.list()).toEqual([
      { account: ACCOUNT, chats: [{ id: chatId('Ana'), name: 'Ana' }] },
    ]);
    const again = allowedChats(file, names, vi.fn());
    expect(again.isAllowed(ACCOUNT, 'Ana')).toBe(true);
  });

  it('forgets a chat, or a whole account, with their names', async () => {
    const { file, kept, names } = stores();
    const chats = allowedChats(file, names, vi.fn());
    await chats.allow(ACCOUNT, 'Ana');
    await chats.allow(ACCOUNT, 'Bo');
    await chats.allow(OTHER, 'Cy');
    chats.forget(ACCOUNT, chatId('Ana'));
    chats.forget(OTHER, chatId('Nobody'));
    await Promise.resolve();
    expect(chats.isAllowed(ACCOUNT, 'Ana')).toBe(false);
    expect(chats.isAllowed(ACCOUNT, 'Bo')).toBe(true);
    chats.forgetAccount(OTHER);
    expect(chats.isAllowed(OTHER, 'Cy')).toBe(false);
    expect([...kept.values()]).toEqual(['Bo']);
    chats.forget('99999999-7777-4888-8999-aaaaaaaaaaaa', chatId('Bo'));
  });

  it('keeps no name where the system cannot keep it safely, or cannot read it back', async () => {
    const { file, names } = stores('', false);
    const chats = allowedChats(file, names, vi.fn());
    await chats.allow(ACCOUNT, 'Ana');
    expect(await chats.list()).toEqual([
      { account: ACCOUNT, chats: [{ id: chatId('Ana'), name: undefined }] },
    ]);
    const failing = {
      ...names,
      set: () => Promise.reject(new Error('locked')),
      get: () => Promise.reject(new Error('locked')),
    };
    const locked = allowedChats(file, failing, vi.fn());
    await locked.allow(ACCOUNT, 'Bo');
    expect(locked.isAllowed(ACCOUNT, 'Bo')).toBe(true);
    expect((await locked.list())[0]?.chats[1]).toEqual({ id: chatId('Bo'), name: undefined });
  });

  it('remembers at most so many chats per account, forgetting the oldest', async () => {
    const full = Array.from({ length: MAX_ALLOWED }, (_, index) => chatId(String(index)));
    const { file, names } = stores(JSON.stringify({ version: 1, accounts: { [ACCOUNT]: full } }));
    const chats = allowedChats(file, names, vi.fn());
    await chats.allow(ACCOUNT, 'Newest');
    expect(chats.isAllowed(ACCOUNT, '0')).toBe(false);
    expect(chats.isAllowed(ACCOUNT, '1')).toBe(true);
    expect(chats.isAllowed(ACCOUNT, 'Newest')).toBe(true);
  });

  it('starts empty from a missing or damaged file, and says when it cannot save', async () => {
    for (const text of ['{', JSON.stringify({ version: 2, accounts: {} })]) {
      const { file, names } = stores(text);
      expect(await allowedChats(file, names, vi.fn()).list()).toEqual([]);
    }
    const missing = {
      read: () => {
        throw new Error('ENOENT');
      },
      write: () => {
        throw new Error('EACCES');
      },
    };
    const warn = vi.fn();
    const chats = allowedChats(missing, stores().names, warn);
    await chats.allow(ACCOUNT, 'Ana');
    expect(chats.isAllowed(ACCOUNT, 'Ana')).toBe(true);
    expect(warn).toHaveBeenCalledWith('Could not save the chats the assistant may read.');
  });
});
