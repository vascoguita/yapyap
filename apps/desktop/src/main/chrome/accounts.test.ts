import { describe, expect, it, vi } from 'vitest';
import { accountsHandlers, type AccountManager } from './accounts.ts';

const WORK = {
  id: 'b',
  name: 'Work',
  color: 'blue',
  enabled: true,
  muted: false,
  proxy: '',
  active: true,
};

function setup(confirmed = true, open = true) {
  const holder: { current: AccountManager } = {
    current: {
      entries: [
        {
          id: 'a',
          name: 'Personal',
          color: 'green',
          enabled: false,
          muted: false,
          proxy: '',
          active: false,
        },
        WORK,
      ],
      update: vi.fn(() => true),
      remove: vi.fn(() => Promise.resolve(true)),
      permissions: vi.fn((): readonly string[] | undefined => undefined),
      forgetPermissions: vi.fn(),
    },
  };
  const confirm = vi.fn(() => Promise.resolve(confirmed));
  const handlers = new Map(
    accountsHandlers(() => (open ? holder.current : undefined), confirm).map((handler) => [
      handler.channel,
      handler,
    ]),
  );
  const handler = (channel: string) => {
    const found = handlers.get(channel);
    if (found === undefined) {
      throw new Error(`No handler for ${channel}`);
    }
    return found;
  };
  return { holder, confirm, handler, call: { sender: {} } };
}

describe('accountsHandlers', () => {
  it('lists nothing and changes nothing before the accounts are open', async () => {
    const t = setup(true, false);
    expect(t.handler('accounts:list').handle(t.call)).toHaveProperty('accounts', []);
    const change = { name: 'Work', color: 'blue', enabled: true, muted: false };
    expect(t.handler('accounts:save').handle(t.call, 'b', change)).toBeNull();
    await t.handler('accounts:remove').handle(t.call, 'b');
    expect(t.confirm).not.toHaveBeenCalled();
  });

  it('lists every account with the colors to choose from', () => {
    const t = setup();
    const list = t.handler('accounts:list');
    expect(list.accepts([])).toBe(true);
    expect(list.handle(t.call)).toEqual({
      accounts: t.holder.current.entries,
      colors: ['green', 'blue', 'purple', 'orange', 'red', 'teal'],
    });
  });

  it('saves a checked change, with the name trimmed, and lists the result', () => {
    const t = setup();
    const save = t.handler('accounts:save');
    const change = {
      name: '  Office ',
      color: 'teal',
      enabled: false,
      muted: true,
      proxy: 'socks5://10.0.0.2:1080',
    };
    expect(save.accepts(['b', change])).toBe(true);
    expect(save.handle(t.call, 'b', change)).toHaveProperty('accounts');
    expect(t.holder.current.update).toHaveBeenCalledWith('b', {
      name: 'Office',
      color: 'teal',
      enabled: false,
      muted: true,
      proxy: 'socks5://10.0.0.2:1080',
    });
  });

  it('answers null when YapYap refused the change', () => {
    const t = setup();
    vi.mocked(t.holder.current.update).mockReturnValueOnce(false);
    expect(
      t.handler('accounts:save').handle(t.call, 'b', {
        name: 'Work',
        color: 'blue',
        enabled: false,
        muted: false,
        proxy: '',
      }),
    ).toBeNull();
    expect(t.handler('accounts:save').handle(t.call, 'b', { name: '' })).toBeNull();
  });

  it.each([
    [['b', { name: '', color: 'blue', enabled: true, muted: false }]],
    [['b', { name: '   ', color: 'blue', enabled: true, muted: false }]],
    [['b', { name: 'x'.repeat(41), color: 'blue', enabled: true, muted: false }]],
    [['b', { name: 'Work', color: 'pink', enabled: true, muted: false }]],
    [['b', { name: 'Work', color: 'blue', enabled: 'yes', muted: false }]],
    [['b', { name: 'Work', color: 'blue', enabled: true, muted: 'yes' }]],
    [['b', { name: 'Work', color: 'blue', enabled: true, muted: false }]],
    [['b', { name: 'Work', color: 'blue', enabled: true, muted: false, proxy: 'ftp://x' }]],
    [['b', { name: 'Work', color: 'blue', enabled: true, muted: false, proxy: 7 }]],
    [['b', { name: 'Work', color: 'blue', enabled: true, muted: false, avatar: 'x' }]],
    [['b', null]],
    [[1, { name: 'Work', color: 'blue', enabled: true, muted: false }]],
    [['b', { name: 'Work', color: 'blue', enabled: true, muted: false }, 'extra']],
  ])('refuses a malformed change: %j', (args) => {
    expect(setup().handler('accounts:save').accepts(args)).toBe(false);
  });

  it('removes an account only after the user agrees, by its own name', async () => {
    const t = setup();
    const remove = t.handler('accounts:remove');
    expect(remove.accepts(['b'])).toBe(true);
    expect(remove.accepts(['b', 'c'])).toBe(false);
    expect(remove.accepts([2])).toBe(false);
    await expect(remove.handle(t.call, 'b')).resolves.toHaveProperty('accounts');
    expect(t.confirm).toHaveBeenCalledWith('Work');
    expect(t.holder.current.remove).toHaveBeenCalledWith('b');
  });

  it('keeps the account when the user declines, and ignores unknown ones', async () => {
    const t = setup(false);
    const remove = t.handler('accounts:remove');
    await remove.handle(t.call, 'b');
    await remove.handle(t.call, 'zz');
    expect(t.confirm).toHaveBeenCalledOnce();
    expect(t.holder.current.remove).not.toHaveBeenCalled();
  });

  it('tells what an account may use, and forgets its camera and microphone answers', () => {
    const t = setup();
    vi.mocked(t.holder.current.permissions).mockReturnValueOnce(['audio']).mockReturnValueOnce([]);
    expect(t.handler('accounts:permissions').handle(t.call, 'b')).toEqual(['audio']);
    expect(t.handler('accounts:forget-permissions').handle(t.call, 'b')).toEqual([]);
    expect(t.holder.current.forgetPermissions).toHaveBeenCalledWith('b');
    expect(t.handler('accounts:permissions').handle(t.call, 'a')).toBeNull();
    expect(t.handler('accounts:permissions').accepts(['b'])).toBe(true);
    expect(t.handler('accounts:permissions').accepts([1])).toBe(false);
    expect(t.handler('accounts:forget-permissions').accepts(['b', 'c'])).toBe(false);
  });

  it('answers nothing about permissions before the accounts are open', () => {
    const t = setup(true, false);
    expect(t.handler('accounts:permissions').handle(t.call, 'b')).toBeNull();
    expect(t.handler('accounts:forget-permissions').handle(t.call, 'b')).toBeNull();
  });
});
