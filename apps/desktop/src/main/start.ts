import { APP_ID, PRODUCT_NAME } from './identity.ts';
import { installWebContentsGuards, type GuardedContents } from './web-contents-guards.ts';
import type { WindowOptions } from './windows.ts';
import { resolveWhatsAppOrigin } from './whatsapp-origin.ts';

/**
 * `ready-to-show` is not guaranteed to fire (for example without a compositor),
 * and a window that never appears looks like a hung app.
 */
export const SHOW_FALLBACK_MS = 3000;

export interface AppPort {
  enableSandbox(): void;
  whenReady(): Promise<unknown>;
  setAppUserModelId(id: string): void;
  on(event: 'window-all-closed', listener: () => void): unknown;
  on(
    event: 'web-contents-created',
    listener: (event: unknown, contents: GuardedContents) => void,
  ): unknown;
  quit(): void;
}

export interface WindowPort {
  once(event: 'ready-to-show', listener: () => void): unknown;
  show(): void;
  loadURL(url: string): Promise<unknown>;
}

export interface StartDependencies {
  readonly app: AppPort;
  readonly createWindow: (options: WindowOptions) => WindowPort;
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly warn: (message: string) => void;
}

export async function startApp({ app, createWindow, env, warn }: StartDependencies): Promise<void> {
  // Must run before the app is ready; it sandboxes renderers Electron creates itself.
  app.enableSandbox();
  installWebContentsGuards(app);
  // Windows groups notifications and taskbar entries by this ID.
  app.setAppUserModelId(APP_ID);
  app.on('window-all-closed', () => {
    app.quit();
  });

  const { origin, rejectedOverride } = resolveWhatsAppOrigin(env['YAPYAP_TEST_WHATSAPP_ORIGIN']);
  if (rejectedOverride)
    warn('Ignoring YAPYAP_TEST_WHATSAPP_ORIGIN: only loopback http origins are allowed.');

  await app.whenReady();
  const window = createWindow({
    title: PRODUCT_NAME,
    width: 1200,
    height: 800,
    minWidth: 640,
    minHeight: 480,
    show: false,
  });
  let shown = false;
  const showOnce = (): void => {
    if (shown) return;
    shown = true;
    window.show();
  };
  window.once('ready-to-show', showOnce);
  setTimeout(showOnce, SHOW_FALLBACK_MS);
  await window.loadURL(origin);
}
