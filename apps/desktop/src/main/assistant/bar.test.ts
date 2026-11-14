import { describe, expect, it, vi } from 'vitest';
import type { ReadChat } from '../../adapter/active-chat.ts';
import type { AssistantBarState } from '../../shared/api/assistant-bar-api.ts';
import { createAssistantBar, SETTLE_MS, type BarDependencies } from './bar.ts';
import type { PrivateModelStatus } from './private/private-model.ts';
import { ProviderError } from './providers/provider.ts';
import { INSTRUCTIONS } from './replies.ts';
import { rewriteInstructions } from './rewrites.ts';
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

const PRIVATE: PrivateModelStatus = {
  model: { id: 'qwen', name: 'Qwen', url: 'https://huggingface.co/q', size: 1000, sha256: 'a' },
  phase: { kind: 'none' },
  smaller: true,
  used: 0,
};

const SETTINGS = {
  enabled: true,
  provider: 'auto',
  model: 'auto',
  autoSuggest: true,
  chats: 'chosen',
  messages: '10',
  localServer: '',
} as const;

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

/** The assistant with everything it needs played: a chat open in an account, and Claude answering. */
function harness(answer = 'Yes, 9 works!\nCan we do 8?') {
  let setup: Setup = READY;
  let chat: ReadChat | null = CHAT;
  let draft: string | null = 'running late sry';
  let model: PrivateModelStatus = PRIVATE;
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
    privateModels: {
      status: () => Promise.resolve(model),
      download: vi.fn(),
      smaller: vi.fn(() => Promise.resolve()),
      outOfMemory: vi.fn(),
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
    setModel: (next: PrivateModelStatus) => {
      model = next;
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
    expect(t.deps.core.ask).toHaveBeenCalledExactlyOnceWith(
      READY,
      rewriteInstructions('soften'),
      'running late sry',
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
    expect(t.last().suggestions).toHaveLength(1);
    expect(t.last().notice?.button?.id).toBe('undo');
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

  it('takes the rewrite’s suggestions away, and Undo restores nothing in another chat', async () => {
    const t = harness('Shorter.');
    t.bar.arrived('m1');
    await t.settle();
    expect(t.last().suggestions).toEqual(['Shorter.']);
    await t.bar.polish('shorten');
    expect(t.last().suggestions).toEqual([]);
    expect(t.last().notice?.text).toBe('Shortened. Edit it or send as is.');
    t.setChat({ ...CHAT, name: 'Ben' });
    await t.bar.button('undo');
    expect(t.deps.accounts.replaceDraft).toHaveBeenCalledOnce();
    expect(t.last().notice).toBeNull();
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
      text: 'The assistant is off in this chat. Turn it on in Settings, under Assistant.',
      button: { id: 'fix', label: 'Open settings' },
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
      text: 'You changed your message while the assistant worked, so it was left as it is.',
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
    expect(t.last().notice?.text).toBe('The assistant had nothing to write. Try again.');
    const u = harness();
    vi.mocked(u.deps.accounts.replaceDraft).mockResolvedValueOnce(false);
    await u.bar.polish('polish');
    expect(u.last().notice).toBeNull();
  });

  it('explains a failed rewrite, offering the smaller private model when memory ran out', async () => {
    const t = harness();
    vi.mocked(t.deps.core.ask).mockRejectedValueOnce(new ProviderError('auth'));
    await t.bar.polish('polish');
    expect(t.last()).toMatchObject({
      working: false,
      notice: { text: expect.stringContaining('Claude') as string, button: { id: 'fix' } },
    });
    await t.bar.button('fix');
    expect(t.deps.openSettings).toHaveBeenCalledOnce();
    vi.mocked(t.deps.core.ask).mockRejectedValueOnce(new ProviderError('out-of-memory'));
    await t.bar.polish('polish');
    expect(t.deps.privateModels.outOfMemory).toHaveBeenCalledOnce();
    expect(t.last().notice?.button).toEqual({ id: 'fix', label: 'Try the smaller model' });
    await t.bar.button('fix');
    expect(t.deps.privateModels.smaller).toHaveBeenCalledOnce();
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
    expect(t.last().notice?.button).toEqual({ id: 'fix', label: 'Paste a key…' });
    t.setSetup({ ...READY, missing: 'download', provider: 'built-in' });
    t.setModel({ ...PRIVATE, phase: { kind: 'paused', done: 500, problem: '' } });
    await t.bar.refresh();
    expect(t.last().notice?.button).toEqual({ id: 'fix', label: 'Resume download' });
    await t.bar.button('fix');
    expect(t.deps.privateModels.download).toHaveBeenCalledOnce();
    t.setModel({ ...PRIVATE, phase: { kind: 'downloading', done: 600 } });
    await t.bar.privateModelChanged();
    expect(t.last().notice?.text).toContain('60%');
    t.setSetup(READY);
    t.setModel({ ...PRIVATE, phase: { kind: 'ready' } });
    await t.bar.privateModelChanged();
    expect(t.last().notice).toBeNull();
    expect(t.last().model).toBe('Haiku');
    // Once nothing keeps it, the model changes alone.
    await t.bar.privateModelChanged();
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
    expect(t.timers[0]?.ms).toBe(SETTLE_MS);
    await t.settle();
    expect(t.deps.accounts.readActiveChat).toHaveBeenCalledWith(10);
    expect(t.deps.core.ask).toHaveBeenCalledExactlyOnceWith(
      READY,
      INSTRUCTIONS,
      'Chat: Ana\nMe: See you at 8\nThem: Can we do 9?',
      expect.any(AbortSignal),
    );
    expect(t.last().suggestions).toEqual(['Yes, 9 works!', 'Can we do 8?']);
  });

  it('puts a suggestion in the message box on click, never sending it, and hides the row', async () => {
    const t = harness();
    t.bar.arrived('m1');
    await t.settle();
    await t.bar.use(5);
    expect(t.deps.accounts.replaceDraft).not.toHaveBeenCalled();
    await t.bar.use(1);
    expect(t.deps.accounts.replaceDraft).toHaveBeenCalledExactlyOnceWith('Can we do 8?');
    expect(t.last().suggestions).toEqual([]);
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
    expect(t.timers[0]?.cancel).toHaveBeenCalledOnce();
    await t.settle();
    expect(t.deps.core.ask).toHaveBeenCalledOnce();
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

  it('shows the same suggestions when the chat opens again, and none once dismissed', async () => {
    const t = harness();
    t.bar.opened('m1');
    await t.settle();
    expect(t.last().suggestions).toHaveLength(2);
    t.bar.opened(null);
    expect(t.last().suggestions).toEqual([]);
    t.bar.opened('m1');
    expect(t.last().suggestions).toHaveLength(2);
    expect(t.deps.core.ask).toHaveBeenCalledOnce();
    t.bar.dismiss();
    expect(t.last().suggestions).toEqual([]);
    t.bar.opened('m1');
    expect(t.last().suggestions).toEqual([]);
    // The next message gets suggestions again.
    t.bar.arrived('m2');
    await t.settle();
    expect(t.last().suggestions).toHaveLength(2);
    // Dismissing with no message known only hides the row.
    t.bar.sent();
    t.bar.dismiss();
    expect(t.last().suggestions).toEqual([]);
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

  it('suggests nothing where it may not, or need not', async () => {
    const t = harness();
    t.forbid();
    t.bar.arrived('m1');
    await t.settle();
    t.set({ chats: 'all', autoSuggest: false });
    t.bar.arrived('m2');
    await t.settle();
    t.set({ autoSuggest: true });
    t.setChat({ ...CHAT, messages: [...CHAT.messages, { outgoing: true, text: 'Ok' }] });
    t.bar.arrived('m3');
    await t.settle();
    t.setChat({ ...CHAT, messages: [] });
    t.bar.arrived('m4');
    await t.settle();
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

  it('shows nothing when the model found no reply, or failed', async () => {
    const t = harness('NONE');
    t.bar.arrived('m1');
    await t.settle();
    expect(t.last().suggestions).toEqual([]);
    vi.mocked(t.deps.core.ask).mockRejectedValueOnce(new ProviderError('network'));
    t.bar.arrived('m2');
    await t.settle();
    expect(t.last().suggestions).toEqual([]);
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
