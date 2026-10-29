import type { WebFrameMain } from 'electron';
import { describe, expect, it, vi } from 'vitest';
import type { ViewRegistry } from '../views.ts';
import { askRecordingConsent, callWindowAmong, type CallContents } from './electron.ts';

function contents(destroyed = false) {
  return {
    mainFrame: {} as WebFrameMain,
    isDestroyed: () => destroyed,
    once: vi.fn(),
  } satisfies CallContents;
}

describe('callWindowAmong', () => {
  it('finds the call window of the account on screen, and only a live one', () => {
    const views: ViewRegistry = new WeakMap();
    const main = contents();
    const other = contents();
    const gone = contents(true);
    const call = contents();
    const chrome = contents();
    views.set(main, {
      zone: 'whatsapp',
      home: 'https://web.whatsapp.com',
      label: 'Home',
      account: 'a',
    });
    views.set(other, {
      zone: 'whatsapp',
      home: 'https://web.whatsapp.com',
      label: 'Work',
      account: 'b',
    });
    views.set(gone, {
      zone: 'whatsapp',
      home: 'https://web.whatsapp.com',
      label: 'Home',
      account: 'a',
    });
    views.set(call, {
      zone: 'whatsapp',
      home: 'https://web.whatsapp.com',
      label: 'Home',
      account: 'a',
    });
    views.set(chrome, { zone: 'chrome', home: 'app://chrome', label: 'YapYap' });
    const found = callWindowAmong([main, other, gone, chrome, call], main, views);
    expect(found?.contents).toBe(call);
    expect(found?.frame).toBe(call.mainFrame);
    const listener = vi.fn();
    found?.onGone(listener);
    expect(call.once).toHaveBeenCalledWith('destroyed', listener);
    expect(callWindowAmong([main, other, chrome], main, views)).toBeUndefined();
    expect(callWindowAmong([main, chrome], chrome, views)).toBeUndefined();
  });
});

describe('askRecordingConsent', () => {
  it('confirms only when the user ticks the box and chooses Record', async () => {
    const show = vi.fn(() => Promise.resolve({ response: 0, checkboxChecked: true }));
    expect(await askRecordingConsent(show)).toBe(true);
    expect(show).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'warning',
        message: 'Before you record calls',
        buttons: ['Record', 'Cancel'],
        defaultId: 1,
        cancelId: 1,
      }),
    );
    for (const answer of [
      { response: 0, checkboxChecked: false },
      { response: 1, checkboxChecked: true },
    ]) {
      expect(await askRecordingConsent(() => Promise.resolve(answer))).toBe(false);
    }
  });
});
