import { en } from '../../shared/messages/en.ts';
import {
  asPromptWindow,
  loadChromePage,
  openChromeWindow,
  type ChromePage,
  type ChromeWindowDependencies,
  type ChromeWindowPort,
} from '../chrome/window-opener.ts';
import type { WindowOptions } from '../window/windows.ts';
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

/** Tall enough for the consent warning's text and box, shown until the user confirms it. */
const CONSENT_HEIGHT = 480;

function asRecordingWindow(window: ChromeWindowPort, loaded: Promise<void>): RecordingWindow {
  return { ...asPromptWindow(window), webContents: window.webContents, loaded };
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
  readonly openPrompt: (call: CallTarget, consent: boolean) => RecordingWindow;
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
      return asRecordingWindow(window, loadChromePage(deps, window, 'recorder.html'));
    },
    openPrompt: (call, consent) => {
      const parent = windowOf(call.contents);
      return openPrompt(deps, {
        ...(consent ? { height: CONSENT_HEIGHT } : {}),
        ...(parent == null ? {} : { parent }),
      });
    },
  };
}

function openPrompt(deps: ChromeWindowDependencies, extra: WindowOptions): RecordingWindow {
  const window = openChromeWindow(deps, RECORD_PROMPT_PAGE, extra);
  const loaded = new Promise<void>((resolve) => {
    window.once('ready-to-show', resolve);
  });
  return asRecordingWindow(window, loaded);
}
