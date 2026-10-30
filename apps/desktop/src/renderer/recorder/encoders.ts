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

/** Takes each frame as PCM, the header first. */
function framesInto(pending: { parts: BlobPart[] }): WritableStream<AudioData> {
  let header = false;
  return new WritableStream({
    write: (frame) => {
      if (!header) {
        header = true;
        pending.parts.push(wavHeader(frame.sampleRate, CHANNELS));
      }
      pending.parts.push(pcm16(samplesOf(frame)));
      frame.close();
    },
  });
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
      const { readable } = new MediaStreamTrackProcessor({ track });
      const stopping = new AbortController();
      const flush = (): void => {
        if (pending.parts.length > 0) {
          onData(new Blob(pending.parts));
          pending.parts = [];
        }
      };
      const timer = setInterval(flush, timeslice);
      // Stopping aborts the pipe, which cancels the track's stream; that rejection is the normal end.
      const reading = readable
        .pipeTo(framesInto(pending), { signal: stopping.signal })
        .catch(() => undefined);
      finish = () => {
        clearInterval(timer);
        stopping.abort();
        void reading.then(() => {
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
