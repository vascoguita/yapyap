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
      }),
    ).toBe('Using Claude (Anthropic), model claude-opus-5-5. Ready.');
    expect(
      describeState({ type: 'state', provider: 'compatible', model: '', missing: 'model' }),
    ).toBe(
      'Using an OpenAI-compatible server. Choose a model in Plugins → AI assistant → Settings.',
    );
    expect(describeState({ type: 'state', provider: 'x', model: '', missing: '?' })).toBe(
      'Using x.',
    );
    expect(describeState({ type: 'state', provider: '', model: '', missing: 'unavailable' })).toBe(
      'The assistant could not read its settings. Try again in a moment.',
    );
  });
});

describe('problemText', () => {
  it('explains each problem, and anything else generally', () => {
    expect(problemText('no-chat')).toBe('Open a chat first.');
    expect(problemText('auth')).toBe('The provider did not accept your key.');
    expect(problemText('mystery')).toBe('Something went wrong. Try again.');
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
      t.receive({ type: 'state', provider: 'openai', model: 'm', missing: '' });
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
    t.receive({ type: 'state', provider: 'openai', model: 'gpt-x', missing: 'key' });
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
    t.receive({ type: 'state', provider: 'openai', model: 'gpt-x', missing: '' });
    expect(t.button('Forget key').disabled).toBe(false);
    t.button('Forget key').click();
    expect(t.sent.at(-1)).toEqual({ type: 'forget-key' });
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
});
