import { describe, expect, it, vi } from 'vitest';
import type { AssistantBarState } from '../../shared/chrome-api.ts';
import type { ViewRegistry } from '../views.ts';
import type { AssistantBar } from './bar.ts';
import {
  assistantBarFor,
  assistantBarHandlers,
  attachAssistantBar,
  type BarSources,
} from './bar-chrome.ts';

const STATE: AssistantBarState = {
  extension: 'Assistant',
  status: '',
  suggestions: ['On my way'],
  confirm: undefined,
  working: false,
};

function attach(load: () => Promise<unknown> = () => Promise.resolve()) {
  const port = { webContents: { loadURL: vi.fn(load), send: vi.fn() }, setHeight: vi.fn() };
  const views: ViewRegistry = new WeakMap();
  const warn = vi.fn();
  return { port, views, warn, view: attachAssistantBar(port, views, warn) };
}

describe('attachAssistantBar', () => {
  it('registers its page as chrome, loads it on first show only, and hides to no height', () => {
    const t = attach();
    expect(t.views.get(t.port.webContents)).toEqual({
      zone: 'chrome',
      home: 'app://chrome',
      label: 'YapYap',
    });
    t.view.show(false);
    expect(t.port.webContents.loadURL).not.toHaveBeenCalled();
    t.view.show(true);
    t.view.show(true);
    t.view.show(false);
    expect(t.port.setHeight.mock.calls).toEqual([[0], [112], [112], [0]]);
    expect(t.port.webContents.loadURL).toHaveBeenCalledExactlyOnceWith(
      'app://chrome/assistant-bar.html',
    );
  });

  it('sends each state to its page', () => {
    const t = attach();
    t.view.publish(STATE);
    expect(t.port.webContents.send).toHaveBeenCalledExactlyOnceWith(
      'assistant-bar:state-changed',
      STATE,
    );
  });

  it('warns, without the error, when its page does not load', async () => {
    const t = attach(() => Promise.reject(new Error('gone')));
    t.view.show(true);
    await vi.waitFor(() => {
      expect(t.warn).toHaveBeenCalledExactlyOnceWith('Could not load the assistant bar.');
    });
  });
});

function fakeBar(): AssistantBar {
  return {
    state: vi.fn(() => STATE),
    refresh: vi.fn(),
    offer: vi.fn(),
    suggest: vi.fn(() => Promise.resolve()),
    prompt: vi.fn(() => Promise.resolve()),
    confirm: vi.fn(),
    use: vi.fn(() => Promise.resolve()),
    send: vi.fn(() => Promise.resolve()),
  };
}

const CALL = { sender: {} };

describe('assistantBarHandlers', () => {
  const handler = (bar: AssistantBar, channel: string) => {
    const found = assistantBarHandlers(bar).find((entry) => entry.channel === channel);
    if (found === undefined) {
      throw new Error(`no handler for ${channel}`);
    }
    return found;
  };

  it('answers the state and passes the clicks without arguments on', async () => {
    const bar = fakeBar();
    expect(handler(bar, 'assistant-bar:state').handle(CALL)).toBe(STATE);
    await handler(bar, 'assistant-bar:suggest').handle(CALL);
    handler(bar, 'assistant-bar:confirm').handle(CALL);
    expect(bar.suggest).toHaveBeenCalledOnce();
    expect(bar.confirm).toHaveBeenCalledOnce();
    for (const channel of ['state', 'suggest', 'confirm']) {
      const { accepts } = handler(bar, `assistant-bar:${channel}`);
      expect(accepts([])).toBe(true);
      expect(accepts([1])).toBe(false);
    }
  });

  it('takes a trimmed request of reasonable length, and nothing blank', async () => {
    const bar = fakeBar();
    const prompt = handler(bar, 'assistant-bar:prompt');
    expect(prompt.accepts(['  say I am late '])).toBe(true);
    expect(prompt.accepts(['x'.repeat(2000)])).toBe(true);
    for (const args of [[], ['   '], ['x'.repeat(2001)], [3], ['hi', 'there']]) {
      expect(prompt.accepts(args)).toBe(false);
    }
    await prompt.handle(CALL, '  say I am late ');
    expect(bar.prompt).toHaveBeenCalledExactlyOnceWith('say I am late');
  });

  it('uses or sends one of at most five suggestions by index', async () => {
    const bar = fakeBar();
    for (const [channel, act] of [
      ['use', bar.use],
      ['send', bar.send],
    ] as const) {
      const { accepts, handle } = handler(bar, `assistant-bar:${channel}`);
      expect(accepts([0])).toBe(true);
      expect(accepts([4])).toBe(true);
      for (const args of [[], [-1], [5], [1.5], ['1'], [1, 2]]) {
        expect(accepts(args)).toBe(false);
      }
      await handle(CALL, 2);
      expect(act).toHaveBeenCalledExactlyOnceWith(2);
    }
  });
});

function sources(chat: { name: string } | null = { name: 'Alex' }) {
  let changed = (): void => undefined;
  const runtime = {
    assistants: vi.fn(() => [{ id: 'org.example.ai', name: 'Assistant' }]),
    askAssistant: vi.fn(() => true),
    onChange: vi.fn((listener: () => void) => {
      changed = listener;
    }),
  };
  const accounts = {
    readActiveChat: vi.fn(() => Promise.resolve(chat)),
    replaceDraft: vi.fn(() => Promise.resolve(true)),
    pressEnter: vi.fn(() => Promise.resolve(true)),
  };
  const given: BarSources = { runtime, accounts };
  return {
    runtime,
    accounts,
    given,
    change: () => {
      changed();
    },
  };
}

describe('assistantBarFor', () => {
  it('shows nothing until it has a view, then follows the extensions as they change', () => {
    const s = sources();
    const { bar, attach: give } = assistantBarFor(s.given);
    s.change();
    expect(bar.state().extension).toBe('Assistant');
    const view = { show: vi.fn(), publish: vi.fn() };
    give(view);
    expect(view.show).toHaveBeenLastCalledWith(true);
    s.runtime.assistants.mockReturnValue([]);
    s.change();
    expect(view.show).toHaveBeenLastCalledWith(false);
    expect(view.publish).toHaveBeenLastCalledWith(expect.objectContaining({ extension: '' }));
  });

  it('asks the extension about the open chat, read one message deep, and sends through the account', async () => {
    const s = sources();
    const { bar, attach: give } = assistantBarFor(s.given);
    give({ show: vi.fn(), publish: vi.fn() });
    await bar.suggest();
    expect(s.accounts.readActiveChat).toHaveBeenCalledWith(1);
    expect(s.runtime.askAssistant).toHaveBeenCalledWith('org.example.ai', { type: 'suggest' });
    bar.offer('org.example.ai', { suggestions: ['On my way'] });
    await bar.send(0);
    expect(s.accounts.replaceDraft).toHaveBeenCalledWith('On my way');
    expect(s.accounts.pressEnter).toHaveBeenCalledOnce();
  });

  it('tells the user to open a chat when none is', async () => {
    const s = sources(null);
    const { bar } = assistantBarFor(s.given);
    s.change();
    await bar.suggest();
    expect(bar.state().status).toBe('Open a chat first.');
    expect(s.runtime.askAssistant).not.toHaveBeenCalled();
  });
});
