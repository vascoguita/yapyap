import type { WebFrameMain } from 'electron';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ViewRegistry } from '../security/views.ts';
import {
  callRecording,
  lateRecordingGate,
  stopOnSwitch,
  type RecordingSources,
} from './sources.ts';

afterEach(() => {
  vi.useRealTimers();
});

function sources(): RecordingSources & { callWindowOf: ReturnType<typeof vi.fn> } {
  return {
    supported: true,
    format: () => 'webm' as const,
    paths: { folder: '/recordings', index: '/user-data/recordings.json' },
    consentFile: '/user-data/recording-consent.json',
    callWindowOf: vi.fn(() => ({ contents: {}, frame: {} as WebFrameMain, onGone: vi.fn() })),
    show: vi.fn(),
  };
}

describe('callRecording', () => {
  it('looks for the call of the account on screen, and of none without one', () => {
    const given = sources();
    const views: ViewRegistry = new WeakMap();
    const main = {};
    const accounts: { current?: { activeContents: () => object } | undefined } = {
      current: { activeContents: () => main },
    };
    const windows = { createWindow: vi.fn(), views, warn: vi.fn() };
    const recording = callRecording(given, windows, () => null, accounts);
    expect(recording.service.state().call).toBe(true);
    expect(given.callWindowOf).toHaveBeenCalledWith(main, views);
    accounts.current = undefined;
    expect(recording.service.state().call).toBe(false);
  });

  it('times a recording with real timers, cancelling the four-hour limit when it stops', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const root = mkdtempSync(join(tmpdir(), 'yapyap-sources-'));
    const call = { contents: {}, frame: {} as WebFrameMain, onGone: vi.fn() };
    const given = {
      ...sources(),
      paths: { folder: join(root, 'Calls'), index: join(root, 'recordings.json') },
      consentFile: join(root, 'consent.json'),
      callWindowOf: vi.fn(() => call),
    };
    const window = () => ({
      webContents: { send: vi.fn() },
      isDestroyed: () => false,
      focus: vi.fn(),
      once: vi.fn(),
      close: vi.fn(),
      show: vi.fn(),
      loadURL: vi.fn(() => Promise.resolve()),
    });
    const created: ReturnType<typeof window>[] = [];
    const windows = {
      createWindow: vi.fn(() => {
        const opened = window();
        created.push(opened);
        return opened;
      }),
      views: new WeakMap(),
      warn: vi.fn(),
    };
    const recording = callRecording(given, windows, () => null, {
      current: { activeContents: () => ({}) },
    });
    const asked = recording.service.record('Recorder');
    await vi.waitFor(() => {
      expect(created).toHaveLength(1);
    });
    const answer = recording.handlers.find((entry) => entry.channel === 'record-prompt:answer');
    // The first recording asks for the consent warning too, and keeps the answer.
    answer?.handle({ sender: created[0]?.webContents ?? {} }, true, true);
    expect(await asked).toBe('recording');
    expect(existsSync(join(root, 'consent.json'))).toBe(true);
    const stopped = recording.service.stop();
    // The page never says it ended, so the grace period ends the wait.
    await vi.advanceTimersByTimeAsync(5000);
    await stopped;
    expect(recording.service.state().recordingSince).toBeNull();
    rmSync(root, { recursive: true, force: true });
  });
});

describe('stopOnSwitch', () => {
  it('stops the recording only when the account on screen changes', () => {
    const recorder = { stop: vi.fn(() => Promise.resolve()) };
    const set = vi.fn();
    const menu = (active: string) => ({
      entries: [
        { id: 'a', active: active === 'a' },
        { id: 'b', active: active === 'b' },
      ],
    });
    const setMenu = stopOnSwitch(set, recorder);
    setMenu(menu('a'));
    setMenu(menu('a'));
    expect(recorder.stop).not.toHaveBeenCalled();
    setMenu(menu('b'));
    expect(recorder.stop).toHaveBeenCalledOnce();
    expect(set).toHaveBeenCalledTimes(3);
  });
});

describe('lateRecordingGate', () => {
  it('allows nothing until bound, then asks the recorder', () => {
    const late = lateRecordingGate();
    const page = {};
    const frame = {} as WebFrameMain;
    expect(late.gate.recording(page)).toBe(false);
    expect(late.gate.callFrame(page)).toBeUndefined();
    late.bind({ gate: { recording: (contents) => contents === page, callFrame: () => frame } });
    expect(late.gate.recording(page)).toBe(true);
    expect(late.gate.callFrame(page)).toBe(frame);
  });
});
