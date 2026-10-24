/** @vitest-environment happy-dom */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { describe as describeState, mountPanel } from './panel.ts';

function fakePort() {
  const sent: unknown[] = [];
  const port = {
    onmessage: null as ((event: MessageEvent) => void) | null,
    postMessage: vi.fn((message: unknown) => sent.push(message)),
    receive: (data: unknown) => port.onmessage?.({ data } as MessageEvent),
  };
  return { port, sent };
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

describe('mountPanel', () => {
  it('asks again each second until the hidden page answers, as it may still be loading', () => {
    vi.useFakeTimers();
    try {
      const { port, sent } = fakePort();
      mountPanel(document, port);
      vi.advanceTimersByTime(2500);
      expect(sent).toHaveLength(3);
      port.receive({ type: 'state', provider: 'openai', model: 'm', missing: '' });
      vi.advanceTimersByTime(5000);
      expect(sent).toHaveLength(3);
    } finally {
      vi.useRealTimers();
    }
  });

  it('asks for the state, then shows it', () => {
    const { port, sent } = fakePort();
    mountPanel(document, port);
    expect(sent).toEqual([{ type: 'state?' }]);
    expect(document.querySelector('h1')?.textContent).toBe('AI assistant');
    const status = document.querySelector('[role="status"]');
    expect(status?.textContent).toBe('Loading…');
    port.receive({ type: 'state', provider: 'openai', model: 'gpt-x', missing: 'key' });
    expect(status?.textContent).toBe('Using OpenAI, model gpt-x. Paste your API key to start.');
    expect(document.querySelector<HTMLButtonElement>('button[type="button"]')?.disabled).toBe(true);
    port.receive({ type: 'other' });
    expect(status?.textContent).toContain('Paste your API key');
  });

  it('sends the key once and clears the field, and can forget it', () => {
    const { port, sent } = fakePort();
    mountPanel(document, port);
    const input = document.querySelector<HTMLInputElement>('#key');
    if (input === null) {
      throw new Error('No key field.');
    }
    expect(input.type).toBe('password');
    expect(document.querySelector('label')?.htmlFor).toBe('key');
    input.value = 'sk-secret';
    document.querySelector('form')?.dispatchEvent(new Event('submit', { cancelable: true }));
    expect(sent.at(-1)).toEqual({ type: 'save-key', key: 'sk-secret' });
    expect(input.value).toBe('');
    port.receive({ type: 'state', provider: 'openai', model: 'gpt-x', missing: '' });
    const forget = document.querySelector<HTMLButtonElement>('button[type="button"]');
    expect(forget?.disabled).toBe(false);
    forget?.click();
    expect(sent.at(-1)).toEqual({ type: 'forget-key' });
  });
});
