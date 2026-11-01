import { describe, expect, it, vi } from 'vitest';
import type { ViewInfo } from '../security/views.ts';
import { noArguments } from './arguments.ts';
import { registerWhatsAppListeners, type WhatsAppEvent } from './whatsapp.ts';

const ORIGIN = 'https://web.whatsapp.com';

type Listener = (event: WhatsAppEvent<object>, ...args: unknown[]) => void;

function setup() {
  const listeners = new Map<string, Listener>();
  const ipc = {
    on: vi.fn((channel: string, listener: Listener) => listeners.set(channel, listener)),
  };
  const page = {};
  const chrome = {};
  const unowned = {};
  const views = new WeakMap<object, ViewInfo>([
    [page, { zone: 'whatsapp', home: ORIGIN, label: 'Work', account: 'work' }],
    [chrome, { zone: 'chrome', home: 'app://chrome', label: 'YapYap' }],
    [unowned, { zone: 'whatsapp', home: ORIGIN, label: 'WhatsApp' }],
  ]);
  const handle = vi.fn();
  const warn = vi.fn();
  registerWhatsAppListeners(ipc, { views, origin: ORIGIN, warn }, [
    { channel: 'test:op', accepts: noArguments, handle },
  ]);
  const send = (sender: object, url: string | null, ...args: unknown[]): void => {
    listeners.get('test:op')?.({ sender, senderFrame: url === null ? null : { url } }, ...args);
  };
  return { page, chrome, unowned, handle, warn, send };
}

describe('registerWhatsAppListeners', () => {
  it('hands a WhatsApp page’s message on with its account', () => {
    const t = setup();
    t.send(t.page, `${ORIGIN}/`);
    expect(t.handle).toHaveBeenCalledExactlyOnceWith({ sender: t.page, account: 'work' });
    expect(t.warn).not.toHaveBeenCalled();
  });

  it.each<[string, (t: ReturnType<typeof setup>) => [object, string | null, ...unknown[]]]>([
    ['an unknown web contents', () => [{}, `${ORIGIN}/`]],
    ['the app chrome', (t) => [t.chrome, `${ORIGIN}/`]],
    ['a WhatsApp view of no account', (t) => [t.unowned, `${ORIGIN}/`]],
    ['a WhatsApp view showing another origin', (t) => [t.page, 'https://example.com/']],
    ['a destroyed frame', (t) => [t.page, null]],
    ['an unexpected payload', (t) => [t.page, `${ORIGIN}/`, 'text']],
  ])('drops messages from %s and logs only the channel', (_, args) => {
    const t = setup();
    t.send(...args(t));
    expect(t.handle).not.toHaveBeenCalled();
    expect(t.warn).toHaveBeenCalledExactlyOnceWith('Ignored a message on test:op.');
  });
});
