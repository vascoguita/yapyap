import { describe, expect, it, vi } from 'vitest';
import {
  createNavigationGuard,
  TRANSIENT_POPUP_MS,
  UNSEEN_NAVIGATION_MS,
  type NavigationContents,
  type NavigationDependencies,
  type PopupWindow,
  type WindowOpenResponse,
} from './navigation-guard.ts';

const HOME = 'https://web.whatsapp.com';
const PREFERENCES = { sandbox: true };

type Listener = (...args: never[]) => void;

function setup(home: string | null = HOME) {
  const handlers = new Map<string, Listener[]>();
  let openHandler: (details: { url: string }) => WindowOpenResponse = () => ({ action: 'deny' });
  const contents = {
    on: vi.fn((event: string, listener: Listener) => {
      handlers.set(event, [...(handlers.get(event) ?? []), listener]);
    }),
    setWindowOpenHandler: vi.fn((handler: typeof openHandler) => {
      openHandler = handler;
    }),
    loadURL: vi.fn(() => Promise.resolve()),
  } satisfies NavigationContents;
  const scheduled: { callback: () => void; ms: number }[] = [];
  const deps = {
    homeOf: vi.fn(() => home ?? undefined),
    openExternal: vi.fn(() => Promise.resolve()),
    popupPreferences: vi.fn(() => PREFERENCES),
    warn: vi.fn(),
    schedule: vi.fn((callback: () => void, ms: number) => scheduled.push({ callback, ms })),
  } satisfies NavigationDependencies;
  const guard = createNavigationGuard(deps);
  guard(contents);
  const fire = (event: string, ...args: unknown[]): void => {
    for (const listener of handlers.get(event) ?? []) {
      listener(...(args as never[]));
    }
  };
  const navigation = (url: string, isMainFrame = true) => ({
    url,
    isMainFrame,
    preventDefault: vi.fn(),
  });
  return {
    contents,
    deps,
    guard,
    fire,
    navigation,
    scheduled,
    open: (url: string) => openHandler({ url }),
  };
}

const settle = () => new Promise((resolve) => setTimeout(resolve));

describe('will-navigate', () => {
  it('lets the main frame move within its home origin', () => {
    const t = setup();
    const event = t.navigation(`${HOME}/send?phone=1`);
    t.fire('will-navigate', event);
    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(t.deps.openExternal).not.toHaveBeenCalled();
  });

  it('stops the main frame leaving and opens the link in the browser exactly once', () => {
    const t = setup();
    const event = t.navigation('https://example.com/article?id=7#top');
    t.fire('will-navigate', event);
    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(t.deps.openExternal).toHaveBeenCalledExactlyOnceWith(
      'https://example.com/article?id=7#top',
    );
  });

  it('leaves subframes to the page and the sandbox', () => {
    const t = setup();
    const event = t.navigation('https://www.youtube.com/embed/x', false);
    t.fire('will-navigate', event);
    expect(event.preventDefault).not.toHaveBeenCalled();
  });

  it('routes whatsapp: links back into the view', () => {
    const t = setup();
    const event = t.navigation('whatsapp://send?phone=351912345678');
    t.fire('will-navigate', event);
    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(t.contents.loadURL).toHaveBeenCalledExactlyOnceWith(`${HOME}/send?phone=351912345678`);
    expect(t.deps.openExternal).not.toHaveBeenCalled();
  });

  it('drops dangerous schemes without opening anything', () => {
    const t = setup();
    const event = t.navigation('file:///etc/passwd');
    t.fire('will-navigate', event);
    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(t.deps.openExternal).not.toHaveBeenCalled();
    expect(t.contents.loadURL).not.toHaveBeenCalled();
  });

  it('blocks every main-frame navigation of a web contents without a home', () => {
    const t = setup(null);
    const event = t.navigation(`${HOME}/`);
    t.fire('will-navigate', event);
    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(t.deps.openExternal).toHaveBeenCalledExactlyOnceWith(`${HOME}/`);
  });

  it('logs failures to open a link without the link itself', async () => {
    const t = setup();
    t.deps.openExternal.mockRejectedValueOnce(new Error('no handler'));
    t.contents.loadURL.mockRejectedValueOnce(new Error('aborted'));
    t.fire('will-navigate', t.navigation('https://example.com/secret?phone=351912345678'));
    t.fire('will-navigate', t.navigation('whatsapp://send?phone=351912345678'));
    await settle();
    expect(t.deps.warn.mock.calls).toEqual([
      ['Could not open a external link.'],
      ['Could not open a deep-link link.'],
    ]);
  });
});

describe('will-redirect', () => {
  it.each<[string, string | null, string, boolean, boolean]>([
    ['allows same-origin main-frame redirects', HOME, `${HOME}/x`, true, false],
    ['blocks cross-origin main-frame redirects', HOME, 'https://example.com/', true, true],
    ['blocks every main-frame redirect without a home', null, `${HOME}/x`, true, true],
    ['leaves subframe redirects alone', HOME, 'https://example.com/', false, false],
  ])('%s', (_, home, url, isMainFrame, blocked) => {
    const t = setup(home);
    const event = t.navigation(url, isMainFrame);
    t.fire('will-redirect', event);
    expect(event.preventDefault).toHaveBeenCalledTimes(Number(blocked));
    expect(t.deps.openExternal).not.toHaveBeenCalled();
  });
});

describe('window.open', () => {
  it('denies new windows and opens web links in the browser', () => {
    const t = setup();
    expect(t.open('https://example.com/')).toEqual({ action: 'deny' });
    expect(t.deps.openExternal).toHaveBeenCalledExactlyOnceWith('https://example.com/');
  });

  it('denies same-origin windows without opening anything', () => {
    const t = setup();
    expect(t.open(`${HOME}/other`)).toEqual({ action: 'deny' });
    expect(t.deps.openExternal).not.toHaveBeenCalled();
    expect(t.contents.loadURL).not.toHaveBeenCalled();
  });

  it.each(['about:blank', ''])('allows a hidden, hardened transient popup for %j', (url) => {
    const t = setup();
    expect(t.open(url)).toEqual({
      action: 'allow',
      overrideBrowserWindowOptions: { show: false, webPreferences: PREFERENCES },
    });
    expect(t.deps.openExternal).not.toHaveBeenCalled();
  });
});

describe('transient popups', () => {
  function popup(url = '') {
    let navigated: () => void = () => undefined;
    const handlers = new Map<string, Listener[]>();
    const emit = (event: string, arg: unknown): void => {
      for (const listener of handlers.get(event) ?? []) {
        listener(arg as never);
      }
    };
    let destroyed = false;
    const window = {
      webContents: {
        once: vi.fn((_event: 'will-navigate', listener: () => void) => {
          navigated = listener;
        }),
        on: vi.fn((event: string, listener: Listener) => {
          handlers.set(event, [...(handlers.get(event) ?? []), listener]);
        }),
        getURL: vi.fn(() => url),
        // Enough of a web contents for the guard to watch the popup itself too.
        setWindowOpenHandler: vi.fn(),
        loadURL: vi.fn(() => Promise.resolve()),
      },
      isDestroyed: vi.fn(() => destroyed),
      destroy: vi.fn(() => {
        destroyed = true;
      }),
    } satisfies PopupWindow & { readonly webContents: NavigationContents };
    return {
      window,
      navigate: () => {
        navigated();
      },
      start: (target: string, isMainFrame = true) => {
        emit('did-start-navigation', { url: target, isMainFrame });
      },
      /** A will-navigate reaching the guard that watches the popup. */
      willNavigate: (target: string) => {
        const event = { url: target, isMainFrame: true, preventDefault: vi.fn() };
        emit('will-navigate', event);
        return event;
      },
    };
  }

  /** Runs the scheduled callback at `index`, the way a timer would. */
  const run = (t: ReturnType<typeof setup>, index: number): void => {
    t.scheduled[index]?.callback();
  };

  it('checks the popup regularly and gives up on it after the timeout', () => {
    const t = setup();
    const p = popup();
    t.fire('did-create-window', p.window);
    expect(t.scheduled.map(({ ms }) => ms)).toEqual([UNSEEN_NAVIGATION_MS, TRANSIENT_POPUP_MS]);
    run(t, 0);
    expect(t.scheduled.map(({ ms }) => ms)).toEqual([
      UNSEEN_NAVIGATION_MS,
      TRANSIENT_POPUP_MS,
      UNSEEN_NAVIGATION_MS,
    ]);
    expect(p.window.destroy).not.toHaveBeenCalled();
    run(t, 1);
    expect(p.window.destroy).toHaveBeenCalledOnce();
    run(t, 2);
    expect(t.scheduled).toHaveLength(3);
    expect(t.deps.openExternal).not.toHaveBeenCalled();
  });

  it('closes a popup as soon as will-navigate reports it, leaving the link to that guard', async () => {
    const t = setup();
    const p = popup();
    t.fire('did-create-window', p.window);
    p.start('https://example.com/from-popup');
    p.navigate();
    expect(p.window.destroy).toHaveBeenCalledOnce();
    run(t, 0);
    run(t, 1);
    await settle();
    expect(p.window.destroy).toHaveBeenCalledOnce();
    expect(t.deps.openExternal).not.toHaveBeenCalled();
  });

  it('routes a started navigation that will-navigate never reported', async () => {
    const t = setup();
    const p = popup();
    t.fire('did-create-window', p.window);
    p.start('about:blank');
    p.start('https://example.com/frame', false);
    run(t, 0);
    expect(p.window.destroy).not.toHaveBeenCalled();
    p.start('https://example.com/from-popup');
    run(t, 2);
    expect(p.window.destroy).toHaveBeenCalledOnce();
    await settle();
    expect(t.deps.openExternal).toHaveBeenCalledExactlyOnceWith('https://example.com/from-popup');
  });

  it('routes what the popup shows when its navigation started before anyone listened', async () => {
    const t = setup();
    const p = popup('https://example.com/early');
    t.fire('did-create-window', p.window);
    run(t, 0);
    expect(p.window.destroy).toHaveBeenCalledOnce();
    await settle();
    expect(t.deps.openExternal).toHaveBeenCalledExactlyOnceWith('https://example.com/early');
  });

  it('routes a late navigation at the timeout instead of dropping it', async () => {
    const t = setup();
    const p = popup();
    t.fire('did-create-window', p.window);
    p.start('https://example.com/late');
    run(t, 1);
    await settle();
    expect(t.deps.openExternal).toHaveBeenCalledExactlyOnceWith('https://example.com/late');
    expect(p.window.destroy).toHaveBeenCalledOnce();
  });

  it('blocks, without routing again, a will-navigate that arrives after the timer routed the popup', async () => {
    const t = setup();
    const p = popup();
    t.guard(p.window.webContents);
    t.fire('did-create-window', p.window);
    p.start('https://example.com/from-popup');
    run(t, 0);
    const late = p.willNavigate('https://example.com/from-popup');
    await settle();
    expect(late.preventDefault).toHaveBeenCalledOnce();
    expect(t.deps.openExternal).toHaveBeenCalledExactlyOnceWith('https://example.com/from-popup');
  });

  it('never reads a destroyed popup', () => {
    const t = setup();
    const p = popup('https://example.com/gone');
    t.fire('did-create-window', p.window);
    p.window.isDestroyed.mockReturnValue(true);
    run(t, 0);
    expect(p.window.webContents.getURL).not.toHaveBeenCalled();
    expect(t.deps.openExternal).not.toHaveBeenCalled();
  });
});
