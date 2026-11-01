import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { WebFrameMain } from 'electron';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRecording, type RecordingDependencies, type RecordingWindow } from './chrome.ts';
import type { RecordingFormat } from '../../shared/chrome-api.ts';
import type { CallTarget } from './recorder.ts';

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'yapyap-recording-'));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

/** The item at `index`, which the test expects to be there. */
function at<T>(list: readonly T[], index: number): T {
  const item = list[index];
  if (item === undefined) {
    throw new Error(`Nothing at ${String(index)}.`);
  }
  return item;
}

/** A window; `deferred` ones finish closing only when the test says, as Electron's do. */
function fakeWindow(deferred = false) {
  let closed = (): void => undefined;
  const window = {
    webContents: { send: vi.fn() },
    loaded: Promise.resolve(),
    finishClosing: () => {
      closed();
    },
    close: vi.fn(() => {
      if (!deferred) {
        closed();
      }
    }),
    onClosed: vi.fn((listener: () => void) => {
      closed = listener;
    }),
  } satisfies RecordingWindow & { finishClosing: () => void };
  return window;
}

function setup(options: { consent?: boolean; deferred?: boolean } = {}) {
  const call: CallTarget = { contents: {}, frame: {} as WebFrameMain, onGone: vi.fn() };
  const prompts: ReturnType<typeof fakeWindow>[] = [];
  const pages: ReturnType<typeof fakeWindow>[] = [];
  const deps = {
    supported: true,
    format: vi.fn((): RecordingFormat => 'webm'),
    paths: { folder: join(root, 'Calls'), index: join(root, 'recordings.json') },
    callOf: vi.fn((): CallTarget | undefined => call),
    openRecorder: vi.fn(() => {
      const page = fakeWindow();
      pages.push(page);
      return page;
    }),
    openPrompt: vi.fn(() => {
      const prompt = fakeWindow(options.deferred);
      prompts.push(prompt);
      return prompt;
    }),
    consent: {
      confirmed: vi.fn(() => Promise.resolve(options.consent ?? true)),
      confirm: vi.fn(),
    },
    show: vi.fn(),
    now: () => new Date(2026, 9, 27, 14, 5),
    after: vi.fn(() => () => undefined),
    log: vi.fn(),
  } satisfies RecordingDependencies;
  const recording = createRecording(deps);
  const handler = (channel: string) => {
    const found = recording.handlers.find((entry) => entry.channel === channel);
    if (found === undefined) {
      throw new Error(`no handler for ${channel}`);
    }
    return found;
  };
  const from = (sender: object) => ({ sender });
  return { deps, recording, handler, from, prompts, pages, call };
}

describe('createRecording', () => {
  it('asks in a window by the call, records on Record, and shows it recording', async () => {
    const t = setup();
    const asked = t.recording.service.record('Recorder');
    await vi.waitFor(() => {
      expect(t.prompts).toHaveLength(1);
    });
    const prompt = at(t.prompts, 0);
    expect(t.deps.openPrompt).toHaveBeenCalledWith(t.call, false);
    const state = t.handler('record-prompt:state');
    expect(state.handle(t.from(prompt.webContents))).toEqual({
      extension: 'Recorder',
      phase: 'asking',
      since: null,
      consent: false,
    });
    const answer = t.handler('record-prompt:answer');
    expect(answer.accepts([true, false])).toBe(true);
    for (const args of [[true], ['yes', false], [true, 1], [true, true, true]]) {
      expect(answer.accepts(args)).toBe(false);
    }
    answer.handle(t.from(prompt.webContents), true, false);
    expect(await asked).toBe('recording');
    expect(t.deps.consent.confirm).not.toHaveBeenCalled();
    const page = at(t.pages, 0);
    await vi.waitFor(() => {
      expect(page.webContents.send).toHaveBeenCalledWith('recorder:command', 'start');
    });
    expect(prompt.webContents.send).toHaveBeenLastCalledWith('record-prompt:state-changed', {
      extension: 'Recorder',
      phase: 'recording',
      since: new Date(2026, 9, 27, 14, 5).toISOString(),
      consent: false,
    });
    expect(prompt.close).not.toHaveBeenCalled();
  });

  it('records nothing on Cancel, or when the window is closed instead', async () => {
    const t = setup();
    const declined = t.recording.service.record('Recorder');
    await vi.waitFor(() => {
      expect(t.prompts).toHaveLength(1);
    });
    t.handler('record-prompt:answer').handle(t.from(t.prompts[0]?.webContents ?? {}), false, false);
    expect(await declined).toBe('declined');
    expect(t.prompts[0]?.close).toHaveBeenCalledOnce();
    const closed = t.recording.service.record('Recorder');
    await vi.waitFor(() => {
      expect(t.prompts).toHaveLength(2);
    });
    t.prompts[1]?.close();
    expect(await closed).toBe('declined');
    expect(t.deps.openRecorder).not.toHaveBeenCalled();
  });

  it('answers only the prompt window, which can also stop the recording', async () => {
    const t = setup();
    expect(() => t.handler('record-prompt:state').handle(t.from({}))).toThrow(
      'No call recording belongs to this window.',
    );
    const asked = t.recording.service.record('Recorder');
    await vi.waitFor(() => {
      expect(t.prompts).toHaveLength(1);
    });
    const prompt = at(t.prompts, 0);
    expect(() => t.handler('record-prompt:stop').handle(t.from({}))).toThrow();
    t.handler('record-prompt:answer').handle(t.from(prompt.webContents), true, false);
    await asked;
    const page = at(t.pages, 0);
    t.handler('recorder:chunk').handle(t.from(page.webContents), new Uint8Array([1]));
    const stopped = t.handler('record-prompt:stop').handle(t.from(prompt.webContents));
    await vi.waitFor(() => {
      expect(page.webContents.send).toHaveBeenCalledWith('recorder:command', 'stop');
    });
    t.handler('recorder:ended').handle(t.from(page.webContents));
    await stopped;
    expect(prompt.webContents.send).toHaveBeenLastCalledWith(
      'record-prompt:state-changed',
      expect.objectContaining({ phase: 'ended' }),
    );
    expect(await t.recording.service.recordings()).toHaveLength(1);
  });

  it('records as WAV when Settings says so, and completes the header at the end', async () => {
    const t = setup();
    t.deps.format.mockReturnValue('wav');
    const asked = t.recording.service.record('Recorder');
    await vi.waitFor(() => {
      expect(t.prompts).toHaveLength(1);
    });
    const prompt = at(t.prompts, 0);
    t.handler('record-prompt:answer').handle(t.from(prompt.webContents), true, false);
    await asked;
    const page = at(t.pages, 0);
    await vi.waitFor(() => {
      expect(page.webContents.send).toHaveBeenCalledWith('recorder:command', 'start-wav');
    });
    // A header with zero sizes and four bytes of sound, as the page streams it.
    const header = new Uint8Array(44);
    header.set(new TextEncoder().encode('RIFF'), 0);
    t.handler('recorder:chunk').handle(t.from(page.webContents), header);
    t.handler('recorder:chunk').handle(t.from(page.webContents), new Uint8Array([1, 2, 3, 4]));
    const stopped = t.handler('record-prompt:stop').handle(t.from(prompt.webContents));
    await vi.waitFor(() => {
      expect(page.webContents.send).toHaveBeenCalledWith('recorder:command', 'stop');
    });
    t.handler('recorder:ended').handle(t.from(page.webContents));
    await stopped;
    const [file] = readdirSync(t.deps.paths.folder);
    expect(file).toMatch(/^YapYap call .+\.wav$/);
    const bytes = readFileSync(join(t.deps.paths.folder, file ?? ''));
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.length);
    expect([view.getUint32(4, true), view.getUint32(40, true)]).toEqual([40, 4]);
  });

  it('takes sound only in bounded chunks, and reuses the recorder page until it closes', async () => {
    const t = setup();
    const chunk = t.handler('recorder:chunk');
    expect(chunk.accepts([new Uint8Array(1_048_576)])).toBe(true);
    for (const args of [[new Uint8Array(1_048_577)], ['bytes'], [], [new Uint8Array(1), 2]]) {
      expect(chunk.accepts(args)).toBe(false);
    }
    expect(t.handler('recorder:ended').accepts([])).toBe(true);
    for (let round = 0; round < 2; round += 1) {
      const asked = t.recording.service.record('Recorder');
      await vi.waitFor(() => {
        expect(t.prompts).toHaveLength(round + 1);
      });
      t.handler('record-prompt:answer').handle(
        t.from(t.prompts[round]?.webContents ?? {}),
        true,
        false,
      );
      await asked;
      const page = at(t.pages, 0);
      chunk.handle(t.from(page.webContents), new Uint8Array([round]));
      const stopped = t.recording.service.stop();
      t.handler('recorder:ended').handle(t.from(page.webContents));
      await stopped;
    }
    expect(t.deps.openRecorder).toHaveBeenCalledOnce();
    t.pages[0]?.close();
    const asked = t.recording.service.record('Recorder');
    await vi.waitFor(() => {
      expect(t.prompts).toHaveLength(3);
    });
    t.handler('record-prompt:answer').handle(t.from(t.prompts[2]?.webContents ?? {}), true, false);
    await asked;
    expect(t.deps.openRecorder).toHaveBeenCalledTimes(2);
  });

  it('throws a failed capture away, and reveals only known recordings', async () => {
    const t = setup();
    const asked = t.recording.service.record('Recorder');
    await vi.waitFor(() => {
      expect(t.prompts).toHaveLength(1);
    });
    t.handler('record-prompt:answer').handle(t.from(t.prompts[0]?.webContents ?? {}), true, false);
    await asked;
    t.handler('recorder:failed').handle(t.from(t.pages[0]?.webContents ?? {}));
    expect(t.recording.service.state().recordingSince).toBeNull();
    expect(await t.recording.service.recordings()).toEqual([]);
    expect(await t.recording.service.reveal('f'.repeat(32))).toBe(false);
  });

  it('asks for the consent warning until confirmed, and records only once its box is ticked', async () => {
    const t = setup({ consent: false });
    const first = t.recording.service.record('Recorder');
    await vi.waitFor(() => {
      expect(t.prompts).toHaveLength(1);
    });
    const prompt = at(t.prompts, 0).webContents;
    expect(t.deps.openPrompt).toHaveBeenCalledWith(t.call, true);
    expect(t.handler('record-prompt:state').handle(t.from(prompt))).toHaveProperty('consent', true);
    const answer = t.handler('record-prompt:answer');
    // A page that sends Record without the tick gets nothing recorded, and can still answer.
    expect(() => answer.handle(t.from(prompt), true, false)).toThrow(
      'Recording needs the consent warning confirmed.',
    );
    expect(t.deps.consent.confirm).not.toHaveBeenCalled();
    expect(t.deps.openRecorder).not.toHaveBeenCalled();
    answer.handle(t.from(prompt), true, true);
    expect(await first).toBe('recording');
    expect(t.deps.consent.confirm).toHaveBeenCalledOnce();
  });

  it('keeps no consent the user did not give, and finds no call once it ended', async () => {
    const t = setup({ consent: false });
    const first = t.recording.service.record('Recorder');
    await vi.waitFor(() => {
      expect(t.prompts).toHaveLength(1);
    });
    t.handler('record-prompt:answer').handle(t.from(at(t.prompts, 0).webContents), false, true);
    expect(await first).toBe('declined');
    expect(t.deps.consent.confirm).not.toHaveBeenCalled();
    t.deps.callOf.mockReturnValue(undefined);
    expect(await t.recording.service.record('Recorder')).toBe('no-call');
    expect(t.recording.service.state().call).toBe(false);
  });
});

describe('createRecording, as Electron closes windows', () => {
  it('keeps the newest prompt when an older one finishes closing, and records with none open', async () => {
    const t = setup({ deferred: true });
    const first = t.recording.service.record('Recorder');
    await vi.waitFor(() => {
      expect(t.prompts).toHaveLength(1);
    });
    t.handler('record-prompt:answer').handle(t.from(at(t.prompts, 0).webContents), true, false);
    await first;
    const page = at(t.pages, 0);
    // The user closes the window by the call; the recording keeps going until stopped.
    at(t.prompts, 0).finishClosing();
    const stopped = t.recording.service.stop();
    t.handler('recorder:ended').handle(t.from(page.webContents));
    await stopped;
    const second = t.recording.service.record('Recorder');
    await vi.waitFor(() => {
      expect(t.prompts).toHaveLength(2);
    });
    at(t.prompts, 0).finishClosing();
    expect(t.handler('record-prompt:state').handle(t.from(at(t.prompts, 1).webContents))).toEqual(
      expect.objectContaining({ phase: 'asking' }),
    );
    t.handler('record-prompt:answer').handle(t.from(at(t.prompts, 1).webContents), false, false);
    expect(await second).toBe('declined');
  });
});
