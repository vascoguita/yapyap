/** @vitest-environment happy-dom */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { describe as describeState, mountPanel, problemText } from './panel.ts';

function setup() {
  const sent: unknown[] = [];
  const port = {
    onmessage: null as ((event: MessageEvent) => void) | null,
    postMessage: vi.fn((message: unknown) => sent.push(message)),
  };
  mountPanel(document, port);
  const receive = (data: unknown) => port.onmessage?.({ data } as MessageEvent);
  const button = (name: string) => {
    const found = [...document.querySelectorAll('button')].find((b) => b.textContent === name);
    if (found === undefined) {
      throw new Error(`No ${name} button.`);
    }
    return found;
  };
  const replies = () => document.querySelector('#replies')?.textContent ?? '';
  return { sent, receive, button, replies };
}

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('describe', () => {
  it('names the provider and model, and what is missing', () => {
    expect(
      describeState({
        type: 'state',
        provider: 'anthropic',
        model: 'claude-opus-5-5',
        missing: '',
        search: false,
      }),
    ).toBe('Using Claude (Anthropic), model claude-opus-5-5. Ready.');
    expect(
      describeState({
        type: 'state',
        provider: 'local',
        model: 'llama3.2:1b',
        missing: '',
        search: false,
      }),
    ).toBe('Using a model server on this computer, model llama3.2:1b. Ready.');
    expect(
      describeState({
        type: 'state',
        provider: 'local',
        model: '',
        missing: 'local-server',
        search: false,
      }),
    ).toBe(
      'Using a model server on this computer. The model server on this computer does not answer. Start it, such as by opening Ollama or Alpaca. If you denied the assistant access, restart YapYap to be asked again.',
    );
    expect(
      describeState({
        type: 'state',
        provider: 'compatible',
        model: '',
        missing: 'model',
        search: false,
      }),
    ).toBe(
      'Using an OpenAI-compatible server. Choose a model in Extensions → AI assistant → Settings.',
    );
    expect(
      describeState({ type: 'state', provider: 'x', model: '', missing: '?', search: false }),
    ).toBe('Using x.');
    expect(
      describeState({
        type: 'state',
        provider: 'built-in',
        model: '',
        missing: 'download',
        search: false,
      }),
    ).toBe('Using the private model on this computer. Download it below to start.');
    expect(problemText('out-of-memory')).toContain('Try the smaller one below?');
    expect(
      describeState({
        type: 'state',
        provider: '',
        model: '',
        missing: 'unavailable',
        search: false,
      }),
    ).toBe('The assistant could not read its settings. Try again in a moment.');
  });
});

describe('problemText', () => {
  it('explains each problem, and anything else generally', () => {
    expect(problemText('no-chat')).toBe('Open a chat first.');
    expect(problemText('auth')).toBe('The provider did not accept your key.');
    expect(problemText('mystery')).toBe('Something went wrong. Try again.');
  });

  it('says plainly why no model on this computer could be used, short enough for the bar', () => {
    expect(problemText('no-server')).toBe(
      'No AI model runs on this computer. Install Ollama from ollama.com and download a model, or choose a provider in Extensions → AI assistant → Settings.',
    );
    expect(problemText('no-models')).toBe(
      'A model server runs on this computer, but it has no model yet. Download one in it, then try again.',
    );
    expect(problemText('search-refused')).toBe(
      'You did not let the assistant look on this computer. To be asked again, turn its “Connect to servers running on this computer” off and on in Extensions.',
    );
    expect(problemText('search-unsupported')).toBe(
      'Update YapYap to find a model on this computer.',
    );
    expect(problemText('search-failed')).toBe(
      'Looking for a model on this computer failed. Try again.',
    );
    for (const reason of [
      'local-server',
      'no-server',
      'no-models',
      'search-refused',
      'search-unsupported',
      'search-failed',
    ]) {
      expect(problemText(reason).length).toBeLessThanOrEqual(200);
    }
  });
});

describe('mountPanel', () => {
  it('asks again each second until the hidden page answers, as it may still be loading', () => {
    vi.useFakeTimers();
    try {
      const t = setup();
      vi.advanceTimersByTime(2500);
      expect(t.sent).toHaveLength(3);
      t.receive({ type: 'progress', text: 'x' });
      vi.advanceTimersByTime(1000);
      expect(t.sent).toHaveLength(4);
      t.receive({ type: 'state', provider: 'openai', model: 'm', missing: '', search: false });
      vi.advanceTimersByTime(5000);
      expect(t.sent).toHaveLength(4);
    } finally {
      vi.useRealTimers();
    }
  });

  it('asks for the state, then shows it', () => {
    const t = setup();
    expect(t.sent).toEqual([{ type: 'state?' }]);
    expect(document.querySelector('h1')?.textContent).toBe('AI assistant');
    const status = document.querySelector('[role="status"]');
    expect(status?.textContent).toBe('Loading…');
    t.receive({ type: 'state', provider: 'openai', model: 'gpt-x', missing: 'key', search: false });
    expect(status?.textContent).toBe('Using OpenAI, model gpt-x. Paste your API key to start.');
    expect(t.button('Forget key').disabled).toBe(true);
    t.receive({ type: 'other' });
    expect(status?.textContent).toContain('Paste your API key');
  });

  it('sends the key once and clears the field, and can forget it', () => {
    const t = setup();
    const input = document.querySelector<HTMLInputElement>('#key');
    if (input === null) {
      throw new Error('No key field.');
    }
    expect(input.type).toBe('password');
    expect(document.querySelector('label')?.htmlFor).toBe('key');
    input.value = 'sk-secret';
    document.querySelector('form')?.dispatchEvent(new Event('submit', { cancelable: true }));
    expect(t.sent.at(-1)).toEqual({ type: 'save-key', key: 'sk-secret' });
    expect(input.value).toBe('');
    t.receive({ type: 'state', provider: 'openai', model: 'gpt-x', missing: '', search: false });
    expect(t.button('Forget key').disabled).toBe(false);
    t.button('Forget key').click();
    expect(t.sent.at(-1)).toEqual({ type: 'forget-key' });
  });

  it('sends the key again until the hidden page answers that request, as a reloading page misses it', () => {
    vi.useFakeTimers();
    try {
      const t = setup();
      const state = {
        type: 'state',
        provider: 'anthropic',
        model: '',
        missing: 'key',
        search: false,
      };
      t.receive(state);
      const input = document.querySelector<HTMLInputElement>('#key');
      if (input === null) {
        throw new Error('No key field.');
      }
      input.value = 'sk-secret';
      document.querySelector('form')?.dispatchEvent(new Event('submit', { cancelable: true }));
      const saves = () =>
        t.sent.filter((sent) => (sent as { type?: unknown }).type === 'save-key').length;
      expect(saves()).toBe(1);
      vi.advanceTimersByTime(1000);
      expect(saves()).toBe(2);
      // A page that starts again says its state, which answers nothing.
      t.receive(state);
      vi.advanceTimersByTime(1000);
      expect(saves()).toBe(3);
      t.receive({ ...state, missing: '', answers: 'forget-key' });
      vi.advanceTimersByTime(1000);
      expect(saves()).toBe(4);
      t.receive({ ...state, missing: '', answers: 'save-key' });
      vi.advanceTimersByTime(5000);
      expect(saves()).toBe(4);
    } finally {
      vi.useRealTimers();
    }
  });

  it('offers to find a model on this computer only while the hidden page says so', () => {
    const t = setup();
    const find = document.querySelector<HTMLElement>('#find');
    expect(find?.hidden).toBe(true);
    t.receive({ type: 'state', provider: 'anthropic', model: '', missing: 'key', search: true });
    expect(find?.hidden).toBe(false);
    expect(find?.textContent).toContain(
      'Use an AI model on this computer? It stays private: your messages never leave it.',
    );
    t.button('Find a model').click();
    expect(t.sent.at(-1)).toEqual({ type: 'find-model' });
    t.receive({ type: 'state', provider: 'local', model: 'm', missing: '', search: false });
    expect(find?.hidden).toBe(true);
  });

  it('offers to allow the assistant in a chat before showing anything of it', () => {
    const t = setup();
    t.button('Look at this chat').click();
    expect(t.sent.at(-1)).toEqual({ type: 'prepare' });
    t.receive({ type: 'preview', chat: 'Ana', allowed: false, instructions: '', transcript: '' });
    expect(t.replies()).toContain('The assistant is off in “Ana”.');
    t.button('Allow in this chat').click();
    expect(t.sent.at(-1)).toEqual({ type: 'allow-chat', allowed: true });
  });

  it('marks the next step in each section with YapYap’s primary style', () => {
    const t = setup();
    const primary = () =>
      [...document.querySelectorAll('button.yapyap-primary')].map((b) => b.textContent);
    expect(primary()).toEqual([
      'Find a model',
      'Save key',
      'Look at this chat',
      'Rewrite my draft',
    ]);
    expect(t.button('Forget key').className).toBe('');
    t.receive({ type: 'preview', chat: 'Ana', allowed: true, instructions: 'I', transcript: 'T' });
    expect(primary()).toContain('Send');
    expect(t.button('Stop allowing in this chat').className).toBe('');
  });

  it('shows exactly what will be sent, streams the answer, and puts the picked reply in the draft', () => {
    const t = setup();
    t.receive({
      type: 'preview',
      chat: 'Ana',
      allowed: true,
      instructions: 'Suggest replies.',
      transcript: 'Chat: Ana\nThem: Hi',
    });
    expect(document.querySelector('#preview')?.textContent).toBe(
      'Suggest replies.\n\nChat: Ana\nThem: Hi',
    );
    t.button('Stop allowing in this chat').click();
    expect(t.sent.at(-1)).toEqual({ type: 'allow-chat', allowed: false });
    t.button('Send').click();
    expect(t.sent.at(-1)).toEqual({ type: 'send' });
    t.receive({ type: 'progress', text: 'Hel' });
    t.receive({ type: 'progress', text: 'lo' });
    expect(t.replies()).toContain('Hello');
    t.button('Stop').click();
    expect(t.sent.at(-1)).toEqual({ type: 'cancel' });
    t.receive({ replace: false, type: 'suggestions', items: ['Hello!', 'Hi there'] });
    expect(t.replies()).toContain('Pick a reply');
    t.button('Hi there').click();
    expect(t.sent.at(-1)).toEqual({ type: 'use', index: 1 });
    t.receive({ type: 'used' });
    expect(t.replies()).toBe('It is in the message box. Edit it and send it yourself.');
    t.receive({ type: 'progress', text: 'New' });
    expect(t.replies()).toBe('NewStop');
    t.receive({ type: 'problem', reason: 'timeout' });
    expect(t.replies()).toBe('The provider took too long to answer.');
  });

  it('asks to rewrite the draft in the chosen style, and offers the rewrite in its place', () => {
    const t = setup();
    const style = document.querySelector<HTMLSelectElement>('#style');
    const language = document.querySelector<HTMLInputElement>('#language');
    if (style === null || language === null) {
      throw new Error('No rewrite form.');
    }
    expect([...style.options].map((option) => option.textContent)).toEqual([
      'Friendlier',
      'More formal',
      'Shorter',
      'Translate',
    ]);
    style.value = 'translate';
    language.value = 'Italian';
    document.querySelector('#rewrite')?.dispatchEvent(new Event('submit', { cancelable: true }));
    expect(t.sent.at(-1)).toEqual({
      type: 'prepare-rewrite',
      style: 'translate',
      language: 'Italian',
    });
    t.receive({ replace: true, type: 'suggestions', items: ['Arrivo tardi'] });
    expect(t.replies()).toContain('Use the rewritten draft in place of yours:');
    t.button('Arrivo tardi').click();
    expect(t.sent.at(-1)).toEqual({ type: 'use', index: 0 });
    t.receive({ type: 'problem', reason: 'empty-draft' });
    expect(t.replies()).toBe('Type a draft in the message box first.');
  });

  it('asks for a summary of the chat, and shows it in the panel only', () => {
    const t = setup();
    t.button('Summarize this chat').click();
    expect(t.sent.at(-1)).toEqual({ type: 'prepare-summary' });
    t.receive({ type: 'summary', text: '- Lunch moved to 1pm' });
    expect(document.querySelector('#summary')?.textContent).toBe('- Lunch moved to 1pm');
    expect(t.replies()).toContain('nothing of it goes to the chat');
  });

  it('asks to catch up on unread chats, saying what it reads, and sends only on Send', () => {
    const t = setup();
    t.button('Catch up on unread chats').click();
    expect(t.sent.at(-1)).toEqual({ type: 'prepare-catch-up' });
    t.receive({
      type: 'catch-up',
      instructions: 'Catch up.',
      transcript: 'Chat: Ana\nUnread: 2\nLatest message: Lunch?',
    });
    expect(t.replies()).toContain('not all its unread messages');
    expect(t.replies()).toContain('No chat is opened or marked as read.');
    expect(document.querySelector('#preview')?.textContent).toBe(
      'Catch up.\n\nChat: Ana\nUnread: 2\nLatest message: Lunch?',
    );
    expect(() => t.button('Allow in this chat')).toThrow();
    t.button('Send').click();
    expect(t.sent.at(-1)).toEqual({ type: 'send' });
    t.receive({ type: 'problem', reason: 'no-unread' });
    expect(t.replies()).toBe('No chat in the chat list has unread messages.');
    t.receive({ type: 'problem', reason: 'unread-not-granted' });
    expect(t.replies()).toContain('Turn on “See which chats have unread messages”');
  });

  it('shows the private model: its next step, the space it takes, and a way to remove it', () => {
    const t = setup();
    const section = document.querySelector<HTMLElement>('#private-model');
    const status = () => document.querySelector('#private-status')?.textContent;
    expect(section?.hidden).toBe(true);
    const view = { type: 'local', label: '', action: '', used: 0, model: 'Qwen2.5 1.5B' };
    t.receive({ ...view, status: '' });
    expect(section?.hidden).toBe(true);
    t.receive({
      ...view,
      status: 'Use a private model?',
      label: 'Use a private model',
      action: 'download',
    });
    expect(section?.hidden).toBe(false);
    expect(status()).toBe('Use a private model?');
    expect(() => t.button('Remove model')).not.toThrow();
    expect(t.button('Remove model').hidden).toBe(true);
    t.button('Use a private model').click();
    expect(t.sent.at(-1)).toEqual({ type: 'download-model' });
    t.receive({
      ...view,
      status: 'Not enough memory. Try the smaller one?',
      label: 'Try the smaller one',
      action: 'smaller',
      used: 1_117_320_736,
    });
    t.button('Try the smaller one').click();
    expect(t.sent.at(-1)).toEqual({ type: 'smaller-model' });
    expect(section?.textContent).toContain('It uses about 1.1 GB on this computer.');
    expect(section?.textContent).toContain('Model: Qwen2.5 1.5B.');
    expect(() => t.button('Use a private model')).toThrow();
    t.button('Remove model').click();
    expect(t.sent.at(-1)).toEqual({ type: 'remove-model' });
    // Ready, with nothing to do but use it or remove it.
    t.receive({ ...view, status: 'Ready.', used: 1 });
    expect(section?.hidden).toBe(false);
    expect(document.querySelector('#private-model div')?.children).toHaveLength(0);
  });
});
