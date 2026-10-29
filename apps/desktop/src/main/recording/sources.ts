import type { ChromeWindowDependencies } from '../chrome/window-opener.ts';
import type { ViewRegistry } from '../views.ts';
import type { WindowOptions } from '../windows.ts';
import { createRecording } from './chrome.ts';
import { recordingConsent } from './consent.ts';
import type { LibraryPaths } from './library.ts';
import type { RecordingGate } from '../permissions/session-guard.ts';
import type { CallRecorder, CallTarget } from './recorder.ts';
import { recordingWindows } from './windows.ts';

/** What call recording needs from Electron and the file system (ADR 0015). */
export interface RecordingSources {
  /** Whether this system can capture a call's sound (ADR 0015). */
  readonly supported: boolean;
  readonly paths: LibraryPaths;
  /** Where the user's confirmation of the consent warning is kept. */
  readonly consentFile: string;
  /** Shows the consent warning; true only once the user confirms it. */
  readonly askConsent: () => Promise<boolean>;
  /** The call window of the account whose WhatsApp is `main`, if a call runs. */
  readonly callWindowOf: (main: object, views: ViewRegistry) => CallTarget | undefined;
  readonly show: (file: string) => void;
}

/** The accounts, as far as recording needs them: the WhatsApp view of the one on screen. */
interface ShownAccount {
  readonly current?: { readonly activeContents: () => object } | undefined;
}

/** Call recording for the account on screen, with YapYap's own windows. */
export function callRecording(
  sources: RecordingSources,
  windows: ChromeWindowDependencies,
  windowOf: (contents: object) => WindowOptions['parent'] | null,
  accounts: ShownAccount,
): ReturnType<typeof createRecording> {
  return createRecording({
    supported: sources.supported,
    paths: sources.paths,
    callOf: () => {
      const main = accounts.current?.activeContents();
      return main === undefined ? undefined : sources.callWindowOf(main, windows.views);
    },
    ...recordingWindows(windows, windowOf),
    consent: recordingConsent(sources.consentFile, sources.askConsent),
    show: sources.show,
    now: () => new Date(),
    after: (ms, run) => {
      const timer = setTimeout(run, ms);
      return () => {
        clearTimeout(timer);
      };
    },
    log: windows.warn,
  });
}

/**
 * Stops the recording when the user switches to another account, since a
 * recording belongs to the account on screen (ADR 0015).
 */
export function stopOnSwitch<
  Menu extends { readonly entries: readonly { readonly id: string; readonly active: boolean }[] },
>(set: (menu: Menu) => void, recorder: Pick<CallRecorder, 'stop'>): (menu: Menu) => void {
  let active: string | undefined;
  return (menu) => {
    const now = menu.entries.find((entry) => entry.active)?.id;
    if (active !== undefined && now !== active) {
      void recorder.stop();
    }
    active = now;
    set(menu);
  };
}

/**
 * The session guard's gate, for sessions guarded before the recorder
 * exists: until it is bound, no page is recording, so the gate allows
 * nothing.
 */
export function lateRecordingGate(): {
  readonly gate: RecordingGate;
  readonly bind: (recorder: Pick<CallRecorder, 'gate'>) => void;
} {
  let bound: RecordingGate | undefined;
  return {
    gate: {
      recording: (contents) => bound?.recording(contents) ?? false,
      callFrame: (contents) => bound?.callFrame(contents),
    },
    bind: (recorder) => {
      bound = recorder.gate;
    },
  };
}
