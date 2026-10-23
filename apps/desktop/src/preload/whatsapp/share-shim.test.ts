import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installShareShim } from './share-shim.ts';

/** A media track as far as the stand-in sees one. */
function track() {
  const state = { readyState: 'live' };
  return Object.assign(state, {
    stop: vi.fn(() => {
      state.readyState = 'ended';
    }),
  });
}

function stream(video: number, audio = 0) {
  const videoTracks = Array.from({ length: video }, track);
  const audioTracks = Array.from({ length: audio }, track);
  return {
    videoTracks,
    audioTracks,
    getVideoTracks: () => videoTracks,
    getTracks: () => [...videoTracks, ...audioTracks],
  };
}

type Devices = Record<string, (...args: unknown[]) => Promise<ReturnType<typeof stream>>>;

function install(methods: readonly string[] = ['getDisplayMedia', 'getUserMedia']) {
  let stopRequest: ((id: string) => void) | undefined;
  const bridge = {
    started: vi.fn(),
    ended: vi.fn(),
    onStop: vi.fn((listener: (id: string) => void) => {
      stopRequest = listener;
    }),
  };
  const next = { value: stream(1) };
  const prototype: Record<string, unknown> = {};
  for (const method of methods) {
    prototype[method] = vi.fn(() => Promise.resolve(next.value));
  }
  Reflect.set(globalThis, 'MediaDevices', { prototype });
  Reflect.set(globalThis, 'testShareBridge', bridge);
  installShareShim('testShareBridge');
  const devices = Object.create(prototype) as Devices;
  return { bridge, devices, next, stop: (id: string) => stopRequest?.(id) };
}

const capture = (devices: Devices, method: string, ...args: unknown[]) => {
  const call = devices[method];
  if (call === undefined) {
    throw new Error(`No ${method}.`);
  }
  return call(...args);
};

beforeEach(() => {
  vi.useFakeTimers();
  let id = 0;
  vi.spyOn(globalThis.crypto, 'randomUUID').mockImplementation(() => {
    id += 1;
    return `00000000-0000-4000-8000-00000000000${String(id)}`;
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  Reflect.deleteProperty(globalThis, 'MediaDevices');
  Reflect.deleteProperty(globalThis, 'testShareBridge');
});

const FIRST = '00000000-0000-4000-8000-000000000001';

describe('installShareShim', () => {
  it('reports a screen share when it starts, and when its last video track ends', async () => {
    const t = install();
    t.next.value = stream(2);
    const shared = await capture(t.devices, 'getDisplayMedia', { video: true });
    expect(t.bridge.started).toHaveBeenCalledWith(FIRST);
    shared.videoTracks[0]?.stop();
    vi.advanceTimersByTime(500);
    expect(t.bridge.ended).not.toHaveBeenCalled();
    shared.videoTracks[1]?.stop();
    vi.advanceTimersByTime(1500);
    expect(t.bridge.ended).toHaveBeenCalledExactlyOnceWith(FIRST);
  });

  it('stops every track of a share when YapYap asks, and ignores unknown shares', async () => {
    const t = install();
    t.next.value = stream(1, 1);
    const shared = await capture(t.devices, 'getDisplayMedia');
    t.stop('unknown');
    t.stop(FIRST);
    expect(shared.videoTracks[0]?.stop).toHaveBeenCalledOnce();
    expect(shared.audioTracks[0]?.stop).toHaveBeenCalledOnce();
    vi.advanceTimersByTime(500);
    expect(t.bridge.ended).toHaveBeenCalledExactlyOnceWith(FIRST);
  });

  it('watches the legacy desktop capture, and nothing else from getUserMedia', async () => {
    const t = install();
    await capture(t.devices, 'getUserMedia', { audio: true, video: true });
    await capture(t.devices, 'getUserMedia');
    await capture(t.devices, 'getUserMedia', {
      video: { mandatory: { chromeMediaSource: 'screen' } },
    });
    await capture(t.devices, 'getUserMedia', {
      video: { mandatory: { chromeMediaSource: 'desktop' } },
    });
    expect(t.bridge.started).toHaveBeenCalledTimes(2);
  });

  it('wraps only what the page has, and copes with no media devices at all', () => {
    const t = install(['getUserMedia']);
    expect(t.devices['getDisplayMedia']).toBeUndefined();
    Reflect.deleteProperty(globalThis, 'MediaDevices');
    expect(() => {
      installShareShim('testShareBridge');
    }).not.toThrow();
  });
});
