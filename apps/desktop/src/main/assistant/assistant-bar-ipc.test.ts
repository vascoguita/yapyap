import { describe, expect, it, vi } from 'vitest';
import type { ViewRegistry } from '../security/views.ts';
import { listenToAssistantBar } from './assistant-bar-ipc.ts';

const ORIGIN = 'https://web.whatsapp.com';

function setup() {
  const listeners = new Map<string, (event: unknown, ...args: unknown[]) => void>();
  const ipc = {
    on: vi.fn((channel: string, listener: (event: never, ...args: unknown[]) => void) => {
      listeners.set(channel, listener as (event: unknown, ...args: unknown[]) => void);
    }),
  };
  const bar = {
    polish: vi.fn(() => Promise.resolve()),
    use: vi.fn(() => Promise.resolve()),
    dismiss: vi.fn(),
    button: vi.fn(() => Promise.resolve()),
  };
  const openSettings = vi.fn();
  const active = {};
  const views: ViewRegistry = new WeakMap();
  views.set(active, { zone: 'whatsapp', home: ORIGIN, label: 'Home', account: 'a' });
  const warn = vi.fn();
  let page: object = active;
  listenToAssistantBar(ipc, bar, {
    views,
    origin: ORIGIN,
    activePage: () => page,
    openSettings,
    warn,
  });
  const fromBar = { sender: active, senderFrame: { url: `${ORIGIN}/` } };
  const hear = async (channel: string, event: object, ...args: unknown[]): Promise<void> => {
    listeners.get(`whatsapp:assistant-bar-${channel}`)?.(event, ...args);
    // Each action runs after a resolved promise, so let it.
    await Promise.resolve();
  };
  return {
    ipc,
    bar,
    openSettings,
    views,
    warn,
    fromBar,
    hear,
    switchTo: (other: object) => {
      page = other;
    },
  };
}

describe('listenToAssistantBar', () => {
  it('passes each of the assistant’s actions on', async () => {
    const t = setup();
    await t.hear('polish', t.fromBar, 'soften');
    await t.hear('use', t.fromBar, 0);
    await t.hear('dismiss', t.fromBar);
    await t.hear('button', t.fromBar, 'undo');
    await t.hear('settings', t.fromBar);
    expect(t.bar.polish).toHaveBeenCalledExactlyOnceWith('soften');
    expect(t.bar.use).toHaveBeenCalledExactlyOnceWith(0);
    expect(t.bar.dismiss).toHaveBeenCalledOnce();
    expect(t.bar.button).toHaveBeenCalledExactlyOnceWith('undo');
    expect(t.openSettings).toHaveBeenCalledOnce();
    expect(t.warn).not.toHaveBeenCalled();
  });

  it('hears only the active account’s WhatsApp view, on WhatsApp’s origin', async () => {
    const t = setup();
    const call = {};
    t.views.set(call, { zone: 'whatsapp', home: ORIGIN, label: 'Home', account: 'a' });
    const chrome = {};
    t.views.set(chrome, { zone: 'chrome', home: 'app://chrome', label: 'YapYap' });
    await t.hear('use', { ...t.fromBar, sender: call }, 0);
    await t.hear('use', { ...t.fromBar, sender: {} }, 0);
    await t.hear('use', { ...t.fromBar, senderFrame: { url: 'https://example.com/' } }, 0);
    await t.hear('use', { ...t.fromBar, senderFrame: null }, 0);
    t.switchTo(chrome);
    await t.hear('use', { ...t.fromBar, sender: chrome }, 0);
    t.switchTo(call);
    await t.hear('use', t.fromBar, 0);
    expect(t.bar.use).not.toHaveBeenCalled();
    expect(t.warn).toHaveBeenCalledTimes(6);
    expect(t.warn).toHaveBeenCalledWith('Ignored an assistant bar message from outside the bar.');
  });

  it('takes only the rewrite button’s ways, one of at most five suggestions, and its buttons', async () => {
    const t = setup();
    for (const args of [[], [-1], [5], [1.5], ['1'], [1, 2]]) {
      await t.hear('use', t.fromBar, ...args);
    }
    for (const args of [[], ['friendlier'], ['translate:pt'], [7], ['polish', 'twice']]) {
      await t.hear('polish', t.fromBar, ...args);
    }
    for (const args of [[], ['press'], ['allow'], ['undo', 'twice']]) {
      await t.hear('button', t.fromBar, ...args);
    }
    await t.hear('dismiss', t.fromBar, 1);
    await t.hear('settings', t.fromBar, 'now');
    expect(t.bar.use).not.toHaveBeenCalled();
    expect(t.bar.polish).not.toHaveBeenCalled();
    expect(t.bar.button).not.toHaveBeenCalled();
    expect(t.bar.dismiss).not.toHaveBeenCalled();
    expect(t.openSettings).not.toHaveBeenCalled();
    expect(t.warn).toHaveBeenCalledTimes(17);
  });

  it('warns, without the error, when an action fails', async () => {
    const t = setup();
    t.bar.use.mockRejectedValueOnce(new Error('Your message is: hi'));
    await t.hear('use', t.fromBar, 0);
    await vi.waitFor(() => {
      expect(t.warn).toHaveBeenCalledExactlyOnceWith('An assistant bar action failed.');
    });
  });
});
