import { describe, expect, it, vi } from 'vitest';
import type { ViewInfo } from '../views.ts';
import { listenToChatList } from './chat-list-ipc.ts';

const ORIGIN = 'https://web.whatsapp.com';
const ACCOUNT = '0b6c3f0e-58a4-4a39-9a43-6f0c1c1f6a01';

type Listener = (event: never, ...args: unknown[]) => void;

function setup() {
  const listeners = new Map<string, Listener>();
  const ipc = {
    on: (channel: string, listener: Listener) => listeners.set(channel, listener),
  };
  const page = {};
  const views = new WeakMap<object, ViewInfo>([
    [page, { zone: 'whatsapp', home: ORIGIN, label: 'Personal', account: ACCOUNT }],
  ]);
  const widths = { set: vi.fn() };
  const warn = vi.fn();
  listenToChatList(ipc, widths, { views, origin: ORIGIN, warn });
  const send = (channel: string, event: object, ...args: unknown[]): void => {
    listeners.get(`whatsapp:chat-list-${channel}`)?.(event as never, ...args);
  };
  const fromPage = { sender: page, senderFrame: { url: `${ORIGIN}/` } };
  return { views, widths, warn, send, fromPage };
}

describe('listenToChatList', () => {
  it('keeps a width for the account of the WhatsApp view that sent it', () => {
    const t = setup();
    t.send('resize', t.fromPage, 320);
    expect(t.widths.set).toHaveBeenCalledExactlyOnceWith(ACCOUNT, 320);
    t.send('reset', t.fromPage);
    expect(t.widths.set).toHaveBeenLastCalledWith(ACCOUNT, undefined);
    expect(t.warn).not.toHaveBeenCalled();
  });

  it('drops widths that are not whole pixels within bounds', () => {
    const t = setup();
    for (const args of [[], [100], [5000], [320.5], ['320'], [320, 400]]) {
      t.send('resize', t.fromPage, ...args);
    }
    t.send('reset', t.fromPage, 320);
    expect(t.widths.set).not.toHaveBeenCalled();
    expect(t.warn).toHaveBeenCalledTimes(7);
    expect(t.warn).toHaveBeenCalledWith('Ignored a chat list message from outside WhatsApp.');
  });

  it('hears only WhatsApp views of an account, on WhatsApp’s own origin', () => {
    const t = setup();
    const chrome = {};
    const unowned = {};
    t.views.set(chrome, { zone: 'chrome', home: 'app://chrome', label: 'Settings' });
    t.views.set(unowned, { zone: 'whatsapp', home: ORIGIN, label: 'WhatsApp' });
    t.send('resize', { ...t.fromPage, sender: {} }, 320);
    t.send('resize', { ...t.fromPage, sender: chrome }, 320);
    t.send('resize', { ...t.fromPage, sender: unowned }, 320);
    t.send('resize', { ...t.fromPage, senderFrame: { url: 'https://example.com/' } }, 320);
    t.send('reset', { ...t.fromPage, senderFrame: null });
    expect(t.widths.set).not.toHaveBeenCalled();
    expect(t.warn).toHaveBeenCalledTimes(5);
  });
});
