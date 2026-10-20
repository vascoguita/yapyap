import {
  BrowserWindow,
  desktopCapturer,
  webContents,
  type WebContents,
  type WebFrameMain,
} from 'electron';
import type { DisplayCapturePort } from './session-guard.ts';

/** Chromium uses the xdg-desktop-portal picker when running natively on Wayland. */
export function usesPortalPicker(
  platform: string,
  env: Readonly<Record<string, string | undefined>>,
): boolean {
  return platform === 'linux' && (env['WAYLAND_DISPLAY'] ?? '') !== '';
}

// The session hands back the frames and web contents Electron gave it, so
// narrowing them back to Electron's types is safe.
export function electronCapture(
  platform: string,
  env: Readonly<Record<string, string | undefined>>,
): DisplayCapturePort {
  return {
    contentsOfFrame: (frame) => webContents.fromFrame(frame as WebFrameMain),
    isVisibleAndFocused: (contents) => {
      const window = BrowserWindow.fromWebContents(contents as WebContents);
      return window !== null && window.isVisible() && window.isFocused();
    },
    pickWithPortal: usesPortalPicker(platform, env)
      ? async () => {
          const [source] = await desktopCapturer.getSources({ types: ['screen', 'window'] });
          return source;
        }
      : undefined,
    useSystemPicker: platform === 'darwin',
  };
}
