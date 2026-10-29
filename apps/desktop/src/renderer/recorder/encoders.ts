import type { Encoder } from './capture.ts';
import { pcm16, wavHeader } from './wav.ts';

/** Opus in WebM: small files that every platform's players open. */
const FORMAT = 'audio/webm;codecs=opus';

/** Opus in WebM, which the browser encodes itself. */
export function opusEncoder(stream: MediaStream): Encoder {
  const recorder = new MediaRecorder(stream, { mimeType: FORMAT });
  return {
    start: (timeslice, onData, onStop) => {
      recorder.ondataavailable = ({ data }) => {
        onData(data);
      };
      recorder.onstop = () => {
        onStop();
      };
      recorder.start(timeslice);
    },
    stop: () => {
      recorder.stop();
    },
  };
}

/** Reads an audio track as frames (Chromium's insertable streams); the DOM types lack it. */
declare class MediaStreamTrackProcessor {
  constructor(init: { readonly track: MediaStreamTrack });
  readonly readable: ReadableStream<AudioData>;
}

/** WAV recordings are stereo: a mono frame is written to both channels. */
const CHANNELS = 2;

/** One frame's samples, one array per channel, as 32-bit floats. */
function samplesOf(frame: AudioData): Float32Array[] {
  return Array.from({ length: CHANNELS }, (_, channel) => {
    const plane = Math.min(channel, frame.numberOfChannels - 1);
    const samples = new Float32Array(frame.numberOfFrames);
    frame.copyTo(samples, { planeIndex: plane, format: 'f32-planar' });
    return samples;
  });
}

/** The mixed stream's one audio track. */
function audioTrackOf(stream: MediaStream): MediaStreamTrack {
  const [track] = stream.getAudioTracks();
  if (track === undefined) {
    throw new Error('There is no sound to record.');
  }
  return track;
}

/** Reads frames until the reader is cancelled, as PCM, the header first. */
async function readFrames(
  reader: ReadableStreamDefaultReader<AudioData>,
  pending: { parts: BlobPart[] },
): Promise<void> {
  let header = false;
  for (let next = await reader.read(); !next.done; next = await reader.read()) {
    const frame = next.value;
    if (!header) {
      header = true;
      pending.parts.push(wavHeader(frame.sampleRate, CHANNELS));
    }
    pending.parts.push(pcm16(samplesOf(frame)));
    frame.close();
  }
}

/**
 * WAV, which no browser encoder writes: the page reads the samples itself,
 * as 16-bit PCM in stereo, after a header whose sizes the main process
 * completes once the recording ends (#442).
 */
export function wavEncoder(stream: MediaStream): Encoder {
  const track = audioTrackOf(stream);
  const pending: { parts: BlobPart[] } = { parts: [] };
  let finish = (): void => undefined;
  return {
    start: (timeslice, onData, onStop) => {
      const reader = new MediaStreamTrackProcessor({ track }).readable.getReader();
      const flush = (): void => {
        if (pending.parts.length > 0) {
          onData(new Blob(pending.parts));
          pending.parts = [];
        }
      };
      const timer = setInterval(flush, timeslice);
      const reading = readFrames(reader, pending);
      finish = () => {
        clearInterval(timer);
        void reader.cancel().then(async () => {
          await reading;
          flush();
          onStop();
        });
      };
    },
    stop: () => {
      finish();
    },
  };
}
