import { CHROME_CHANNELS, type PickerOffer } from '../../shared/chrome-api.ts';
import { NO_ARGUMENTS, type ChromeCall, type ChromeHandler } from '../chrome/ipc.ts';
import type { CaptureChoice, CaptureSource } from '../permissions/session-guard.ts';

/** A capture source as `desktopCapturer` describes it. */
export interface DesktopSource extends CaptureSource {
  readonly thumbnail: { toDataURL(): string };
}

export interface PickerWindow {
  readonly webContents: object;
  close(): void;
  /** Called once the window is gone, however it was closed. */
  onClosed(listener: () => void): void;
}

export interface SourcePickerDependencies {
  readonly getSources: () => Promise<readonly DesktopSource[]>;
  /** Opens the picker page in a window attached to the requesting one. */
  readonly openPicker: (owner: object) => PickerWindow;
  /** System audio can only be captured on Windows. */
  readonly offerAudio: boolean;
  readonly wait: (ms: number) => Promise<void>;
}

/** desktopCapturer sometimes lists nothing for a moment, such as right after a display change. */
const SOURCE_ATTEMPTS = 3;
const SOURCE_RETRY_MS = 300;

async function listSources(deps: SourcePickerDependencies): Promise<readonly DesktopSource[]> {
  let sources = await deps.getSources();
  for (let attempt = 1; attempt < SOURCE_ATTEMPTS && sources.length === 0; attempt += 1) {
    await deps.wait(SOURCE_RETRY_MS);
    sources = await deps.getSources();
  }
  return sources;
}

interface ActivePick {
  readonly window: PickerWindow;
  readonly sources: readonly DesktopSource[];
  readonly settle: (choice: CaptureChoice | undefined) => void;
}

export interface SourcePicker {
  /** Resolves with the user's choice, or nothing if they cancel or a picker is already open. */
  readonly pick: (owner: object) => Promise<CaptureChoice | undefined>;
  readonly handlers: readonly ChromeHandler[];
}

const choiceArguments = (args: readonly unknown[]): boolean =>
  args.length === 2 && typeof args[0] === 'string' && typeof args[1] === 'boolean';

function toOffer(pick: ActivePick, offerAudio: boolean): PickerOffer {
  return {
    sources: pick.sources.map(({ id, name, thumbnail }) => ({
      id,
      name,
      kind: id.startsWith('screen:') ? 'screen' : 'window',
      thumbnail: thumbnail.toDataURL(),
    })),
    offerAudio,
  };
}

function pickerHandlers(
  owned: (call: ChromeCall) => ActivePick,
  offerAudio: boolean,
): ChromeHandler[] {
  const choose = (call: ChromeCall, id: unknown, audio: unknown): void => {
    const pick = owned(call);
    const video = pick.sources.find((source) => source.id === id);
    if (video === undefined) throw new Error('That source was not offered.');
    pick.settle(audio === true && offerAudio ? { video, audio: 'loopback' } : { video });
  };
  return [
    {
      channel: CHROME_CHANNELS.pickerOffer,
      accepts: NO_ARGUMENTS,
      handle: (call) => toOffer(owned(call), offerAudio),
    },
    { channel: CHROME_CHANNELS.pickerChoose, accepts: choiceArguments, handle: choose },
    {
      channel: CHROME_CHANNELS.pickerCancel,
      accepts: NO_ARGUMENTS,
      handle: (call) => {
        owned(call).settle(undefined);
      },
    },
  ];
}

/**
 * YapYap's own source picker for platforms without a system one. Only the
 * picker window of the pending request can answer it, and only with a source
 * it was offered.
 */
export function createSourcePicker(deps: SourcePickerDependencies): SourcePicker {
  let active: ActivePick | undefined;
  const owned = ({ sender }: ChromeCall): ActivePick => {
    if (active?.window.webContents !== sender) throw new Error('No picker belongs to this window.');
    return active;
  };
  return {
    pick: async (owner) => {
      if (active !== undefined) return undefined;
      const sources = await listSources(deps);
      return new Promise((resolve) => {
        const window = deps.openPicker(owner);
        const settle = (choice: CaptureChoice | undefined, closing = false): void => {
          if (active?.window !== window) return;
          active = undefined;
          resolve(choice);
          if (!closing) window.close();
        };
        active = { window, sources, settle };
        // A window that is already closing must not be closed again.
        window.onClosed(() => {
          settle(undefined, true);
        });
      });
    },
    handlers: pickerHandlers(owned, deps.offerAudio),
  };
}
