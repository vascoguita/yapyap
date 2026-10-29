/** @vitest-environment happy-dom */
import { describe, expect, it, vi } from 'vitest';
import type { RecorderCommand } from '../../shared/chrome-api.ts';

describe('recorder entry', () => {
  it('captures with the browser’s media devices, mixes with Web Audio and encodes Opus in WebM', async () => {
    let command: (command: RecorderCommand) => void = () => undefined;
    const call = { getVideoTracks: () => [], getTracks: () => [] };
    const destination = { stream: { id: 'mixed', getAudioTracks: () => ['mixed track'] } };
    const connect = vi.fn();
    const created: unknown[] = [];
    const chunk = vi.fn<(bytes: Uint8Array) => Promise<void>>(() => Promise.resolve());
    const ended = vi.fn(() => Promise.resolve());
    Object.defineProperty(window, 'yapyap', {
      value: {
        recorder: {
          onCommand: (listener: (command: RecorderCommand) => void) => {
            command = listener;
          },
          failed: vi.fn(),
          chunk,
          ended,
        },
      },
    });
    Object.defineProperty(navigator, 'mediaDevices', {
      value: {
        getDisplayMedia: vi.fn(() => Promise.resolve(call)),
        getUserMedia: vi.fn(() => Promise.resolve(call)),
      },
    });
    vi.stubGlobal(
      'AudioContext',
      class {
        createMediaStreamDestination() {
          return destination;
        }
        createMediaStreamSource() {
          return { connect };
        }
      },
    );
    vi.stubGlobal(
      'MediaRecorder',
      class {
        ondataavailable: ((event: { data: unknown }) => void) | null = null;
        onstop: (() => void) | null = null;
        start = vi.fn(() => {
          this.ondataavailable?.({
            data: { arrayBuffer: () => Promise.resolve(new ArrayBuffer(1)) },
          });
        });
        stop = vi.fn(() => {
          this.onstop?.();
        });
        constructor(...args: unknown[]) {
          created.push(this, args);
        }
      },
    );
    await import('./main.ts');
    command('start');
    await vi.waitFor(() => {
      expect(created[1]).toEqual([destination.stream, { mimeType: 'audio/webm;codecs=opus' }]);
    });
    const recorder = created[0] as {
      start: ReturnType<typeof vi.fn>;
      stop: ReturnType<typeof vi.fn>;
    };
    expect(recorder.start).toHaveBeenCalledWith(1000);
    command('stop');
    expect(recorder.stop).toHaveBeenCalledOnce();
    expect(connect).toHaveBeenCalledWith(destination);
    expect(connect).toHaveBeenCalledTimes(2);
    // WAV: the page reads the mixed track's frames itself, after a header.
    vi.stubGlobal(
      'MediaStreamTrackProcessor',
      class {
        readable = new ReadableStream({
          start(controller) {
            controller.enqueue({
              sampleRate: 48_000,
              numberOfChannels: 1,
              numberOfFrames: 2,
              copyTo: vi.fn(),
              close: vi.fn(),
            });
          },
        });
      },
    );
    chunk.mockClear();
    command('start-wav');
    await new Promise((resolve) => setTimeout(resolve, 10));
    command('stop');
    await vi.waitFor(() => {
      expect(ended).toHaveBeenCalledTimes(2);
    });
    const [bytes] = chunk.mock.calls[0] ?? [];
    expect(bytes?.length).toBe(44 + 2 * 4);
    expect(new TextDecoder().decode(bytes?.subarray(0, 4))).toBe('RIFF');
  });
});
