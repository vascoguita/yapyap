import {
  CHROME_CHANNELS,
  RECORD_PROMPT_STATE_EVENT,
  RECORDER_COMMAND_EVENT,
  type RecordPromptState,
  type RecorderCommand,
  type RecordingFormat,
} from '../../shared/chrome-api.ts';
import { argumentsOf, isBoolean, noArguments } from '../ipc/arguments.ts';
import type { ChromeCall, ChromeHandler } from '../ipc/chrome.ts';
import type { CallRecorderService } from '../extensions/host-methods.ts';
import type { RecordingConsent } from './consent.ts';
import { recordings, recordingSink, revealRecording, type LibraryPaths } from './library.ts';
import { createCallRecorder, type CallRecorder, type CallTarget } from './recorder.ts';

/** The most sound one chunk may carry: a second of Opus is a few kilobytes. */
const MAX_CHUNK_BYTES = 1_048_576;

/** A YapYap window, as far as the recording needs one. */
export interface RecordingWindow {
  readonly webContents: { send(channel: string, payload: unknown): void };
  /** Resolves once its page has loaded. */
  readonly loaded: Promise<void>;
  readonly close: () => void;
  readonly onClosed: (listener: () => void) => void;
}

export interface RecordingDependencies {
  /** Whether this system can capture a call's sound (ADR 0015). */
  readonly supported: boolean;
  readonly paths: LibraryPaths;
  /** How the next recording is encoded, as Settings says (#442). */
  readonly format: () => RecordingFormat;
  /** The call running for the account on screen, if any. */
  readonly callOf: () => CallTarget | undefined;
  /** Opens the hidden recorder page. */
  readonly openRecorder: () => RecordingWindow;
  /** Opens YapYap's window by the call, attached to the call window, with room for the warning. */
  readonly openPrompt: (call: CallTarget, consent: boolean) => RecordingWindow;
  /** The user's confirmation of the consent warning, which the window asks for until given. */
  readonly consent: RecordingConsent;
  /** Shows a file in the system's file manager. */
  readonly show: (file: string) => void;
  readonly now: () => Date;
  readonly after: (ms: number, run: () => void) => () => void;
  readonly log: (message: string) => void;
}

/** The window by the call, and what it shows. */
interface Prompt {
  readonly window: RecordingWindow;
  state: RecordPromptState;
  answer?: ((record: boolean) => void) | undefined;
}

interface Slots {
  prompt?: Prompt | undefined;
  page?: RecordingWindow | undefined;
}

function show(prompt: Prompt, state: RecordPromptState): void {
  prompt.state = state;
  void prompt.window.loaded.then(() => {
    prompt.window.webContents.send(RECORD_PROMPT_STATE_EVENT, state);
  });
}

/**
 * Asks in a window by the call, with the consent warning until the user
 * confirmed it; closing the window counts as **Cancel**.
 */
async function ask(deps: RecordingDependencies, slots: Slots, extension: string, call: CallTarget) {
  const consent = !(await deps.consent.confirmed());
  return new Promise<boolean>((resolve) => {
    slots.prompt?.window.close();
    const prompt: Prompt = {
      window: deps.openPrompt(call, consent),
      state: { extension, consent, phase: 'asking', since: null },
      answer: resolve,
    };
    slots.prompt = prompt;
    prompt.window.onClosed(() => {
      prompt.answer?.(false);
      if (slots.prompt === prompt) {
        slots.prompt = undefined;
      }
    });
  });
}

/** The recorder page, opened once and reused, which acts only once loaded. */
function page(deps: RecordingDependencies, slots: Slots, format: () => RecordingFormat) {
  let window = slots.page;
  if (window === undefined) {
    const opened = deps.openRecorder();
    opened.onClosed(() => {
      slots.page = undefined;
    });
    slots.page = opened;
    window = opened;
  }
  const loaded = window;
  const send = (command: RecorderCommand) => () => {
    void loaded.loaded.then(() => {
      loaded.webContents.send(RECORDER_COMMAND_EVENT, command);
    });
  };
  return {
    contents: loaded.webContents,
    start: () => {
      send(format() === 'wav' ? 'start-wav' : 'start')();
    },
    stop: send('stop'),
  };
}

function recorderOf(deps: RecordingDependencies, slots: Slots): CallRecorder {
  // Read when the file is made, so the page encodes what the file is named for.
  let format: RecordingFormat = 'webm';
  return createCallRecorder({
    supported: deps.supported,
    callOf: deps.callOf,
    ask: (extension, call) => ask(deps, slots, extension, call),
    page: () => page(deps, slots, () => format),
    sink: (started) => {
      format = deps.format();
      return recordingSink(deps.paths, started, format);
    },
    now: deps.now,
    after: deps.after,
    onChange: ({ recordingSince }) => {
      const prompt = slots.prompt;
      if (prompt !== undefined) {
        const phase = recordingSince === null ? 'ended' : 'recording';
        show(prompt, { ...prompt.state, phase, since: recordingSince ?? prompt.state.since });
      }
    },
    log: deps.log,
  });
}

const isChunk = argumentsOf(
  (bytes) => bytes instanceof Uint8Array && bytes.length <= MAX_CHUNK_BYTES,
);

const isAnswer = argumentsOf(isBoolean, isBoolean);

/**
 * Takes the user's answer. The window offers **Record** only once the
 * consent warning's box is ticked, and YapYap checks that again here,
 * keeping the confirmation once it is given (ADR 0015).
 */
function answer(consent: RecordingConsent, prompt: Prompt, record: boolean, consented: boolean) {
  if (record && prompt.state.consent) {
    if (!consented) {
      throw new Error('Recording needs the consent warning confirmed.');
    }
    consent.confirm();
  }
  prompt.answer?.(record);
  prompt.answer = undefined;
  if (!record) {
    prompt.window.close();
  }
}

function recorderHandlers(recorder: CallRecorder): ChromeHandler[] {
  return [
    {
      channel: CHROME_CHANNELS.recorderChunk,
      accepts: isChunk,
      handle: ({ sender }, bytes) => {
        recorder.chunk(sender, bytes as Uint8Array);
      },
    },
    {
      channel: CHROME_CHANNELS.recorderEnded,
      accepts: noArguments,
      handle: ({ sender }) => {
        recorder.ended(sender);
      },
    },
    {
      channel: CHROME_CHANNELS.recorderFailed,
      accepts: noArguments,
      handle: ({ sender }) => {
        recorder.failed(sender);
      },
    },
  ];
}

/** The prompt window's operations, which only that window may call. */
function promptHandlers(
  slots: Slots,
  recorder: CallRecorder,
  consent: RecordingConsent,
): ChromeHandler[] {
  const owned = ({ sender }: ChromeCall): Prompt => {
    const prompt = slots.prompt;
    if (prompt?.window.webContents !== sender) {
      throw new Error('No call recording belongs to this window.');
    }
    return prompt;
  };
  return [
    {
      channel: CHROME_CHANNELS.recordPromptState,
      accepts: noArguments,
      handle: (call) => owned(call).state,
    },
    {
      channel: CHROME_CHANNELS.recordPromptAnswer,
      accepts: isAnswer,
      handle: (call, record, consented) => {
        answer(consent, owned(call), record as boolean, consented as boolean);
      },
    },
    {
      channel: CHROME_CHANNELS.recordPromptStop,
      accepts: noArguments,
      handle: (call) => {
        owned(call);
        return recorder.stop();
      },
    },
  ];
}

/**
 * YapYap's call recording (ADR 0015): the recorder, the windows it uses,
 * their operations, and what it offers extensions.
 */
export function createRecording(deps: RecordingDependencies): {
  readonly recorder: CallRecorder;
  readonly handlers: readonly ChromeHandler[];
  readonly service: CallRecorderService;
} {
  const slots: Slots = {};
  const recorder = recorderOf(deps, slots);
  return {
    recorder,
    handlers: [...recorderHandlers(recorder), ...promptHandlers(slots, recorder, deps.consent)],
    service: {
      record: recorder.record,
      stop: recorder.stop,
      state: recorder.state,
      recordings: () => recordings(deps.paths),
      reveal: (id) => revealRecording(deps.paths, id, deps.show),
    },
  };
}
