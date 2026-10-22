import {
  BrowserWindow,
  desktopCapturer,
  webContents,
  type WebContents,
  type WebFrameMain,
} from 'electron';
import type { CaptureChoice, DisplayCapturePort } from './session-guard.ts';

/**
 * Chromium uses the xdg-desktop-portal picker when running natively on
 * Wayland; under XWayland it captures through X11 like any X11 session.
 */
export function usesPortalPicker(platform: string, wayland: boolean): boolean {
  return platform === 'linux' && wayland;
}

/** The macOS version that added a system picker for screen sharing; older versions need YapYap's. */
const SYSTEM_PICKER_MACOS = 15;

export function hasSystemPicker(platform: string, systemVersion: string): boolean {
  return platform === 'darwin' && Number.parseInt(systemVersion, 10) >= SYSTEM_PICKER_MACOS;
}

// The session hands back the frames and web contents Electron gave it, so
// narrowing them back to Electron's types is safe.
export function electronCapture(
  platform: string,
  wayland: boolean,
  systemVersion: string,
  pickInApp: (contents: object) => Promise<CaptureChoice | undefined>,
): DisplayCapturePort {
  const systemPicker = hasSystemPicker(platform, systemVersion);
  return {
    contentsOfFrame: (frame) => webContents.fromFrame(frame as WebFrameMain),
    isVisibleAndFocused: (contents) => {
      const window = BrowserWindow.fromWebContents(contents as WebContents);
      return window !== null && window.isVisible() && window.isFocused();
    },
    pick: systemPicker ? undefined : choosePicker(platform, wayland, pickInApp),
    useSystemPicker: systemPicker,
  };
}

/** Wayland has the portal's picker; Windows, X11 and older macOS use YapYap's. */
function choosePicker(
  platform: string,
  wayland: boolean,
  pickInApp: (contents: object) => Promise<CaptureChoice | undefined>,
): DisplayCapturePort['pick'] {
  if (!usesPortalPicker(platform, wayland)) {
    return pickInApp;
  }
  return async () => {
    const [source] = await desktopCapturer.getSources({ types: ['screen', 'window'] });
    return source === undefined ? undefined : { video: source };
  };
}
