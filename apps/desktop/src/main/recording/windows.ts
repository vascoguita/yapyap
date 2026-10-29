import { en } from '../../shared/messages/en.ts';
import { CHROME_ORIGIN } from '../chrome/assets.ts';
import {
  openChromeWindow,
  type ChromePage,
  type ChromeWindowDependencies,
  type ChromeWindowPort,
} from '../chrome/window-opener.ts';
import { PRODUCT_NAME } from '../identity.ts';
import type { WindowOptions } from '../windows.ts';
import type { RecordingWindow } from './chrome.ts';
import type { CallTarget } from './recorder.ts';

/** YapYap's window by a call, small enough to sit beside it (ADR 0015). */
const RECORD_PROMPT_PAGE: ChromePage = {
  path: 'record-prompt.html',
  window: {
    title: en.recording.windowTitle,
    width: 360,
    height: 200,
    resizable: false,
    minimizable: false,
    maximizable: false,
  },
};

function asRecordingWindow(window: ChromeWindowPort, loaded: Promise<void>): RecordingWindow {
  return {
    loaded,
    webContents: window.webContents,
    close: () => {
      if (!window.isDestroyed()) {
        window.close();
      }
    },
    onClosed: (listener) => {
      window.once('closed', listener);
    },
  };
}

/**
 * The recorder's windows: a hidden page that is never shown, and the
 * window by the call, attached to it so it moves and closes with it.
 */
export function recordingWindows(
  deps: ChromeWindowDependencies,
  windowOf: (contents: object) => WindowOptions['parent'] | null,
): {
  readonly openRecorder: () => RecordingWindow;
  readonly openPrompt: (call: CallTarget) => RecordingWindow;
} {
  return {
    openRecorder: () => {
      const window = deps.createWindow({
        show: false,
        skipTaskbar: true,
        focusable: false,
        width: 1,
        height: 1,
      });
      deps.views.set(window.webContents, {
        zone: 'chrome',
        home: CHROME_ORIGIN,
        label: PRODUCT_NAME,
      });
      const loaded = window.loadURL(`${CHROME_ORIGIN}/recorder.html`).then(
        () => undefined,
        () => {
          deps.warn('Could not load the call recorder.');
        },
      );
      return asRecordingWindow(window, loaded);
    },
    openPrompt: (call) => {
      const parent = windowOf(call.contents);
      const window = openChromeWindow(deps, RECORD_PROMPT_PAGE, parent == null ? {} : { parent });
      const loaded = new Promise<void>((resolve) => {
        window.once('ready-to-show', resolve);
      });
      return asRecordingWindow(window, loaded);
    },
  };
}
