/** @vitest-environment happy-dom */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { wavEncoder } from './encoders.ts';

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

/** A frame of `channels` channels holding `samples`, as the track processor gives one. */
const frame = (channels: number, samples: readonly number[]) => ({
  sampleRate: 48_000,
  numberOfChannels: channels,
  numberOfFrames: samples.length,
  copyTo: (destination: Float32Array, options: { planeIndex: number }) => {
    destination.set(samples.map((sample) => sample * (options.planeIndex + 1)));
  },
  close: vi.fn(),
});

/** A track processor that hands out `frames`, then waits until it is cancelled. */
function processorOf(frames: readonly ReturnType<typeof frame>[]) {
  const tracks: unknown[] = [];
  vi.stubGlobal(
    'MediaStreamTrackProcessor',
    class {
      readable: ReadableStream;
      constructor({ track }: { track: unknown }) {
        tracks.push(track);
        this.readable = new ReadableStream({
          start(controller) {
            frames.forEach((each) => {
              controller.enqueue(each);
            });
          },
        });
      }
    },
  );
  return tracks;
}

const streamWith = (tracks: unknown[]) =>
  ({ getAudioTracks: () => tracks }) as unknown as MediaStream;

describe('wavEncoder', () => {
  it('hands over a header and the samples as PCM each slice, and stops once the reading ends', async () => {
    vi.useFakeTimers();
    const mono = frame(1, [0.5, 0.5]);
    const tracks = processorOf([mono, frame(2, [1])]);
    const encoder = wavEncoder(streamWith(['track']));
    // Stopping before starting does nothing.
    encoder.stop();
    const onData = vi.fn();
    const onStop = vi.fn();
    encoder.start(1000, onData, onStop);
    expect(tracks).toEqual(['track']);
    await vi.advanceTimersByTimeAsync(1000);
    expect(onData).toHaveBeenCalledOnce();
    const first = (onData.mock.calls[0] as [Blob])[0];
    // Header, two mono frames written to both channels, then one stereo frame.
    expect(first.size).toBe(44 + 2 * 4 + 4);
    expect(mono.close).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(1000);
    expect(onData).toHaveBeenCalledOnce();
    encoder.stop();
    await vi.waitFor(() => {
      expect(onStop).toHaveBeenCalledOnce();
    });
    expect(onData).toHaveBeenCalledOnce();
  });

  it('refuses a stream without sound', () => {
    expect(() => wavEncoder(streamWith([]))).toThrow('There is no sound to record.');
  });
});
