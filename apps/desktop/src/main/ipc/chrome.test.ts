import { describe, expect, it, vi } from 'vitest';
import type { ViewInfo } from '../views.ts';
import { noArguments } from './arguments.ts';
import { registerChromeHandlers, type IpcInvokeEvent, type IpcMainPort } from './chrome.ts';

const CHROME: ViewInfo = { zone: 'chrome', home: 'app://chrome', label: 'YapYap' };
const WHATSAPP: ViewInfo = { zone: 'whatsapp', home: 'https://web.whatsapp.com', label: 'W' };

function setup() {
  const chrome = {};
  const whatsapp = {};
  const views = new WeakMap<object, ViewInfo>([
    [chrome, CHROME],
    [whatsapp, WHATSAPP],
  ]);
  const listeners = new Map<string, (event: IpcInvokeEvent, ...args: unknown[]) => unknown>();
  const ipc = {
    handle: vi.fn(
      (channel: string, listener: (event: IpcInvokeEvent, ...args: unknown[]) => unknown) => {
        listeners.set(channel, listener);
      },
    ),
  } satisfies IpcMainPort;
  const handle = vi.fn((call: { sender: object }, ...args: unknown[]) => ({ call, echoed: args }));
  const warn = vi.fn();
  registerChromeHandlers(ipc, views, [{ channel: 'test:op', accepts: noArguments, handle }], warn);
  const call = (sender: object, frameUrl: string | null, ...args: unknown[]) =>
    listeners.get('test:op')?.(
      { sender, senderFrame: frameUrl === null ? null : { url: frameUrl } },
      ...args,
    );
  return { chrome, whatsapp, handle, warn, call };
}

describe('registerChromeHandlers', () => {
  it('runs the operation for a chrome frame on app://chrome', () => {
    const t = setup();
    expect(t.call(t.chrome, 'app://chrome/about.html')).toEqual({
      call: { sender: t.chrome },
      echoed: [],
    });
    expect(t.warn).not.toHaveBeenCalled();
  });

  it.each<[string, (t: ReturnType<typeof setup>) => [object, string | null, ...unknown[]]]>([
    ['WhatsApp', (t) => [t.whatsapp, 'https://web.whatsapp.com/']],
    ['an unknown web contents', () => [{}, 'app://chrome/about.html']],
    ['a chrome window showing another origin', (t) => [t.chrome, 'https://evil.example/']],
    ['a destroyed frame', (t) => [t.chrome, null]],
    ['an unexpected payload', (t) => [t.chrome, 'app://chrome/about.html', { inject: true }]],
  ])('rejects calls from %s and logs only the channel', (_, args) => {
    const t = setup();
    expect(() => t.call(...args(t))).toThrow('Rejected an IPC call on test:op.');
    expect(t.handle).not.toHaveBeenCalled();
    expect(t.warn).toHaveBeenCalledExactlyOnceWith('Rejected an IPC call on test:op.');
  });
});
