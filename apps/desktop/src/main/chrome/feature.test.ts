import type { MenuItemConstructorOptions } from 'electron';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type { ViewInfo } from '../views.ts';
import {
  CHROME_PARTITION,
  createChromeFeature,
  type ChromeFeatureDependencies,
} from './feature.ts';
import type { IpcInvokeEvent } from './ipc.ts';

type Listener = (event: IpcInvokeEvent, ...args: unknown[]) => unknown;

function setup() {
  const listeners = new Map<string, Listener>();
  const window = {
    webContents: {},
    isDestroyed: () => false,
    focus: vi.fn(),
    once: vi.fn(),
    show: vi.fn(),
    loadURL: vi.fn(() => Promise.resolve()),
  };
  let handler: ((request: { url: string }) => Promise<Response>) | undefined;
  let menu: MenuItemConstructorOptions[] = [];
  const deps = {
    registerSchemesAsPrivileged: vi.fn(),
    chromeProtocol: vi.fn(() => ({
      handle: vi.fn((_scheme: string, h: typeof handler) => {
        handler = h;
      }),
    })),
    ipc: {
      handle: vi.fn((channel: string, listener: Listener) => {
        listeners.set(channel, listener);
      }),
    },
    createWindow: vi.fn(() => window),
    setMenu: vi.fn((template: MenuItemConstructorOptions[]) => {
      menu = template;
    }),
    writeClipboard: vi.fn(() => Promise.resolve()),
    facts: () => ({
      version: '0.1.0',
      channel: 'deb',
      versions: { electron: '44.9.0', chrome: '152', node: '24.22.0' },
      platform: 'linux',
      release: '7.0.0',
      arch: 'x64',
    }),
    platform: 'linux',
    rendererRoot: '/app/renderer',
    preloadPath: '/app/preload/chrome.cjs',
    readFile: vi.fn(() => Promise.resolve(new Uint8Array([60]))),
  } satisfies ChromeFeatureDependencies;
  const views = new WeakMap<object, ViewInfo>();
  const feature = createChromeFeature(deps);
  const call = (channel: string) =>
    listeners.get(channel)?.({
      sender: window.webContents,
      senderFrame: { url: 'app://chrome/about.html' },
    });
  const clickAbout = (): void => {
    const help = menu.at(-1)?.submenu;
    const about = Array.isArray(help) ? help[0] : undefined;
    (about?.click as (() => void) | undefined)?.();
  };
  return { deps, feature, views, window, call, clickAbout, handler: () => handler };
}

describe('createChromeFeature', () => {
  it('registers app: as a standard, secure scheme before the app is ready', () => {
    const t = setup();
    t.feature.beforeReady();
    expect(t.deps.registerSchemesAsPrivileged).toHaveBeenCalledExactlyOnceWith([
      { scheme: 'app', privileges: { standard: true, secure: true } },
    ]);
  });

  it('serves the renderer folder on the chrome session', async () => {
    const t = setup();
    t.feature.afterReady(t.views, vi.fn());
    const response = await t.handler()?.({ url: 'app://chrome/about.html' });
    expect(response?.status).toBe(200);
    expect(t.deps.readFile).toHaveBeenCalledWith(join('/app/renderer', 'about.html'));
  });

  it('opens About from the menu as a chrome window with the chrome preload and partition', () => {
    const t = setup();
    t.feature.afterReady(t.views, vi.fn());
    t.clickAbout();
    expect(t.deps.createWindow).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'About YapYap' }),
      {
        preload: '/app/preload/chrome.cjs',
        partition: CHROME_PARTITION,
      },
    );
    expect(t.views.get(t.window.webContents)?.zone).toBe('chrome');
  });

  it('answers About IPC calls from the About window', async () => {
    const t = setup();
    t.feature.afterReady(t.views, vi.fn());
    t.clickAbout();
    expect(t.call('about:info')).toEqual(
      expect.objectContaining({ version: '0.1.0', channel: 'deb' }),
    );
    await t.call('about:copy-technical-details');
    expect(t.deps.writeClipboard).toHaveBeenCalledExactlyOnceWith(
      'YapYap 0.1.0 (deb)\nElectron 44.9.0\nChromium 152\nNode.js 24.22.0\nOS linux 7.0.0 (x64)',
    );
  });

  it('keeps chrome storage in memory', () => {
    expect(CHROME_PARTITION).toBe('yapyap-chrome');
  });
});
