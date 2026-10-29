import type { WebFrameMain } from 'electron';
import { describe, expect, it, vi } from 'vitest';
import {
  createCallRecorder,
  MAX_RECORDING_MS,
  type CallTarget,
  type RecorderDependencies,
} from './recorder.ts';

const STARTED = new Date('2026-10-27T14:05:00.000Z');

function call(): CallTarget & { gone: () => void } {
  let gone = (): void => undefined;
  return {
    contents: {},
    frame: {} as WebFrameMain,
    onGone: (listener) => {
      gone = listener;
    },
    gone: () => {
      gone();
    },
  };
}

function setup(options: { answer?: boolean; consent?: boolean; supported?: boolean } = {}) {
  let current: CallTarget | undefined = call();
  const timers: { ms: number; run: () => void; cancelled: boolean }[] = [];
  const page = { contents: {}, start: vi.fn(), stop: vi.fn() };
  const sink = {
    write: vi.fn(() => Promise.resolve()),
    finish: vi.fn(() => Promise.resolve()),
    abort: vi.fn(() => Promise.resolve()),
  };
  let now = STARTED;
  const deps = {
    supported: options.supported ?? true,
    // Like the real lookup, every call gives a new target for the same window.
    callOf: () => (current === undefined ? undefined : { ...current }),
    ask: vi.fn(() => Promise.resolve(options.answer ?? true)),
    consent: vi.fn(() => Promise.resolve(options.consent ?? true)),
    page: () => page,
    sink: vi.fn(() => Promise.resolve(sink)),
    now: () => now,
    after: vi.fn((ms: number, run: () => void) => {
      const timer = { ms, run, cancelled: false };
      timers.push(timer);
      return () => {
        timer.cancelled = true;
      };
    }),
    onChange: vi.fn(),
    log: vi.fn(),
  } satisfies RecorderDependencies;
  const recorder = createCallRecorder(deps);
  return {
    deps,
    recorder,
    page,
    sink,
    timers,
    call: () => current,
    endCall: () => {
      current = undefined;
    },
    later: (ms: number) => {
      now = new Date(STARTED.getTime() + ms);
    },
  };
}

describe('createCallRecorder', () => {
  it('records only once the user agreed, and lets only the recorder page capture the call', async () => {
    const t = setup();
    const target = t.call();
    expect(t.recorder.gate.recording(t.page.contents)).toBe(false);
    expect(await t.recorder.record('Recorder')).toBe('recording');
    expect(t.deps.ask).toHaveBeenCalledWith('Recorder', target);
    expect(t.deps.sink).toHaveBeenCalledWith(STARTED);
    expect(t.page.start).toHaveBeenCalledOnce();
    expect(t.recorder.gate.recording(t.page.contents)).toBe(true);
    expect(t.recorder.gate.callFrame(t.page.contents)).toBe(target?.frame);
    expect(t.recorder.gate.recording({})).toBe(false);
    expect(t.recorder.gate.callFrame({})).toBeUndefined();
    expect(t.recorder.state()).toEqual({
      supported: true,
      call: true,
      recordingSince: STARTED.toISOString(),
    });
    expect(t.deps.onChange).toHaveBeenLastCalledWith(t.recorder.state());
    expect(t.deps.log).toHaveBeenCalledWith('A call recording started.');
  });

  it('records nothing the user declines, or when they do not confirm the consent warning', async () => {
    const declined = setup({ answer: false });
    expect(await declined.recorder.record('Recorder')).toBe('declined');
    expect(declined.deps.consent).not.toHaveBeenCalled();
    const unconfirmed = setup({ consent: false });
    expect(await unconfirmed.recorder.record('Recorder')).toBe('declined');
    for (const t of [declined, unconfirmed]) {
      expect(t.page.start).not.toHaveBeenCalled();
      expect(t.recorder.state().recordingSince).toBeNull();
    }
  });

  it('offers nothing where it cannot capture a call, and says so', async () => {
    const t = setup({ supported: false });
    expect(await t.recorder.record('Recorder')).toBe('unsupported');
    expect(t.deps.ask).not.toHaveBeenCalled();
    expect(t.recorder.state()).toEqual({ supported: false, call: true, recordingSince: null });
  });

  it('says when there is no call, or when it ended while the user decided', async () => {
    const t = setup();
    t.endCall();
    expect(await t.recorder.record('Recorder')).toBe('no-call');
    expect(t.recorder.state()).toEqual({ supported: true, call: false, recordingSince: null });
    const late = setup();
    late.deps.ask.mockImplementationOnce(() => {
      late.endCall();
      return Promise.resolve(true);
    });
    expect(await late.recorder.record('Recorder')).toBe('no-call');
    expect(late.page.start).not.toHaveBeenCalled();
  });

  it('asks one question at a time, and says a running recording is already recording', async () => {
    const t = setup();
    let answer: (yes: boolean) => void = () => undefined;
    t.deps.ask.mockImplementationOnce(
      () =>
        new Promise<boolean>((resolve) => {
          answer = resolve;
        }),
    );
    const first = t.recorder.record('Recorder');
    expect(await t.recorder.record('Other')).toBe('declined');
    answer(true);
    expect(await first).toBe('recording');
    expect(await t.recorder.record('Other')).toBe('recording');
    expect(t.deps.ask).toHaveBeenCalledOnce();
  });

  it('writes the page’s sound in order, keeps the file when stopped, and ignores other pages', async () => {
    const t = setup();
    await t.recorder.record('Recorder');
    t.recorder.chunk(t.page.contents, new Uint8Array([1]));
    t.recorder.chunk({}, new Uint8Array([9]));
    t.recorder.chunk(t.page.contents, new Uint8Array([2]));
    t.later(65_000);
    const stopped = t.recorder.stop();
    expect(t.page.stop).toHaveBeenCalledOnce();
    t.recorder.chunk(t.page.contents, new Uint8Array([3]));
    t.recorder.ended({});
    t.recorder.ended(t.page.contents);
    await stopped;
    expect(t.sink.write.mock.calls).toEqual([
      [new Uint8Array([1])],
      [new Uint8Array([2])],
      [new Uint8Array([3])],
    ]);
    expect(t.sink.finish).toHaveBeenCalledExactlyOnceWith(65_000);
    expect(t.recorder.gate.recording(t.page.contents)).toBe(false);
    expect(t.deps.onChange).toHaveBeenLastCalledWith({
      supported: true,
      call: true,
      recordingSince: null,
    });
    expect(t.deps.log).toHaveBeenLastCalledWith('A call recording stopped.');
    await t.recorder.stop();
    expect(t.sink.finish).toHaveBeenCalledOnce();
  });

  it('stops when the call window goes, after four hours, and without waiting forever for the page', async () => {
    const t = setup();
    await t.recorder.record('Recorder');
    expect(t.timers[0]?.ms).toBe(MAX_RECORDING_MS);
    const gone = setup();
    await gone.recorder.record('Recorder');
    gone.recorder.chunk(gone.page.contents, new Uint8Array([1]));
    (gone.call() as ReturnType<typeof call>).gone();
    expect(gone.page.stop).toHaveBeenCalledOnce();
    gone.timers.find(({ ms }) => ms === 5000)?.run();
    await vi.waitFor(() => {
      expect(gone.sink.finish).toHaveBeenCalledOnce();
    });
    expect(gone.timers[0]?.cancelled).toBe(true);
    const long = setup();
    await long.recorder.record('Recorder');
    long.timers[0]?.run();
    expect(long.page.stop).toHaveBeenCalledOnce();
  });

  it('keeps no file when the page never sent any sound', async () => {
    const t = setup();
    await t.recorder.record('Recorder');
    const stopped = t.recorder.stop();
    t.timers.find(({ ms }) => ms === 5000)?.run();
    await stopped;
    expect(t.sink.abort).toHaveBeenCalledOnce();
    expect(t.sink.finish).not.toHaveBeenCalled();
    expect(t.recorder.state().recordingSince).toBeNull();
    expect(t.deps.log).toHaveBeenLastCalledWith(
      'A call recording could not capture the call, so nothing was kept.',
    );
  });

  it('throws the recording away when the page cannot capture, and only for its own page', async () => {
    const t = setup();
    await t.recorder.record('Recorder');
    t.recorder.chunk(t.page.contents, new Uint8Array([1]));
    t.recorder.failed({});
    expect(t.recorder.state().recordingSince).not.toBeNull();
    t.recorder.failed(t.page.contents);
    await vi.waitFor(() => {
      expect(t.sink.abort).toHaveBeenCalledOnce();
    });
    expect(t.sink.finish).not.toHaveBeenCalled();
    expect(t.timers[0]?.cancelled).toBe(true);
    expect(t.recorder.state().recordingSince).toBeNull();
    expect(t.deps.log).toHaveBeenLastCalledWith(
      'A call recording could not capture the call, so nothing was kept.',
    );
  });
});
