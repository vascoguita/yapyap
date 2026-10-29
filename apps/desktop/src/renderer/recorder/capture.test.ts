import { describe, expect, it, vi } from 'vitest';
import type { ChromeApi, RecorderCommand } from '../../shared/chrome-api.ts';
import { serveRecorder, type CaptureEnvironment, type Encoder } from './capture.ts';

const track = () => ({ stop: vi.fn() });

function stream(audio = [track()], video: ReturnType<typeof track>[] = []) {
  return {
    getVideoTracks: () => video,
    getTracks: () => [...audio, ...video],
    audio,
    video,
  } as unknown as MediaStream & { audio: typeof audio; video: typeof video };
}

function setup(
  options: { display?: () => Promise<MediaStream>; mic?: () => Promise<MediaStream> } = {},
) {
  let command: (command: RecorderCommand) => void = () => undefined;
  const api = {
    onCommand: vi.fn((listener: (command: RecorderCommand) => void) => {
      command = listener;
    }),
    chunk: vi.fn(() => Promise.resolve()),
    ended: vi.fn(() => Promise.resolve()),
    failed: vi.fn(() => Promise.resolve()),
  } satisfies ChromeApi['recorder'];
  const call = stream([track()], [track()]);
  const mic = stream();
  const mixed = stream();
  const handlers: { data?: (data: Blob) => void; stopped?: () => void } = {};
  const start = vi.fn((_timeslice: number, onData: (data: Blob) => void, onStop: () => void) => {
    handlers.data = onData;
    handlers.stopped = onStop;
  });
  const stop = vi.fn();
  const encoder: Encoder = { start, stop };
  const env = {
    getDisplayMedia: vi.fn(options.display ?? (() => Promise.resolve(call))),
    getUserMedia: vi.fn(options.mic ?? (() => Promise.resolve(mic))),
    mix: vi.fn(() => mixed),
    encoder: vi.fn(() => encoder),
  } satisfies CaptureEnvironment;
  serveRecorder(api, env);
  const blob = (bytes: number[]) =>
    ({ arrayBuffer: () => Promise.resolve(new Uint8Array(bytes).buffer) }) as unknown as Blob;
  return {
    api,
    handlers,
    env,
    encoder,
    start,
    stop,
    call,
    mic,
    mixed,
    send: (c: RecorderCommand) => {
      command(c);
    },
    blob,
  };
}

describe('serveRecorder', () => {
  it('records the call’s sound with the microphone, never its picture, in one-second slices', async () => {
    const t = setup();
    t.send('start');
    await vi.waitFor(() => {
      expect(t.start).toHaveBeenCalledExactlyOnceWith(
        1000,
        expect.any(Function),
        expect.any(Function),
      );
    });
    expect(t.env.getDisplayMedia).toHaveBeenCalledWith({ audio: true, video: true });
    expect(t.env.getUserMedia).toHaveBeenCalledWith({ audio: true });
    expect(t.call.video[0]?.stop).toHaveBeenCalledOnce();
    expect(t.env.mix).toHaveBeenCalledWith([t.call, t.mic]);
    expect(t.env.encoder).toHaveBeenCalledWith(t.mixed);
  });

  it('hands the sound over in order, then everything else, and says it ended', async () => {
    const t = setup();
    t.send('start');
    await vi.waitFor(() => {
      expect(t.handlers.data).toBeDefined();
    });
    t.handlers.data?.(t.blob([1, 2]));
    t.handlers.data?.(t.blob([3]));
    t.send('stop');
    expect(t.stop).toHaveBeenCalledOnce();
    t.handlers.stopped?.();
    await vi.waitFor(() => {
      expect(t.api.ended).toHaveBeenCalledOnce();
    });
    expect(t.api.chunk.mock.calls).toEqual([[new Uint8Array([1, 2])], [new Uint8Array([3])]]);
    for (const stopped of [...t.call.audio, ...t.mic.audio]) {
      expect(stopped.stop).toHaveBeenCalled();
    }
  });

  it('records the call alone when there is no microphone it may use', async () => {
    const t = setup({ mic: () => Promise.reject(new Error('NotAllowedError')) });
    t.send('start');
    await vi.waitFor(() => {
      expect(t.start).toHaveBeenCalledOnce();
    });
    expect(t.env.mix).toHaveBeenCalledWith([t.call]);
  });

  it('says so when it cannot take the call’s sound, and ignores a stop before anything started', async () => {
    const t = setup({ display: () => Promise.reject(new Error('NotAllowedError')) });
    t.send('stop');
    t.send('start');
    await vi.waitFor(() => {
      expect(t.api.failed).toHaveBeenCalledOnce();
    });
    expect(t.env.encoder).not.toHaveBeenCalled();
  });
});
