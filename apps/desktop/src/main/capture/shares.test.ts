import { describe, expect, it, vi } from 'vitest';
import type { ViewInfo } from '../security/views.ts';
import { trackShares } from './shares.ts';

const ORIGIN = 'https://web.whatsapp.com';
const WORK: ViewInfo = { zone: 'whatsapp', home: ORIGIN, label: 'Work', account: 'work' };

function setup() {
  const listeners = new Map<string, (event: unknown, ...args: unknown[]) => void>();
  const ipc = {
    on: vi.fn((channel: string, listener: (event: never, ...args: unknown[]) => void) => {
      listeners.set(channel, listener as (event: unknown, ...args: unknown[]) => void);
    }),
  };
  const page = () => {
    let destroyed: (() => void) | undefined;
    return {
      send: vi.fn(),
      once: vi.fn((_event: 'destroyed', listener: () => void) => {
        destroyed = listener;
      }),
      destroy: () => destroyed?.(),
    };
  };
  const work = page();
  const call = page();
  const stranger = page();
  const views = new WeakMap<object, ViewInfo>([
    [work, WORK],
    [call, WORK],
  ]);
  const deps = {
    views,
    origin: ORIGIN,
    onChange: vi.fn(),
    warn: vi.fn(),
  };
  const shares = trackShares(ipc, deps);
  const from = (sender: object, url = `${ORIGIN}/`) => ({ sender, senderFrame: { url } });
  const emit = (channel: string, event: object, id: unknown) => {
    listeners.get(`whatsapp:share-${channel}`)?.(event, id);
  };
  return { shares, deps, work, call, stranger, from, emit };
}

describe('trackShares', () => {
  it('knows which accounts share, from their page or their call window', () => {
    const t = setup();
    t.emit('started', t.from(t.work), '1');
    t.emit('started', t.from(t.call), '1');
    t.emit('started', t.from(t.call), '2');
    t.emit('ended', t.from(t.call), '2');
    expect([...t.shares.sharing()]).toEqual(['work']);
    t.emit('ended', t.from(t.work), '1');
    expect([...t.shares.sharing()]).toEqual(['work']);
    t.emit('ended', t.from(t.call), '1');
    t.emit('ended', t.from(t.call), '1');
    expect(t.shares.sharing().size).toBe(0);
    expect(t.deps.onChange).toHaveBeenCalledTimes(6);
    expect(t.call.once).toHaveBeenCalledOnce();
  });

  it('asks every page of the account to stop its shares', () => {
    const t = setup();
    t.emit('started', t.from(t.work), '1');
    t.emit('started', t.from(t.call), '2');
    t.shares.stop('work');
    t.shares.stop('personal');
    expect(t.work.send).toHaveBeenCalledExactlyOnceWith('whatsapp:share-stop', '1');
    expect(t.call.send).toHaveBeenCalledExactlyOnceWith('whatsapp:share-stop', '2');
  });

  it('forgets the shares of a page that goes away', () => {
    const t = setup();
    t.emit('started', t.from(t.call), '1');
    t.call.destroy();
    expect(t.shares.sharing().size).toBe(0);
    expect(t.deps.onChange).toHaveBeenCalledTimes(2);
  });

  it('hears only WhatsApp pages of an account, on its origin, with a short ID', () => {
    const t = setup();
    t.emit('started', t.from(t.stranger), '1');
    t.emit('started', t.from(t.work, 'https://example.com/'), '1');
    t.emit('started', { sender: t.work, senderFrame: null }, '1');
    expect(t.deps.warn).toHaveBeenCalledTimes(3);
    t.emit('started', t.from(t.work), 7);
    t.emit('started', t.from(t.work), 'x'.repeat(37));
    t.emit('ended', t.from(t.work), 7);
    expect(t.shares.sharing().size).toBe(0);
    expect(t.deps.onChange).not.toHaveBeenCalled();
  });

  it('ends a share only on word from the WhatsApp page that started it', () => {
    const t = setup();
    t.emit('started', t.from(t.work), '1');
    t.emit('ended', t.from(t.work, 'https://example.com/'), '1');
    t.emit('ended', t.from(t.stranger), '1');
    expect([...t.shares.sharing()]).toEqual(['work']);
    expect(t.deps.warn).toHaveBeenCalledTimes(2);
    t.emit('ended', t.from(t.work), '1');
    expect(t.shares.sharing().size).toBe(0);
  });
});
