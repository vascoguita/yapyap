import { describe, expect, it, vi } from 'vitest';
import type { ChromeHandler } from '../chrome/ipc.ts';
import { createSourcePicker, type DesktopSource, type PickerWindow } from './picker.ts';

const source = (id: string, name: string): DesktopSource => ({
  id,
  name,
  thumbnail: { toDataURL: () => `data:image/png;base64,${name}` },
});

const SCREEN = source('screen:1:0', 'Entire screen');
const WINDOW = source('window:42:0', 'Notes');

function fakeWindow() {
  let closed: () => void = () => undefined;
  const window = {
    webContents: {},
    close: vi.fn(() => {
      closed();
    }),
    onClosed: vi.fn((listener: () => void) => {
      closed = listener;
    }),
    /** Closed by the user or the OS, not by the picker. */
    closeFromOutside: () => {
      closed();
    },
  } satisfies PickerWindow & { closeFromOutside: () => void };
  return window;
}

function setup(offerAudio = false) {
  const windows = [fakeWindow(), fakeWindow()];
  const openPicker = vi
    .fn<(owner: object) => PickerWindow>()
    .mockReturnValueOnce(windows[0] as PickerWindow)
    .mockReturnValueOnce(windows[1] as PickerWindow);
  const getSources = vi.fn<() => Promise<readonly DesktopSource[]>>(() =>
    Promise.resolve([SCREEN, WINDOW]),
  );
  const wait = vi.fn(() => Promise.resolve());
  const picker = createSourcePicker({ getSources, openPicker, offerAudio, wait });
  const handler = (channel: string): ChromeHandler => {
    const found = picker.handlers.find((candidate) => candidate.channel === channel);
    if (found === undefined) throw new Error(channel);
    return found;
  };
  const [first] = windows;
  const from = (window = first) => ({ sender: window?.webContents ?? {} });
  return { picker, windows, openPicker, getSources, wait, handler, from };
}

const settle = () => new Promise((resolve) => setTimeout(resolve));

describe('createSourcePicker', () => {
  it('offers every screen and window with a preview, and nothing preselected', async () => {
    const t = setup();
    const owner = {};
    void t.picker.pick(owner);
    await settle();
    expect(t.openPicker).toHaveBeenCalledExactlyOnceWith(owner);
    expect(t.handler('picker:offer').handle(t.from())).toEqual({
      sources: [
        {
          id: 'screen:1:0',
          name: 'Entire screen',
          kind: 'screen',
          thumbnail: 'data:image/png;base64,Entire screen',
        },
        {
          id: 'window:42:0',
          name: 'Notes',
          kind: 'window',
          thumbnail: 'data:image/png;base64,Notes',
        },
      ],
      offerAudio: false,
    });
  });

  it('shares the chosen source and closes the picker', async () => {
    const t = setup();
    const choice = t.picker.pick({});
    await settle();
    t.handler('picker:choose').handle(t.from(), 'window:42:0', true);
    expect(await choice).toEqual({ video: WINDOW });
    expect(t.windows[0]?.close).toHaveBeenCalledOnce();
  });

  it('adds system audio only where it is offered and the user opted in', async () => {
    const t = setup(true);
    const withAudio = t.picker.pick({});
    await settle();
    expect(t.handler('picker:offer').handle(t.from())).toEqual(
      expect.objectContaining({ offerAudio: true }),
    );
    t.handler('picker:choose').handle(t.from(), 'screen:1:0', true);
    expect(await withAudio).toEqual({ video: SCREEN, audio: 'loopback' });
    const withoutAudio = t.picker.pick({});
    await settle();
    t.handler('picker:choose').handle(t.from(t.windows[1]), 'screen:1:0', false);
    expect(await withoutAudio).toEqual({ video: SCREEN });
  });

  it('denies when the user cancels or closes the picker', async () => {
    const t = setup();
    const cancelled = t.picker.pick({});
    await settle();
    t.handler('picker:cancel').handle(t.from());
    expect(await cancelled).toBeUndefined();
    expect(t.windows[0]?.close).toHaveBeenCalledOnce();
    const closed = t.picker.pick({});
    await settle();
    t.windows[1]?.close();
    expect(await closed).toBeUndefined();
  });

  it('denies when the window is closed from outside, without closing it again', async () => {
    const t = setup();
    const pending = t.picker.pick({});
    await settle();
    t.windows[0]?.closeFromOutside();
    expect(await pending).toBeUndefined();
    expect(t.windows[0]?.close).not.toHaveBeenCalled();
  });

  it('asks again briefly when the system lists no sources at first', async () => {
    const t = setup();
    t.getSources.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    void t.picker.pick({});
    await settle();
    expect(t.getSources).toHaveBeenCalledTimes(3);
    expect(t.wait.mock.calls).toEqual([[200], [400]]);
    const offer = t.handler('picker:offer').handle(t.from()) as { sources: unknown[] };
    expect(offer.sources).toHaveLength(2);
  });

  it('offers an empty list after five empty answers, backing off between them', async () => {
    const t = setup();
    t.getSources.mockResolvedValue([]);
    void t.picker.pick({});
    await settle();
    expect(t.getSources).toHaveBeenCalledTimes(5);
    expect(t.wait.mock.calls).toEqual([[200], [400], [800], [1600]]);
    expect(t.handler('picker:offer').handle(t.from())).toEqual({ sources: [], offerAudio: false });
  });

  it('denies a second request while a picker is open', async () => {
    const t = setup();
    void t.picker.pick({});
    await settle();
    expect(await t.picker.pick({})).toBeUndefined();
    expect(t.openPicker).toHaveBeenCalledOnce();
  });

  it('answers only the picker window of the pending request', async () => {
    const t = setup();
    expect(() => t.handler('picker:offer').handle(t.from())).toThrow(
      'No picker belongs to this window.',
    );
    void t.picker.pick({});
    await settle();
    expect(() => t.handler('picker:cancel').handle({ sender: {} })).toThrow(
      'No picker belongs to this window.',
    );
  });

  it('refuses a source it did not offer', async () => {
    const t = setup();
    const pending = t.picker.pick({});
    await settle();
    expect(() => t.handler('picker:choose').handle(t.from(), 'screen:9:0', false)).toThrow(
      'That source was not offered.',
    );
    t.handler('picker:cancel').handle(t.from());
    expect(await pending).toBeUndefined();
  });

  it('accepts a choice only as a source ID and an audio flag', () => {
    const accepts = setup().handler('picker:choose').accepts;
    expect(accepts(['screen:1:0', false])).toBe(true);
    expect(accepts(['screen:1:0'])).toBe(false);
    expect(accepts(['screen:1:0', 'yes'])).toBe(false);
    expect(accepts([1, false])).toBe(false);
    expect(accepts(['screen:1:0', false, 1])).toBe(false);
    const t = setup();
    expect(t.handler('picker:offer').accepts([])).toBe(true);
    expect(t.handler('picker:offer').accepts([1])).toBe(false);
    expect(t.handler('picker:cancel').accepts([1])).toBe(false);
  });
});
