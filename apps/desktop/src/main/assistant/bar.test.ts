import { describe, expect, it, vi } from 'vitest';
import type { ReadChat } from '../../adapter/active-chat.ts';
import type { AssistantBarState } from '../../shared/api/assistant-bar-api.ts';
import { createAssistantBar, SETTLE_MS, type BarDependencies } from './bar.ts';
import { ProviderError } from './providers/provider.ts';
import { suggestPrompt } from './replies.ts';
import { rewritePrompt } from './rewrites.ts';
import type { Setup } from './setup.ts';

/** A chat whose last message is someone else's. */
const CHAT: ReadChat = {
  name: 'Ana',
  group: false,
  messages: [
    { outgoing: true, text: 'See you at 8' },
    { outgoing: false, text: 'Can we do 9?' },
  ],
};

const READY: Setup = {
  provider: 'anthropic',
  missing: '',
  models: [
    { id: 'claude-opus', label: 'Opus' },
    { id: 'claude-haiku', label: 'Haiku' },
  ],
  auto: { id: 'claude-haiku', label: 'Haiku' },
  model: 'claude-haiku',
  key: 'sk',
  endpoint: '',
};

const SETTINGS = {
  enabled: true,
  provider: 'anthropic',
  model: 'auto',
  autoSuggest: true,
  chats: 'chosen',
  messages: '50',
  server: '',
} as const;

const NOW = new Date(2026, 10, 15, 14, 3);

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

/** The assistant with everything it needs played: a chat open in an account, and Claude answering. */
function harness(answer = 'Yes, 9 works!\nCan we do 8?') {
  let setup: Setup = READY;
  let chat: ReadChat | null = CHAT;
  let draft: string | null = 'running late sry';
  let assistant: Record<string, unknown> = { ...SETTINGS };
  const allowed = new Set<string>(['account/Ana']);
  const states: AssistantBarState[] = [];
  const timers: { ms: number; run: () => void; cancel: ReturnType<typeof vi.fn> }[] = [];
  const deps: BarDependencies = {
    core: {
      setup: vi.fn(() => Promise.resolve(setup)),
      ask: vi.fn(() => Promise.resolve(answer)),
    },
    settings: { current: () => ({ assistant }) as never },
    chats: { isAllowed: (account, name) => allowed.has(`${account}/${name}`) },
    accounts: {
      active: () => 'account',
      readActiveChat: vi.fn(() => Promise.resolve(chat)),
      readDraft: vi.fn(() => Promise.resolve(draft)),
      replaceDraft: vi.fn((text: string) => {
        draft = text;
        return Promise.resolve(true);
      }),
    },
    openSettings: vi.fn(),
    after: vi.fn((ms: number, run: () => void) => {
      const cancel = vi.fn();
      timers.push({ ms, run, cancel });
      return () => {
        cancel();
      };
    }),
    show: vi.fn(),
    publish: (state) => states.push(state),
    now: () => NOW,
  };
  const bar = createAssistantBar(deps);
  return {
    bar,
    deps,
    states,
    timers,
    last: () => bar.state(),
    /** Lets the newest message settle, and the request it makes finish. */
    settle: async () => {
      await tick();
      timers.at(-1)?.run();
      await tick();
      await tick();
    },
    forbid: () => {
      allowed.clear();
    },
    setSetup: (next: Setup) => {
      setup = next;
    },
    setChat: (next: ReadChat | null) => {
      chat = next;
    },
    setDraft: (next: string | null) => {
      draft = next;
    },
    set: (next: Record<string, unknown>) => {
      assistant = { ...assistant, ...next };
    },
  };
}

describe('createAssistantBar: the rewrite button', () => {
  it('rewrites the draft in place in the picked way, keeps that way, and offers Undo', async () => {
    const t = harness('“Running late, sorry!”');
    await t.bar.polish('soften');
    // The rewrite reads the chat as suggestions do, so it fits the conversation.
    expect(t.deps.accounts.readActiveChat).toHaveBeenCalledWith(50);
    expect(t.deps.core.ask).toHaveBeenCalledExactlyOnceWith(
      READY,
      rewritePrompt('soften', 'running late sry', CHAT, NOW),
    );
    expect(t.deps.accounts.replaceDraft).toHaveBeenCalledExactlyOnceWith('Running late, sorry!');
    expect(t.last()).toMatchObject({
      polish: 'soften',
      working: false,
      notice: {
        text: 'Softened. Edit it or send as is.',
        button: { id: 'undo', label: 'Undo' },
      },
    });
    // It waited while the model answered.
    expect(t.states.some((state) => state.working)).toBe(true);
    await t.bar.button('undo');
    expect(t.deps.accounts.replaceDraft).toHaveBeenLastCalledWith('running late sry');
    expect(t.last().notice).toBeNull();
  });

  it('keeps the notice and Undo when the chat is first found, and drops them when another opens', async () => {
    const t = harness('Running late, sorry!');
    await t.bar.polish('polish');
    // The first look at the chat came after the rewrite, which is still in the message box.
    t.bar.found(null);
    await tick();
    expect(t.last().notice?.button).toEqual({ id: 'undo', label: 'Undo' });
    t.bar.found('m1');
    await t.settle();
    // The suggestions made meanwhile wait behind the Undo (#743).
    expect(t.last()).toMatchObject({ suggestions: [], writing: false });
    expect(t.bar.state()).toMatchObject({ suggestions: [], notice: { button: { id: 'undo' } } });
    t.bar.opened(null);
    expect(t.last().notice).toBeNull();
    expect(t.last().suggestions).toEqual([]);
  });

  it('drops the notice when the chat is first found with the message box emptied, as after a send', async () => {
    const t = harness('Running late, sorry!');
    await t.bar.polish('polish');
    t.setDraft('');
    t.bar.found(null);
    await tick();
    expect(t.last().notice).toBeNull();
    // With no chat open, the draft is gone too.
    t.setDraft('running late');
    await t.bar.polish('polish');
    t.setChat(null);
    t.setDraft(null);
    t.bar.found(null);
    await tick();
    expect(t.last().notice).toBeNull();
  });

  it('keeps the notice when the message box cannot be read, and reads nothing without a notice', async () => {
    const t = harness('Running late, sorry!');
    t.bar.found(null);
    await tick();
    expect(t.deps.accounts.readDraft).not.toHaveBeenCalled();
    await t.bar.polish('polish');
    vi.mocked(t.deps.accounts.readDraft).mockRejectedValueOnce(new Error('loading'));
    t.bar.found(null);
    await tick();
    expect(t.last().notice?.button?.id).toBe('undo');
  });

  it('shows Undo in place of the suggestions, and Undo restores nothing in another chat (#743)', async () => {
    const t = harness('Shorter.');
    t.bar.arrived('m1');
    await t.settle();
    expect(t.last().suggestions).toEqual(['Shorter.']);
    await t.bar.polish('shorten');
    expect(t.last().suggestions).toEqual([]);
    expect(t.last().notice?.text).toBe('Shortened. Edit it or send as is.');
    // A suggestion out of sight cannot be put in.
    await t.bar.use(0);
    expect(t.deps.accounts.replaceDraft).toHaveBeenCalledOnce();
    t.setChat({ ...CHAT, name: 'Ben' });
    await t.bar.button('undo');
    expect(t.deps.accounts.replaceDraft).toHaveBeenCalledOnce();
    expect(t.last()).toMatchObject({ notice: null, suggestions: ['Shorter.'] });
    t.setChat(null);
    await t.bar.polish('polish');
    await t.bar.button('undo');
    expect(t.deps.accounts.replaceDraft).toHaveBeenCalledOnce();
  });

  it('only rewrites in its own ways, one rewrite at a time', async () => {
    const t = harness();
    await t.bar.polish('friendlier');
    expect(t.deps.core.setup).not.toHaveBeenCalled();
    expect(t.last().polish).toBe('polish');
    let answer: (text: string) => void = () => undefined;
    vi.mocked(t.deps.core.ask).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          answer = resolve;
        }),
    );
    const first = t.bar.polish('formalize');
    await vi.waitFor(() => {
      expect(t.deps.core.ask).toHaveBeenCalledOnce();
    });
    await t.bar.polish('shorten');
    expect(t.deps.core.ask).toHaveBeenCalledOnce();
    answer('Dear all.');
    await first;
    await t.bar.polish('elaborate');
    expect(t.deps.core.ask).toHaveBeenCalledTimes(2);
  });

  it('sends nothing without a draft or an open chat', async () => {
    const t = harness();
    t.setDraft('   ');
    await t.bar.polish('polish');
    t.setDraft(null);
    await t.bar.polish('polish');
    t.setChat(null);
    await t.bar.polish('polish');
    expect(t.deps.core.ask).not.toHaveBeenCalled();
    expect(t.last().notice).toBeNull();
  });

  it('says the assistant is off in a chat the user did not list, with the way to Settings', async () => {
    const t = harness();
    t.forbid();
    await t.bar.polish('polish');
    expect(t.deps.core.ask).not.toHaveBeenCalled();
    expect(t.last().notice).toEqual({
      text: 'The AI assistant is off in this chat. Turn it on in Settings → AI Assistant.',
      button: { id: 'fix', label: 'Open Settings' },
    });
    await t.bar.button('fix');
    expect(t.deps.openSettings).toHaveBeenCalledOnce();
    t.set({ chats: 'all' });
    await t.bar.polish('polish');
    expect(t.deps.core.ask).toHaveBeenCalledOnce();
  });

  it('leaves a draft the user changed meanwhile, or a chat they left, as it is', async () => {
    const t = harness();
    vi.mocked(t.deps.core.ask).mockImplementationOnce(() => {
      t.setDraft('running late, sorry');
      return Promise.resolve('Running late!');
    });
    await t.bar.polish('polish');
    expect(t.deps.accounts.replaceDraft).not.toHaveBeenCalled();
    expect(t.last().notice).toEqual({
      text: 'You changed your message while the AI assistant worked, so it was left as it is.',
      button: null,
    });
    vi.mocked(t.deps.core.ask).mockImplementationOnce(() => {
      t.setChat({ ...CHAT, name: 'Ben' });
      return Promise.resolve('Running late!');
    });
    await t.bar.polish('polish');
    expect(t.deps.accounts.replaceDraft).not.toHaveBeenCalled();
  });

  it('says so when the model wrote nothing, and keeps no Undo when the draft could not change', async () => {
    const t = harness('  ""  ');
    await t.bar.polish('polish');
    expect(t.last().notice?.text).toBe('The AI assistant had nothing to write. Try again.');
    const u = harness();
    vi.mocked(u.deps.accounts.replaceDraft).mockResolvedValueOnce(false);
    await u.bar.polish('polish');
    expect(u.last().notice).toBeNull();
  });

  it('explains a failed rewrite, offering Settings when the key is refused', async () => {
    const t = harness();
    vi.mocked(t.deps.core.ask).mockRejectedValueOnce(new ProviderError('auth'));
    await t.bar.polish('polish');
    expect(t.last()).toMatchObject({
      working: false,
      notice: { text: expect.stringContaining('Claude') as string, button: { id: 'fix' } },
    });
    await t.bar.button('fix');
    expect(t.deps.openSettings).toHaveBeenCalledOnce();
    vi.mocked(t.deps.core.ask).mockRejectedValueOnce(new Error('odd'));
    await t.bar.polish('polish');
    expect(t.last().notice?.button).toBeNull();
  });

  it('says what keeps it from answering, and takes that away once the setup is fixed', async () => {
    const t = harness();
    t.setSetup({ ...READY, missing: 'key', models: [] });
    await t.bar.polish('polish');
    expect(t.deps.core.ask).not.toHaveBeenCalled();
    expect(t.last().model).toBe('not set up yet');
    expect(t.last().notice?.button).toEqual({ id: 'fix', label: 'Paste a Key…' });
    await t.bar.button('fix');
    expect(t.deps.openSettings).toHaveBeenCalledOnce();
    t.setSetup({ ...READY, missing: 'model', provider: 'server', models: [] });
    await t.bar.refresh();
    expect(t.last().notice?.text).toContain('Your model server does not answer');
    t.setSetup(READY);
    await t.bar.refresh();
    expect(t.last().notice).toBeNull();
    expect(t.last().model).toBe('Haiku');
    // Once nothing keeps it, the model changes alone.
    t.setSetup({ ...READY, model: 'claude-opus' });
    await t.bar.refresh();
    expect(t.last().model).toBe('Opus');
    t.setSetup({ ...READY, model: 'claude-new' });
    await t.bar.refresh();
    expect(t.last().model).toBe('claude-new');
    // It names the model in the setup only once the setup is fixed.
    await t.bar.polish('polish');
    expect(t.last().notice?.text).toBe('Polished. Edit it or send as is.');
  });

  it('shows or hides itself as the settings say', async () => {
    const t = harness();
    await t.bar.refresh();
    expect(t.deps.show).toHaveBeenLastCalledWith(true);
    t.set({ enabled: false });
    await t.bar.refresh();
    expect(t.deps.show).toHaveBeenLastCalledWith(false);
  });

  it('closes a notice, and presses only the button the notice shows', async () => {
    const t = harness();
    await t.bar.button('undo');
    await t.bar.button('close');
    expect(t.deps.accounts.replaceDraft).not.toHaveBeenCalled();
    t.forbid();
    await t.bar.polish('polish');
    await t.bar.button('undo');
    expect(t.deps.accounts.replaceDraft).not.toHaveBeenCalled();
    expect(t.last().notice).not.toBeNull();
    await t.bar.button('close');
    expect(t.last().notice).toBeNull();
  });
});

describe('createAssistantBar: suggested replies', () => {
  it('suggests replies once a message from someone else settled, with the chat’s latest messages', async () => {
    const t = harness('1. Yes, 9 works!\n2. Can we do 8?');
    t.bar.arrived('m1');
    // It settles once it knows it may answer there, so the blank chips show from the start.
    await tick();
    expect(t.timers[0]?.ms).toBe(SETTLE_MS);
    expect(t.last()).toMatchObject({ writing: true, suggestions: [] });
    await t.settle();
    expect(t.deps.accounts.readActiveChat).toHaveBeenCalledWith(50);
    expect(t.deps.core.ask).toHaveBeenCalledExactlyOnceWith(
      READY,
      suggestPrompt(CHAT, NOW),
      expect.any(AbortSignal),
    );
    expect(t.last().suggestions).toEqual(['Yes, 9 works!', 'Can we do 8?']);
  });

  it('puts a suggestion in the message box on click, never sending it, and keeps the others (#743)', async () => {
    const t = harness();
    t.bar.arrived('m1');
    await t.settle();
    await t.bar.use(5);
    expect(t.deps.accounts.replaceDraft).not.toHaveBeenCalled();
    vi.mocked(t.deps.accounts.readDraft).mockResolvedValueOnce('');
    await t.bar.use(1);
    expect(t.deps.accounts.replaceDraft).toHaveBeenCalledExactlyOnceWith('Can we do 8?');
    expect(t.last().suggestions).toEqual(['Yes, 9 works!', 'Can we do 8?']);
    // The box was empty, so there is nothing to put back.
    expect(t.last().notice).toBeNull();
  });

  it('offers Undo when a suggestion replaces what the user typed, and puts it back', async () => {
    const t = harness();
    t.bar.arrived('m1');
    await t.settle();
    vi.mocked(t.deps.accounts.readDraft).mockResolvedValueOnce('running late');
    await t.bar.use(0);
    expect(t.deps.accounts.replaceDraft).toHaveBeenLastCalledWith('Yes, 9 works!');
    expect(t.last().notice).toEqual({
      text: 'Replaced your draft.',
      button: { id: 'undo', label: 'Undo' },
    });
    expect(t.last().suggestions).toEqual([]);
    await t.bar.button('undo');
    expect(t.deps.accounts.replaceDraft).toHaveBeenLastCalledWith('running late');
    expect(t.last()).toMatchObject({
      notice: null,
      suggestions: ['Yes, 9 works!', 'Can we do 8?'],
    });
    // A draft that is the suggestion already, or a box that cannot be read, offers nothing.
    vi.mocked(t.deps.accounts.readDraft).mockResolvedValueOnce('Can we do 8?');
    await t.bar.use(1);
    vi.mocked(t.deps.accounts.readDraft).mockRejectedValueOnce(new Error('gone'));
    await t.bar.use(1);
    expect(t.last().notice).toBeNull();
  });

  it('puts in a suggestion shown again in a chat opened again (#743)', async () => {
    const t = harness();
    t.bar.opened('m1');
    await t.settle();
    // Another chat, whose own suggestions are written, then back to the first.
    t.setChat({ ...CHAT, name: 'Ben' });
    t.bar.opened('b1');
    await t.settle();
    t.setChat(CHAT);
    t.bar.opened('m1');
    await tick();
    expect(t.last().suggestions).toEqual(['Yes, 9 works!', 'Can we do 8?']);
    vi.mocked(t.deps.accounts.readDraft).mockResolvedValueOnce('');
    await t.bar.use(1);
    expect(t.deps.accounts.replaceDraft).toHaveBeenLastCalledWith('Can we do 8?');
  });

  it('names no chat for suggestions shown again when the chat cannot be read, or another came first', async () => {
    const t = harness();
    t.bar.opened('m1');
    await t.settle();
    t.bar.opened('x');
    vi.mocked(t.deps.accounts.readActiveChat).mockRejectedValueOnce(new Error('reloading'));
    t.bar.opened('m1');
    await tick();
    await t.bar.use(0);
    expect(t.deps.accounts.replaceDraft).not.toHaveBeenCalled();
    // A newer message calls showing them off.
    t.bar.opened('m1');
    t.bar.arrived('m2');
    await t.settle();
    expect(t.last().suggestions).toEqual(['Yes, 9 works!', 'Can we do 8?']);
  });

  it('puts in no suggestion once another chat is open', async () => {
    const t = harness();
    t.bar.arrived('m1');
    await t.settle();
    t.setChat({ ...CHAT, name: 'Ben' });
    await t.bar.use(0);
    t.setChat(null);
    await t.bar.use(0);
    expect(t.deps.accounts.replaceDraft).not.toHaveBeenCalled();
  });

  it('asks once for a burst of messages, calling off what went stale', async () => {
    const t = harness();
    t.bar.arrived('m1');
    t.bar.arrived('m2');
    await t.settle();
    // The first was called off before it even settled.
    expect(t.timers).toHaveLength(1);
    expect(t.deps.core.ask).toHaveBeenCalledOnce();
    t.bar.arrived('m4');
    await tick();
    t.bar.arrived('m5');
    expect(t.timers[1]?.cancel).toHaveBeenCalledOnce();
    await t.settle();
    expect(t.deps.core.ask).toHaveBeenCalledTimes(2);
    // A request already made shows nothing once a newer message came.
    let answer: (text: string) => void = () => undefined;
    vi.mocked(t.deps.core.ask).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          answer = resolve;
        }),
    );
    t.bar.arrived('m3');
    await t.settle();
    t.bar.sent();
    answer('Too late');
    await tick();
    expect(t.last().suggestions).toEqual([]);
  });

  it('asks nothing when the setup or the chat stopped fitting while the message settled', async () => {
    const t = harness();
    t.bar.arrived('m1');
    await tick();
    expect(t.last().writing).toBe(true);
    t.setSetup({ ...READY, missing: 'key' });
    await t.settle();
    expect(t.deps.core.ask).not.toHaveBeenCalled();
    expect(t.last()).toMatchObject({ writing: false, suggestions: [] });
  });

  it('drops a request that went stale before the chat was read', async () => {
    const t = harness();
    vi.mocked(t.deps.accounts.readActiveChat).mockImplementationOnce(() => {
      t.bar.sent();
      return Promise.resolve(CHAT);
    });
    t.bar.arrived('m1');
    await t.settle();
    expect(t.deps.core.ask).not.toHaveBeenCalled();
  });

  it('shows the same suggestions when the chat opens again, without asking again', async () => {
    const t = harness();
    t.bar.opened('m1');
    await t.settle();
    expect(t.last().suggestions).toHaveLength(2);
    t.bar.opened(null);
    expect(t.last().suggestions).toEqual([]);
    t.bar.opened('m1');
    await tick();
    expect(t.last().suggestions).toHaveLength(2);
    expect(t.deps.core.ask).toHaveBeenCalledOnce();
  });

  it('answers the message the user replies to once, and the last item’s again when it goes (#740)', async () => {
    const t = harness();
    t.bar.found('aaaaaaaa:m1:s1:-');
    await t.settle();
    const forLast = t.last().suggestions;
    const replying = { ...CHAT, replyingTo: { author: 'Ana', text: 'See you at 8' } };
    t.setChat(replying);
    vi.mocked(t.deps.core.ask).mockResolvedValueOnce('Sure!\nMaybe 9?');
    t.bar.arrived('aaaaaaaa:m1:s1:q1');
    await t.settle();
    expect(t.deps.core.ask).toHaveBeenLastCalledWith(
      READY,
      suggestPrompt(replying, NOW),
      expect.any(AbortSignal),
    );
    expect(vi.mocked(t.deps.core.ask).mock.lastCall?.[1].task).toContain('Ana: “See you at 8”');
    expect(t.last()).toMatchObject({ chat: 'aaaaaaaa', suggestions: ['Sure!', 'Maybe 9?'] });
    // Removing the quote, then choosing it again, shows what was made for each without asking.
    t.setChat(CHAT);
    t.bar.arrived('aaaaaaaa:m1:s1:-');
    await tick();
    expect(t.last().suggestions).toEqual(forLast);
    t.setChat(replying);
    t.bar.arrived('aaaaaaaa:m1:s1:q1');
    await tick();
    expect(t.last().suggestions).toEqual(['Sure!', 'Maybe 9?']);
    expect(t.deps.core.ask).toHaveBeenCalledTimes(2);
  });

  it('folds the suggestions away and back, still making them while folded (#729)', async () => {
    const t = harness();
    t.bar.collapse();
    expect(t.last().collapsed).toBe(true);
    t.bar.arrived('m1');
    await t.settle();
    expect(t.last()).toMatchObject({
      collapsed: true,
      suggestions: ['Yes, 9 works!', 'Can we do 8?'],
    });
    t.bar.expand();
    expect(t.last()).toMatchObject({
      collapsed: false,
      suggestions: ['Yes, 9 works!', 'Can we do 8?'],
    });
    expect(t.deps.core.ask).toHaveBeenCalledOnce();
  });

  it('says it is writing while the model answers, and stops when it is done or called off (#703)', async () => {
    let answer: (text: string) => void = () => undefined;
    const t = harness();
    vi.mocked(t.deps.core.ask).mockImplementation(
      () =>
        new Promise((resolve) => {
          answer = resolve;
        }),
    );
    t.bar.arrived('m1');
    await t.settle();
    expect(t.last()).toMatchObject({ writing: true, suggestions: [] });
    answer('Sure');
    await t.settle();
    expect(t.last()).toMatchObject({ writing: false, suggestions: ['Sure'] });
    // A send calls the next one off.
    t.bar.arrived('m2');
    await t.settle();
    expect(t.last().writing).toBe(true);
    t.bar.sent();
    expect(t.last().writing).toBe(false);
    answer('Late');
    await t.settle();
    expect(t.last()).toMatchObject({ writing: false, suggestions: [] });
    // Another chat calls it off too, and a chat seen before shows its suggestions at once.
    t.bar.arrived('m3');
    await t.settle();
    t.bar.opened('m1');
    await tick();
    expect(t.last()).toMatchObject({ writing: false, suggestions: ['Sure'] });
  });

  it("keeps the suggestions behind a rewrite's Undo, and shows them again once the user empties the box (#743)", async () => {
    const t = harness('Yes, 9 works!\nCan we do 8?');
    t.bar.arrived('m1');
    await t.settle();
    expect(t.last().suggestions).toHaveLength(2);
    await t.bar.polish('polish');
    expect(t.last()).toMatchObject({ suggestions: [], notice: { button: { id: 'undo' } } });
    t.bar.cleared();
    // The suggestions made for the message come back without asking the model again.
    await tick();
    expect(t.last()).toMatchObject({
      suggestions: ['Yes, 9 works!', 'Can we do 8?'],
      notice: null,
    });
    expect(t.deps.core.ask).toHaveBeenCalledTimes(2);
    // Undo has nothing left to put back.
    await t.bar.button('undo');
    expect(t.deps.accounts.replaceDraft).toHaveBeenCalledOnce();
    // The box stays empty: the suggestions stay, and nothing is asked again.
    t.bar.cleared();
    expect(t.last().suggestions).toHaveLength(2);
    expect(t.deps.core.ask).toHaveBeenCalledTimes(2);
  });

  it('brings the suggestions back after Undo too, and only takes the Undo notice away', async () => {
    const t = harness('Yes, 9 works!\nCan we do 8?');
    t.bar.arrived('m1');
    await t.settle();
    await t.bar.polish('polish');
    await t.bar.button('undo');
    expect(t.last().notice).toBeNull();
    t.bar.cleared();
    await tick();
    expect(t.last().suggestions).toHaveLength(2);
    // With no message from someone else to answer, emptying the box only takes Undo away.
    const quiet = harness();
    await quiet.bar.polish('polish');
    quiet.bar.cleared();
    expect(quiet.last()).toMatchObject({ suggestions: [], notice: null });
    expect(quiet.timers).toEqual([]);
  });

  it('does nothing while the box is empty with no rewrite to take back, or after a send', async () => {
    const t = harness();
    t.bar.arrived('m1');
    await t.settle();
    const shown = t.states.length;
    t.bar.cleared();
    expect(t.states).toHaveLength(shown);
    await t.bar.polish('polish');
    t.bar.sent();
    t.bar.cleared();
    expect(t.last()).toMatchObject({ suggestions: [], notice: null });
    await t.bar.polish('polish');
    t.bar.opened(null);
    t.bar.cleared();
    expect(t.last()).toMatchObject({ suggestions: [], notice: null });
  });

  it('keeps any other notice when the box is emptied, and suggests nothing with no message to answer', async () => {
    const t = harness();
    t.setSetup({ ...READY, missing: 'key' });
    await t.bar.polish('polish');
    const notice = t.last().notice;
    expect(notice).not.toBeNull();
    t.bar.cleared();
    expect(t.last().notice).toEqual(notice);
    expect(t.deps.core.ask).not.toHaveBeenCalled();
    expect(t.timers).toEqual([]);
  });

  it('remembers only the latest messages’ suggestions', async () => {
    const t = harness();
    for (let index = 0; index <= 20; index++) {
      t.bar.arrived(`m${String(index)}`);
      await t.settle();
    }
    t.bar.arrived('m20');
    t.bar.arrived('m1');
    expect(t.deps.core.ask).toHaveBeenCalledTimes(21);
    t.bar.arrived('m0');
    await t.settle();
    expect(t.deps.core.ask).toHaveBeenCalledTimes(22);
  });

  it('suggests nothing where it may not', async () => {
    const t = harness();
    t.forbid();
    t.bar.arrived('m1');
    await t.settle();
    t.set({ chats: 'all', autoSuggest: false });
    t.bar.arrived('m2');
    await t.settle();
    t.set({ autoSuggest: true });
    t.setChat(null);
    t.bar.arrived('m5');
    await t.settle();
    t.setChat(CHAT);
    t.setSetup({ ...READY, missing: 'key' });
    t.bar.arrived('m6');
    await t.settle();
    expect(t.deps.core.ask).not.toHaveBeenCalled();
    expect(t.last().notice).toBeNull();
  });

  it('suggests whoever sent the chat’s last item, and in a chat with none yet (#723)', async () => {
    const t = harness();
    t.setChat({ ...CHAT, messages: [...CHAT.messages, { outgoing: true, text: 'Ok' }] });
    t.bar.arrived('m3');
    await t.settle();
    expect(t.last().suggestions).not.toEqual([]);
    t.setChat({ ...CHAT, messages: [] });
    t.bar.arrived('m4');
    await t.settle();
    expect(t.deps.core.ask).toHaveBeenCalledTimes(2);
  });

  it('says why no suggestions came, instead of showing nothing (#743)', async () => {
    const t = harness('NONE');
    t.bar.arrived('m1');
    await t.settle();
    const retry = { id: 'retry', label: 'Try Again' };
    expect(t.last()).toMatchObject({
      suggestions: [],
      writing: false,
      notice: { text: 'No suggestions this time.', button: retry },
    });
    // The model declining the chat is said with no button: asking again will not change it.
    vi.mocked(t.deps.core.ask).mockRejectedValueOnce(new ProviderError('refused'));
    t.bar.arrived('m2');
    await t.settle();
    expect(t.last().notice).toEqual({
      text: 'The model declined to suggest replies in this chat.',
      button: null,
    });
    // A passing problem offers Try Again, and one a setting mends offers the way there.
    vi.mocked(t.deps.core.ask).mockRejectedValueOnce(new ProviderError('network'));
    t.bar.arrived('m3');
    await t.settle();
    expect(t.last().notice).toEqual({
      text: 'Claude (Anthropic) could not be reached.',
      button: retry,
    });
    vi.mocked(t.deps.core.ask).mockRejectedValueOnce(new Error('odd'));
    t.bar.arrived('m4');
    await t.settle();
    expect(t.last().notice).toEqual({ text: 'Something went wrong. Try again.', button: retry });
    vi.mocked(t.deps.core.ask).mockRejectedValueOnce(new ProviderError('auth'));
    t.bar.arrived('m5');
    await t.settle();
    expect(t.last().notice?.button?.id).toBe('fix');
  });

  it('asks again on Try Again, and the reason goes as soon as it asks', async () => {
    const t = harness();
    vi.mocked(t.deps.core.ask).mockRejectedValueOnce(new ProviderError('timeout'));
    t.bar.arrived('m1');
    await t.settle();
    expect(t.last().notice?.button?.id).toBe('retry');
    await t.bar.button('retry');
    expect(t.last().notice).toBeNull();
    await t.settle();
    expect(t.last().suggestions).toEqual(['Yes, 9 works!', 'Can we do 8?']);
    expect(t.deps.core.ask).toHaveBeenCalledTimes(2);
    // Once the user sent, the reason goes, and with it Try Again.
    vi.mocked(t.deps.core.ask).mockRejectedValueOnce(new ProviderError('timeout'));
    t.bar.arrived('m2');
    await t.settle();
    t.bar.sent();
    expect(t.last().notice).toBeNull();
    await t.bar.button('retry');
    await t.settle();
    expect(t.deps.core.ask).toHaveBeenCalledTimes(3);
  });

  it('stops writing when the chat cannot be read once it settled', async () => {
    const t = harness();
    t.bar.arrived('m1');
    await tick();
    vi.mocked(t.deps.accounts.readActiveChat).mockRejectedValueOnce(new Error('reloading'));
    await t.settle();
    expect(t.deps.core.ask).not.toHaveBeenCalled();
    expect(t.last()).toMatchObject({ writing: false, suggestions: [], notice: null });
  });

  it('says nothing about a request another message called off', async () => {
    let fail: (error: unknown) => void = () => undefined;
    const t = harness();
    vi.mocked(t.deps.core.ask).mockImplementationOnce(
      () =>
        new Promise((_resolve, reject) => {
          fail = reject;
        }),
    );
    t.bar.arrived('m1');
    await t.settle();
    t.bar.opened('m9');
    fail(new ProviderError('cancelled'));
    await t.settle();
    expect(t.last().notice).toBeNull();
  });

  it('cuts a suggestion that runs on', async () => {
    const t = harness('x'.repeat(1200));
    t.bar.arrived('m1');
    await t.settle();
    expect(t.last().suggestions[0]).toHaveLength(1000);
  });

  it('takes away the suggestions and the notice when the user sends, or opens another chat', async () => {
    const t = harness();
    t.bar.arrived('m1');
    await t.settle();
    await t.bar.polish('polish');
    t.bar.sent();
    expect(t.last()).toMatchObject({ suggestions: [], notice: null });
    t.bar.arrived('m2');
    await t.settle();
    t.forbid();
    await t.bar.polish('polish');
    t.bar.opened(null);
    expect(t.last()).toMatchObject({ suggestions: [], notice: null });
    await t.bar.button('undo');
    expect(t.deps.accounts.replaceDraft).toHaveBeenCalledOnce();
  });
});
