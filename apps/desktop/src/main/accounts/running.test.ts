import { describe, expect, it, vi } from 'vitest';
import type { Account, Accounts } from './accounts.ts';
import { runAccounts } from './running.ts';

const A = '0b6c3f0e-58a4-4a39-9a43-6f0c1c1f6a01';
const B = '7d2e9b1c-3f4a-4c5d-8e6f-1a2b3c4d5e6f';
const C = 'f1e2d3c4-b5a6-4978-8a9b-0c1d2e3f4a5b';

const account = (id: string, name: string, enabled = true): Account => ({
  id,
  name,
  color: 'green',
  enabled,
});

function setup(accounts: Accounts) {
  const pages = new Map<
    string,
    {
      show: ReturnType<typeof vi.fn>;
      hide: ReturnType<typeof vi.fn>;
      close: ReturnType<typeof vi.fn>;
    }
  >();
  const deps = {
    accounts,
    open: vi.fn((opened: Account) => {
      const page = { show: vi.fn(), hide: vi.fn(), close: vi.fn() };
      pages.set(opened.id, page);
      return page;
    }),
    save: vi.fn(),
    forget: vi.fn(() => Promise.resolve()),
    newId: () => C,
    onChange: vi.fn(),
  };
  const running = runAccounts(deps);
  return { deps, running, page: (id: string) => pages.get(id) };
}

const two: Accounts = {
  version: 1,
  accounts: [account(A, 'Personal'), account(B, 'Work')],
  active: B,
};

describe('runAccounts', () => {
  it('opens every enabled account and shows only the active one', () => {
    const t = setup(two);
    expect(t.deps.open).toHaveBeenCalledTimes(2);
    expect(t.page(B)?.show).toHaveBeenCalledOnce();
    expect(t.page(A)?.show).not.toHaveBeenCalled();
    expect(t.running.active().account.name).toBe('Work');
    expect(t.running.list()).toBe(two.accounts);
    expect(t.running.opened().map((opened) => opened.account.id)).toEqual([A, B]);
  });

  it('runs no renderer for a disabled account, and shows another when the active one is off', () => {
    const t = setup({ ...two, accounts: [account(A, 'Personal'), account(B, 'Work', false)] });
    expect(t.deps.open).toHaveBeenCalledOnce();
    expect(t.running.active().account.id).toBe(A);
  });

  it('still runs the first account when all are disabled', () => {
    const t = setup({ ...two, accounts: [account(A, 'Personal', false)], active: A });
    expect(t.running.active().account.id).toBe(A);
  });

  it('refuses to start without any account', () => {
    expect(() => setup({ ...two, accounts: [] })).toThrow('no account');
  });

  it('switches by hiding one account and showing the other, and remembers it', () => {
    const t = setup(two);
    t.running.switchTo(A);
    expect(t.page(B)?.hide).toHaveBeenCalledOnce();
    expect(t.page(A)?.show).toHaveBeenCalledOnce();
    expect(t.deps.save).toHaveBeenCalledWith({ ...two, active: A });
    expect(t.deps.onChange).toHaveBeenCalledOnce();
  });

  it('ignores switching to the active account or to one that is not open', () => {
    const t = setup(two);
    t.running.switchTo(B);
    t.running.switchTo(C);
    expect(t.deps.save).not.toHaveBeenCalled();
  });

  it('adds an account, opens it and shows it', () => {
    const t = setup(two);
    t.running.add();
    expect(t.running.active().account).toEqual({
      id: C,
      name: 'WhatsApp 3',
      color: 'purple',
      enabled: true,
    });
    expect(t.page(C)?.show).toHaveBeenCalledOnce();
    expect(t.deps.save).toHaveBeenLastCalledWith(expect.objectContaining({ active: C }));
  });

  it('removes the active account: shows another, closes it, then deletes its data', async () => {
    const t = setup(two);
    await t.running.remove(B);
    expect(t.running.active().account.id).toBe(A);
    expect(t.page(B)?.close).toHaveBeenCalledOnce();
    expect(t.deps.save).toHaveBeenLastCalledWith({
      ...two,
      accounts: [two.accounts[0]],
      active: A,
    });
    expect(t.deps.forget).toHaveBeenCalledWith(two.accounts[1]);
  });

  it('removes another account without switching', async () => {
    const t = setup(two);
    await t.running.remove(A);
    expect(t.running.active().account.id).toBe(B);
    expect(t.page(B)?.hide).not.toHaveBeenCalled();
    expect(t.running.list()).toEqual([two.accounts[1]]);
  });

  it('keeps the last open account, and ignores accounts that are not open', async () => {
    const t = setup({ ...two, accounts: [account(A, 'Personal')], active: A });
    await t.running.remove(A);
    await t.running.remove(C);
    expect(t.deps.forget).not.toHaveBeenCalled();
    expect(t.page(A)?.close).not.toHaveBeenCalled();
  });
});
