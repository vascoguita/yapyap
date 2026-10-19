import type { BrowserWindowConstructorOptions } from 'electron';
import { describe, expect, it, vi } from 'vitest';
import { APP_ID } from './identity.ts';
import { startApp, type AppPort, type WindowPort } from './start.ts';
import { secureWebPreferences } from './web-preferences.ts';
import { WHATSAPP_ORIGIN } from './whatsapp-origin.ts';

function fakes(env: Record<string, string | undefined> = {}) {
  const listeners = new Map<string, () => void>();
  const app = {
    whenReady: vi.fn(() => Promise.resolve()),
    setAppUserModelId: vi.fn(),
    on: vi.fn((event: string, listener: () => void) => listeners.set(event, listener)),
    quit: vi.fn(),
  } satisfies AppPort;
  const window = {
    once: vi.fn((event: string, listener: () => void) => listeners.set(event, listener)),
    show: vi.fn(),
    loadURL: vi.fn(() => Promise.resolve()),
  } satisfies WindowPort;
  const createWindow = vi.fn<(options: BrowserWindowConstructorOptions) => WindowPort>(
    () => window,
  );
  const warn = vi.fn();
  return { app, window, createWindow, warn, env, listeners };
}

describe('startApp', () => {
  it('opens a hidden, hardened window on the real WhatsApp origin and shows it when ready', async () => {
    const f = fakes();
    await startApp(f);

    expect(f.app.setAppUserModelId).toHaveBeenCalledWith(APP_ID);
    expect(f.createWindow).toHaveBeenCalledWith(
      expect.objectContaining({ show: false, webPreferences: secureWebPreferences() }),
    );
    expect(f.window.loadURL).toHaveBeenCalledWith(WHATSAPP_ORIGIN);
    expect(f.window.show).not.toHaveBeenCalled();
    f.listeners.get('ready-to-show')?.();
    expect(f.window.show).toHaveBeenCalledOnce();
    expect(f.warn).not.toHaveBeenCalled();
  });

  it('waits for the app to be ready before creating the window', async () => {
    const f = fakes();
    let ready: () => void = () => undefined;
    f.app.whenReady.mockReturnValueOnce(new Promise<void>((resolve) => (ready = resolve)));
    const started = startApp(f);
    await Promise.resolve();
    expect(f.createWindow).not.toHaveBeenCalled();
    ready();
    await started;
    expect(f.createWindow).toHaveBeenCalledOnce();
  });

  it('quits when every window is closed', async () => {
    const f = fakes();
    await startApp(f);
    expect(f.app.quit).not.toHaveBeenCalled();
    f.listeners.get('window-all-closed')?.();
    expect(f.app.quit).toHaveBeenCalledOnce();
  });

  it('loads a loopback test origin when one is configured', async () => {
    const f = fakes({ YAPYAP_TEST_WHATSAPP_ORIGIN: 'http://127.0.0.1:4321' });
    await startApp(f);
    expect(f.window.loadURL).toHaveBeenCalledWith('http://127.0.0.1:4321');
    expect(f.warn).not.toHaveBeenCalled();
  });

  it('warns and loads the real origin when the test origin is not loopback', async () => {
    const f = fakes({ YAPYAP_TEST_WHATSAPP_ORIGIN: 'https://evil.example' });
    await startApp(f);
    expect(f.window.loadURL).toHaveBeenCalledWith(WHATSAPP_ORIGIN);
    expect(f.warn).toHaveBeenCalledWith(expect.stringContaining('only loopback'));
  });
});
