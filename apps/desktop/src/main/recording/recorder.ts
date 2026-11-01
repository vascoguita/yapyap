import type { CallState } from '@yapyap/extension-sdk';
import type { WebFrameMain } from 'electron';
import type { RecordingGate } from '../permissions/session-guard.ts';

/** Four hours at most, so a forgotten recording ends (ADR 0015). */
export const MAX_RECORDING_MS = 14_400_000;

/** How long the recorder page may take to hand over its last sound once told to stop. */
const STOP_GRACE_MS = 5000;

/** The call to record: its window's web contents and main frame. */
export interface CallTarget {
  readonly contents: object;
  readonly frame: WebFrameMain;
  /** Runs `listener` once the call window is gone. */
  readonly onGone: (listener: () => void) => void;
}

/** YapYap's hidden recorder page, which captures and encodes the call's sound. */
interface RecorderPage {
  readonly contents: object;
  readonly start: () => void;
  /** Asks the page to stop and hand over what it has left, then report that it ended. */
  readonly stop: () => void;
}

/** Where a recording's sound goes: a file written as it arrives, and kept or thrown away at the end. */
export interface RecordingSink {
  readonly write: (chunk: Uint8Array) => Promise<void>;
  readonly finish: (durationMs: number) => Promise<void>;
  readonly abort: () => Promise<void>;
}

/** How a request to record ends, as `host.calls.record` tells the extension. */
export type RecordOutcome = 'recording' | 'declined' | 'no-call' | 'unsupported';

export interface RecorderDependencies {
  /** Whether this system can capture a call's sound (ADR 0015); not yet on macOS. */
  readonly supported: boolean;
  /** The call running for the account on screen, if any. */
  readonly callOf: () => CallTarget | undefined;
  /**
   * Asks the user, in YapYap's own window by the call, whether `extension`
   * may record it, with the consent warning until they have confirmed it.
   */
  readonly ask: (extension: string, call: CallTarget) => Promise<boolean>;
  readonly page: () => RecorderPage;
  readonly sink: (started: Date) => Promise<RecordingSink>;
  readonly now: () => Date;
  /** Runs `run` after `ms`; the returned function cancels it. */
  readonly after: (ms: number, run: () => void) => () => void;
  /** Tells the windows, sidebar and tray how recording stands now. */
  readonly onChange: (state: CallState) => void;
  readonly log: (message: string) => void;
}

/** A recording that is running: what it records, where to, and how it ends. */
interface Running {
  readonly call: CallTarget;
  readonly page: RecorderPage;
  readonly sink: RecordingSink;
  readonly started: Date;
  readonly cancelTimer: () => void;
  /** Writes in arrival order, so the file holds the sound as it was encoded. */
  writes: Promise<void>;
  /** Whether any sound arrived; a recording without any is not kept. */
  heard: boolean;
  ended?: () => void;
}

export interface CallRecorder {
  /** Asks the user whether `extension` may record the call on screen, and records it if they agree. */
  readonly record: (extension: string) => Promise<RecordOutcome>;
  /** Stops the recording running now, keeping what was recorded. */
  readonly stop: () => Promise<void>;
  readonly state: () => CallState;
  /** What the recorder page may capture (ADR 0015). */
  readonly gate: RecordingGate;
  /** Sound the recorder page encoded; anything from another page is ignored. */
  readonly chunk: (contents: object, chunk: Uint8Array) => void;
  /** The recorder page handed over everything after being told to stop. */
  readonly ended: (contents: object) => void;
  /** The recorder page could not capture; the recording is thrown away. */
  readonly failed: (contents: object) => void;
}

interface RecorderState {
  running?: Running | undefined;
  asking: boolean;
}

function stateOf(deps: RecorderDependencies, state: RecorderState): CallState {
  return {
    supported: deps.supported,
    call: deps.callOf() !== undefined,
    recordingSince: state.running?.started.toISOString() ?? null,
  };
}

const NOTHING_CAPTURED = 'A call recording could not capture the call, so nothing was kept.';

/** Waits for the page's last sound, or gives up after a short grace. */
function lastSound(deps: RecorderDependencies, running: Running): Promise<void> {
  return new Promise((resolve) => {
    const cancel = deps.after(STOP_GRACE_MS, resolve);
    running.ended = () => {
      cancel();
      resolve();
    };
    running.page.stop();
  });
}

async function stopRunning(deps: RecorderDependencies, state: RecorderState): Promise<void> {
  const running = state.running;
  if (running === undefined) {
    return;
  }
  running.cancelTimer();
  await lastSound(deps, running);
  state.running = undefined;
  await running.writes;
  if (running.heard) {
    await running.sink.finish(deps.now().getTime() - running.started.getTime());
    deps.log('A call recording stopped.');
  } else {
    // The page never captured anything, so an empty file would only mislead.
    await running.sink.abort();
    deps.log(NOTHING_CAPTURED);
  }
  deps.onChange(stateOf(deps, state));
}

async function startRunning(
  deps: RecorderDependencies,
  state: RecorderState,
  call: CallTarget,
): Promise<void> {
  const started = deps.now();
  const sink = await deps.sink(started);
  const stop = (): void => {
    void stopRunning(deps, state);
  };
  const running: Running = {
    call,
    sink,
    started,
    page: deps.page(),
    cancelTimer: deps.after(MAX_RECORDING_MS, stop),
    writes: Promise.resolve(),
    heard: false,
  };
  state.running = running;
  call.onGone(stop);
  running.page.start();
  deps.log('A call recording started.');
  deps.onChange(stateOf(deps, state));
}

async function record(
  deps: RecorderDependencies,
  state: RecorderState,
  extension: string,
): Promise<RecordOutcome> {
  if (!deps.supported) {
    return 'unsupported';
  }
  if (state.running !== undefined) {
    return 'recording';
  }
  const call = deps.callOf();
  if (call === undefined) {
    return 'no-call';
  }
  if (state.asking) {
    return 'declined';
  }
  // One question at a time, held until the recording has started, so two never run.
  state.asking = true;
  try {
    if (!(await deps.ask(extension, call))) {
      return 'declined';
    }
    // The call may have ended while the user decided. Each lookup gives a new
    // target, so the call is known by its window.
    if (deps.callOf()?.contents !== call.contents) {
      return 'no-call';
    }
    await startRunning(deps, state, call);
    return 'recording';
  } finally {
    state.asking = false;
  }
}

function gateOf(state: RecorderState): RecordingGate {
  return {
    recording: (contents) => state.running?.page.contents === contents,
    callFrame: (contents) =>
      state.running?.page.contents === contents ? state.running.call.frame : undefined,
  };
}

/**
 * YapYap's call recorder (ADR 0015): it records only after the user agreed
 * in YapYap's own window, and confirmed once that they know the consent
 * laws; it takes only the call window's sound and the microphone, writes
 * to a local file, and stops with the call, on request, or after four
 * hours. Extensions only ask.
 */
export function createCallRecorder(deps: RecorderDependencies): CallRecorder {
  const state: RecorderState = { asking: false };
  const from = (contents: object): Running | undefined =>
    state.running?.page.contents === contents ? state.running : undefined;
  return {
    record: (extension) => record(deps, state, extension),
    stop: () => stopRunning(deps, state),
    state: () => stateOf(deps, state),
    gate: gateOf(state),
    chunk: (contents, chunk) => {
      const running = from(contents);
      if (running !== undefined) {
        running.heard = true;
        running.writes = running.writes.then(() => running.sink.write(chunk));
      }
    },
    ended: (contents) => {
      from(contents)?.ended?.();
    },
    failed: (contents) => {
      const running = from(contents);
      if (running === undefined) {
        return;
      }
      running.cancelTimer();
      state.running = undefined;
      void running.writes.then(() => running.sink.abort());
      deps.log(NOTHING_CAPTURED);
      deps.onChange(stateOf(deps, state));
    },
  };
}
