import { describe, expect, it, vi } from 'vitest';
import { listenForNotifications, type NotificationEvent } from './notification-ipc.ts';

const ORIGIN = 'https://web.whatsapp.com';

function setup() {
  const listeners = new Map<string, (event: NotificationEvent, ...args: unknown[]) => void>();
  const ipc = {
    on: vi.fn((channel: string, listener: (event: NotificationEvent, ...args: unknown[]) => void) =>
      listeners.set(channel, listener),
    ),
  };
  const page = {};
  const notifier = { show: vi.fn(), close: vi.fn(), closeAll: vi.fn() };
  const warn = vi.fn();
  listenForNotifications(ipc, (sender) => (sender === page ? notifier : undefined), ORIGIN, warn);
  const send = (channel: string, event: NotificationEvent, ...args: unknown[]) => {
    listeners.get(channel)?.(event, ...args);
  };
  return { page, notifier, warn, send };
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

  it.each([
    [{ sender: {}, senderFrame: { url: `${ORIGIN}/` } }],
    [{ sender: 'page', senderFrame: { url: 'https://example.com/' } }],
    [{ sender: 'page', senderFrame: null }],
  ])('ignores messages from anywhere else (%#)', (event) => {
    const t = setup();
    const from = { ...event, sender: event.sender === 'page' ? t.page : event.sender };
    t.send('whatsapp:notification-show', from, { id: '1' });
    t.send('whatsapp:notification-close', from, '1');
    expect(t.notifier.show).not.toHaveBeenCalled();
    expect(t.notifier.close).not.toHaveBeenCalled();
    expect(t.warn).toHaveBeenCalledWith('Ignored a notification message from outside WhatsApp.');
  });
});
