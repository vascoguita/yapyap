import { describe, expect, it, vi } from 'vitest';
import type { WhatsAppEvent } from '../ipc/whatsapp.ts';
import type { ViewInfo } from '../security/views.ts';
import { listenForNotifications } from './notification-ipc.ts';

const ORIGIN = 'https://web.whatsapp.com';
const WHATSAPP: ViewInfo = { zone: 'whatsapp', home: ORIGIN, label: 'Work', account: 'work' };

type Listener = (event: WhatsAppEvent<object>, ...args: unknown[]) => void;

function setup() {
  const listeners = new Map<string, Listener>();
  const ipc = {
    on: vi.fn((channel: string, listener: Listener) => listeners.set(channel, listener)),
  };
  const page = {};
  const call = {};
  const views = new WeakMap<object, ViewInfo>([
    [page, WHATSAPP],
    [call, WHATSAPP],
  ]);
  const notifier = { show: vi.fn(), close: vi.fn(), closeAll: vi.fn() };
  const warn = vi.fn();
  listenForNotifications(ipc, (sender) => (sender === page ? notifier : undefined), {
    views,
    origin: ORIGIN,
    warn,
  });
  const send = (channel: string, event: WhatsAppEvent<object>, ...args: unknown[]) => {
    listeners.get(channel)?.(event, ...args);
  };
  return { page, call, notifier, warn, send };
}

describe('listenForNotifications', () => {
  it('hands a WhatsApp page’s notifications to its account', () => {
    const t = setup();
    const event = { sender: t.page, senderFrame: { url: `${ORIGIN}/` } };
    t.send('whatsapp:notification-show', event, { id: '1' });
    t.send('whatsapp:notification-close', event, '1');
    expect(t.notifier.show).toHaveBeenCalledWith({ id: '1' });
    expect(t.notifier.close).toHaveBeenCalledWith('1');
    expect(t.warn).not.toHaveBeenCalled();
  });

  it('drops notifications from a WhatsApp window that has no notifier', () => {
    const t = setup();
    const event = { sender: t.call, senderFrame: { url: `${ORIGIN}/` } };
    t.send('whatsapp:notification-show', event, { id: '1' });
    t.send('whatsapp:notification-close', event, '1');
    expect(t.notifier.show).not.toHaveBeenCalled();
    expect(t.notifier.close).not.toHaveBeenCalled();
  });

  it.each([
    [{ sender: {}, senderFrame: { url: `${ORIGIN}/` } }, ['1']],
    [{ sender: 'page', senderFrame: { url: 'https://example.com/' } }, ['1']],
    [{ sender: 'page', senderFrame: null }, ['1']],
    [{ sender: 'page', senderFrame: { url: `${ORIGIN}/` } }, []],
    [{ sender: 'page', senderFrame: { url: `${ORIGIN}/` } }, ['1', '2']],
  ])('ignores messages from anywhere else, or with another payload (%#)', (event, args) => {
    const t = setup();
    const from = { ...event, sender: event.sender === 'page' ? t.page : event.sender };
    t.send('whatsapp:notification-show', from, ...args);
    t.send('whatsapp:notification-close', from, ...args);
    expect(t.notifier.show).not.toHaveBeenCalled();
    expect(t.notifier.close).not.toHaveBeenCalled();
    expect(t.warn).toHaveBeenCalledWith('Ignored a message on whatsapp:notification-show.');
    expect(t.warn).toHaveBeenCalledWith('Ignored a message on whatsapp:notification-close.');
  });
});
