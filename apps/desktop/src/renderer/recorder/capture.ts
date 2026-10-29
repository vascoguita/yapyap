import type { ChromeApi } from '../../shared/chrome-api.ts';

/** How often the encoder hands over sound, so a crash loses at most this much. */
const SLICE_MS = 1000;

/** What the page needs of an encoder: start it with where its sound goes, and stop it. */
export interface Encoder {
  /** Hands each `timeslice` of sound to `onData`, and calls `onStop` once stopped. */
  readonly start: (timeslice: number, onData: (data: Blob) => void, onStop: () => void) => void;
  readonly stop: () => void;
}

/** The browser capabilities capturing needs, so tests can stand in for them. */
export interface CaptureEnvironment {
  readonly getDisplayMedia: (constraints: DisplayMediaStreamOptions) => Promise<MediaStream>;
  readonly getUserMedia: (constraints: MediaStreamConstraints) => Promise<MediaStream>;
  /** One stream holding the sound of every stream given. */
  readonly mix: (streams: readonly MediaStream[]) => MediaStream;
  readonly encoder: (stream: MediaStream) => Encoder;
}

/** The microphone, if the user has one YapYap may use; the call is recorded either way. */
const microphone = (env: CaptureEnvironment): Promise<MediaStream[]> =>
  env.getUserMedia({ audio: true }).then(
    (stream) => [stream],
    () => [],
  );

interface Capture {
  readonly encoder: Encoder;
  readonly streams: readonly MediaStream[];
}

async function startCapture(env: CaptureEnvironment): Promise<Capture> {
  // The main process answers with the call window's own sound; its picture is not wanted.
  const call = await env.getDisplayMedia({ audio: true, video: true });
  for (const track of call.getVideoTracks()) {
    track.stop();
  }
  const streams = [call, ...(await microphone(env))];
  return { encoder: env.encoder(env.mix(streams)), streams };
}

/**
 * The hidden recorder page (ADR 0015): on the main process's word it takes
 * the call window's sound and the microphone, encodes them, and hands the
 * sound over in order as it goes; on stop, it hands over the rest and says
 * it ended. If capturing fails, it says so and keeps nothing.
 */
export function serveRecorder(api: ChromeApi['recorder'], env: CaptureEnvironment): void {
  let capture: Capture | undefined;
  let handed: Promise<unknown> = Promise.resolve();
  const start = async (): Promise<void> => {
    let running: Capture;
    try {
      running = await startCapture(env);
    } catch {
      await api.failed();
      return;
    }
    capture = running;
    const onData = (data: Blob): void => {
      handed = handed.then(async () => api.chunk(new Uint8Array(await data.arrayBuffer())));
    };
    const onStop = (): void => {
      for (const track of running.streams.flatMap((stream) => stream.getTracks())) {
        track.stop();
      }
      void handed.then(() => api.ended());
    };
    running.encoder.start(SLICE_MS, onData, onStop);
  };
  api.onCommand((command) => {
    if (command === 'start') {
      void start();
    } else {
      capture?.encoder.stop();
    }
  });
}
