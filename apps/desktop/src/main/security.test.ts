import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TRANSIENT_POPUP_MS } from './navigation/navigation-guard.ts';
import { secureAllWebContents, type GuardedContents } from './security.ts';
import { rendererPreferences } from './web-preferences.ts';

type Listener = (...args: never[]) => void;

function setup() {
  let created: (event: unknown, contents: GuardedContents) => void = () => undefined;
  const app = {
    on: vi.fn((_event: 'web-contents-created', listener: typeof created) => {
      created = listener;
    }),
  };
  const handlers = new Map<string, Listener[]>();
  let openHandler: (details: { url: string }) => unknown = () => undefined;
  const contents = {
    on: vi.fn((event: string, listener: Listener) => {
      handlers.set(event, [...(handlers.get(event) ?? []), listener]);
    }),
    setWindowOpenHandler: vi.fn((handler: typeof openHandler) => {
      openHandler = handler;
    }),
    loadURL: vi.fn(() => Promise.resolve()),
  };
  const homes = new WeakMap<object, string>([[contents, 'https://web.whatsapp.com']]);
  const openExternal = vi.fn(() => Promise.resolve());
  secureAllWebContents(app, { homes, openExternal, warn: vi.fn() });
  created({}, contents);
  const fire = (event: string, ...args: unknown[]): void => {
    for (const listener of handlers.get(event) ?? []) listener(...(args as never[]));
  };
  return { contents, fire, openExternal, open: (url: string) => openHandler({ url }) };
}

describe('secureAllWebContents', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('guards each web contents against webviews and off-origin navigation', () => {
    const t = setup();
    const attach = { preventDefault: vi.fn() };
    t.fire('will-attach-webview', attach);
    const leave = { url: 'https://example.com/', isMainFrame: true, preventDefault: vi.fn() };
    const stay = { url: 'https://web.whatsapp.com/x', isMainFrame: true, preventDefault: vi.fn() };
    t.fire('will-navigate', leave);
    t.fire('will-navigate', stay);
    expect(attach.preventDefault).toHaveBeenCalledOnce();
    expect(leave.preventDefault).toHaveBeenCalledOnce();
    expect(stay.preventDefault).not.toHaveBeenCalled();
    expect(t.openExternal).toHaveBeenCalledExactlyOnceWith('https://example.com/');
  });

  it('gives transient popups the hardened preferences and discards them on a timer', () => {
    const t = setup();
    expect(t.open('about:blank')).toEqual({
      action: 'allow',
      overrideBrowserWindowOptions: { show: false, webPreferences: rendererPreferences() },
    });
    const popup = { webContents: { once: vi.fn() }, isDestroyed: () => false, destroy: vi.fn() };
    t.fire('did-create-window', popup);
    vi.advanceTimersByTime(TRANSIENT_POPUP_MS - 1);
    expect(popup.destroy).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(popup.destroy).toHaveBeenCalledOnce();
  });
});
