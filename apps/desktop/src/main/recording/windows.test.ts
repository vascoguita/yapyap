import type { WebFrameMain } from 'electron';
import { describe, expect, it, vi } from 'vitest';
import type { ViewRegistry } from '../views.ts';
import { recordingWindows } from './windows.ts';

function fakeWindow(load: () => Promise<unknown> = () => Promise.resolve()) {
  const listeners = new Map<string, () => void>();
  return {
    webContents: { send: vi.fn() },
    isDestroyed: vi.fn(() => false),
    focus: vi.fn(),
    once: vi.fn((event: string, listener: () => void) => {
      listeners.set(event, listener);
    }),
    close: vi.fn(),
    show: vi.fn(),
    loadURL: vi.fn(load),
    fire: (event: string) => listeners.get(event)?.(),
  };
}

function setup(load?: () => Promise<unknown>, parent: object | null = {}) {
  const created: { options: object; window: ReturnType<typeof fakeWindow> }[] = [];
  const views: ViewRegistry = new WeakMap();
  const warn = vi.fn();
  const windowOf = vi.fn(() => parent as never);
  const opened = recordingWindows(
    {
      createWindow: (options) => {
        const window = fakeWindow(load);
        created.push({ options, window });
        return window;
      },
      views,
      warn,
    },
    windowOf,
  );
  return { opened, created, views, warn, windowOf };
}

const CALL = { contents: {}, frame: {} as WebFrameMain, onGone: vi.fn() };

describe('recordingWindows', () => {
  it('opens the recorder page hidden and never shown, as a chrome page', async () => {
    const t = setup();
    const page = t.opened.openRecorder();
    const [{ options, window }] = t.created as [(typeof t.created)[number]];
    expect(options).toEqual({
      show: false,
      skipTaskbar: true,
      focusable: false,
      width: 1,
      height: 1,
    });
    expect(window.loadURL).toHaveBeenCalledWith('app://chrome/recorder.html');
    expect(t.views.get(window.webContents)).toEqual({
      zone: 'chrome',
      home: 'app://chrome',
      label: 'YapYap',
    });
    await page.loaded;
    expect(window.show).not.toHaveBeenCalled();
    page.close();
    expect(window.close).toHaveBeenCalledOnce();
    window.isDestroyed.mockReturnValue(true);
    page.close();
    expect(window.close).toHaveBeenCalledOnce();
    const closed = vi.fn();
    page.onClosed(closed);
    window.fire('closed');
    expect(closed).toHaveBeenCalledOnce();
  });

  it('warns, without failing, when the recorder page does not load', async () => {
    const t = setup(() => Promise.reject(new Error('gone')));
    await t.opened.openRecorder().loaded;
    expect(t.warn).toHaveBeenCalledExactlyOnceWith('Could not load the call recorder.');
  });

  it('opens the prompt attached to the call window, loaded once it shows', async () => {
    const t = setup();
    const prompt = t.opened.openPrompt(CALL);
    expect(t.windowOf).toHaveBeenCalledWith(CALL.contents);
    const [{ options, window }] = t.created as [(typeof t.created)[number]];
    expect(options).toEqual(
      expect.objectContaining({ title: 'Call recording', parent: expect.anything() as object }),
    );
    expect(window.loadURL).toHaveBeenCalledWith('app://chrome/record-prompt.html');
    window.fire('ready-to-show');
    await prompt.loaded;
    const orphan = setup(undefined, null);
    orphan.opened.openPrompt(CALL);
    expect(orphan.created[0]?.options).not.toHaveProperty('parent');
  });
});
