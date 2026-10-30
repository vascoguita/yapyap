import { describe, expect, it, vi } from 'vitest';
import type { AssistantBarState } from '../../shared/assistant-bar-api.ts';
import { createAssistantBar, type AssistantBarDependencies } from './bar.ts';

const TEXTS = {
  noChat: 'Open a chat first.',
  chatChanged: 'The chat changed.',
  thinking: 'Thinking…',
};

function setup(extensions = [{ id: 'org.example.ai', name: 'AI' }]) {
  let chat: string | null = 'Ana';
  let states: AssistantBarState[] = [];
  const deps = {
    extensions: vi.fn(() => extensions),
    ask: vi.fn(() => true),
    chatName: vi.fn(() => Promise.resolve(chat)),
    replaceDraft: vi.fn(() => Promise.resolve(true)),
    pressEnter: vi.fn(() => Promise.resolve()),
    show: vi.fn(),
    publish: vi.fn((state: AssistantBarState) => {
      states = [...states, state];
    }),
  } satisfies AssistantBarDependencies;
  const bar = createAssistantBar(deps, TEXTS);
  bar.refresh();
  return {
    bar,
    deps,
    last: () => states.at(-1),
    openChat: (name: string | null) => {
      chat = name;
    },
  };
}

describe('createAssistantBar', () => {
  it('shows for the first extension that may fill it, and hides without one', () => {
    const t = setup();
    expect(t.deps.show).toHaveBeenLastCalledWith(true);
    expect(t.bar.state()).toEqual({
      extension: 'AI',
      status: '',
      suggestions: [],
      confirm: undefined,
      working: false,
      choice: undefined,
    });
    t.bar.refresh();
    expect(t.deps.publish).toHaveBeenCalledOnce();
    const none = setup([]);
    expect(none.deps.show).toHaveBeenLastCalledWith(false);
    expect(none.bar.state().extension).toBe('');
  });

  it('asks its extension for suggestions in the open chat, and shows only that extension’s offers', async () => {
    const t = setup();
    await t.bar.suggest();
    expect(t.deps.ask).toHaveBeenCalledWith('org.example.ai', { type: 'suggest' });
    expect(t.last()).toMatchObject({ status: 'Thinking…', working: true });
    t.bar.offer('org.example.other', { suggestions: ['Not mine'] });
    expect(t.bar.state().suggestions).toEqual([]);
    t.bar.offer('org.example.ai', { suggestions: ['Yes!', 'Maybe'], status: 'Two ideas' });
    expect(t.last()).toEqual({
      extension: 'AI',
      status: 'Two ideas',
      suggestions: ['Yes!', 'Maybe'],
      confirm: undefined,
      working: false,
    });
    await t.bar.prompt('Say hi');
    expect(t.deps.ask).toHaveBeenLastCalledWith('org.example.ai', {
      type: 'prompt',
      text: 'Say hi',
    });
  });

  it('asks nothing without a chat open, or without an extension', async () => {
    const t = setup();
    t.openChat(null);
    await t.bar.suggest();
    expect(t.deps.ask).not.toHaveBeenCalled();
    expect(t.last()).toMatchObject({ status: 'Open a chat first.', working: false });
    const none = setup([]);
    await none.bar.suggest();
    expect(none.deps.chatName).not.toHaveBeenCalled();
  });

  it('answers the extension’s question only while it asks one', async () => {
    const t = setup();
    t.bar.confirm();
    expect(t.deps.ask).not.toHaveBeenCalled();
    await t.bar.suggest();
    t.bar.offer('org.example.ai', { suggestions: [], confirm: 'Allow here' });
    t.bar.confirm();
    expect(t.deps.ask).toHaveBeenLastCalledWith('org.example.ai', { type: 'confirm' });
    expect(t.last()).toMatchObject({ confirm: undefined, working: true });
    const none = setup([]);
    none.bar.confirm();
    expect(none.deps.ask).not.toHaveBeenCalled();
  });

  it('puts a suggestion in the message box, or sends it, only in the chat it was made for', async () => {
    const t = setup();
    await t.bar.suggest();
    t.bar.offer('org.example.ai', { suggestions: ['Yes!', 'Maybe'] });
    await t.bar.use(1);
    expect(t.deps.replaceDraft).toHaveBeenLastCalledWith('Maybe');
    expect(t.deps.pressEnter).not.toHaveBeenCalled();
    await t.bar.send(0);
    expect(t.deps.replaceDraft).toHaveBeenLastCalledWith('Yes!');
    expect(t.deps.pressEnter).toHaveBeenCalledOnce();
    expect(t.last()).toMatchObject({ suggestions: [] });
    await t.bar.send(0);
    expect(t.deps.pressEnter).toHaveBeenCalledOnce();
  });

  it('refuses a suggestion once another chat is open, and when the message box is gone', async () => {
    const t = setup();
    await t.bar.suggest();
    t.bar.offer('org.example.ai', { suggestions: ['Yes!'] });
    t.openChat('Bruno');
    await t.bar.send(0);
    expect(t.deps.replaceDraft).not.toHaveBeenCalled();
    expect(t.last()).toMatchObject({ status: 'The chat changed.', suggestions: [] });
    t.openChat('Ana');
    await t.bar.suggest();
    t.bar.offer('org.example.ai', { suggestions: ['Yes!'] });
    t.deps.replaceDraft.mockResolvedValueOnce(false);
    await t.bar.send(0);
    expect(t.deps.pressEnter).not.toHaveBeenCalled();
  });

  it('starts afresh when another extension takes over the bar', async () => {
    const extensions = [{ id: 'org.example.ai', name: 'AI' }];
    const t = setup(extensions);
    await t.bar.suggest();
    t.bar.offer('org.example.ai', { suggestions: ['Yes!'] });
    extensions.splice(0, 1, { id: 'org.example.other', name: 'Other' });
    t.bar.refresh();
    expect(t.bar.state()).toEqual({
      extension: 'Other',
      status: '',
      suggestions: [],
      confirm: undefined,
      working: false,
    });
    extensions.splice(0, 1);
    t.bar.refresh();
    expect(t.bar.state().extension).toBe('');
    expect(t.deps.show).toHaveBeenLastCalledWith(false);
  });

  const MODELS = {
    label: 'Model',
    current: 'fast',
    options: [
      { value: 'fast', label: 'Fast' },
      { value: 'smart', label: 'Smart' },
    ],
  };

  it('shows the extension’s choice, and keeps it until the extension offers another', () => {
    const t = setup();
    t.bar.offer('org.example.ai', { suggestions: [], choice: MODELS });
    const shown = { label: 'Model', current: 'fast', options: MODELS.options };
    expect(t.bar.state().choice).toEqual(shown);
    t.bar.offer('org.example.ai', { suggestions: ['Hi'] });
    expect(t.bar.state().choice).toEqual(shown);
  });

  it('passes the option the user picks to the extension, and asks again if it had suggested', async () => {
    const t = setup();
    t.bar.offer('org.example.ai', { suggestions: [], choice: MODELS });
    await t.bar.choose('smart');
    expect(t.deps.ask).toHaveBeenCalledExactlyOnceWith('org.example.ai', {
      type: 'choose',
      value: 'smart',
    });
    expect(t.bar.state().choice?.current).toBe('smart');
    t.bar.offer('org.example.ai', { suggestions: ['Hi'] });
    await t.bar.choose('fast');
    expect(t.deps.ask.mock.calls.slice(1)).toEqual([
      ['org.example.ai', { type: 'choose', value: 'fast' }],
      ['org.example.ai', { type: 'suggest' }],
    ]);
  });

  it('passes on nothing the extension did not offer, nor without a choice or an extension', async () => {
    const t = setup();
    await t.bar.choose('fast');
    t.bar.offer('org.example.ai', { suggestions: [], choice: MODELS });
    await t.bar.choose('other');
    const none = setup([]);
    await none.bar.choose('fast');
    expect(t.deps.ask).not.toHaveBeenCalled();
    expect(none.deps.ask).not.toHaveBeenCalled();
  });
});
