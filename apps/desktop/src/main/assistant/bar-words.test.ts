import { describe, expect, it } from 'vitest';
import { problemWords, providerTitle, setupWords } from './bar-words.ts';
import type { Setup } from './setup.ts';

const SETUP: Setup = {
  provider: 'anthropic',
  missing: '',
  models: [],
  auto: undefined,
  model: '',
  key: '',
  endpoint: '',
};

describe('providerTitle', () => {
  it('names each provider as a sentence starts, and none before one is set up', () => {
    expect(providerTitle('anthropic')).toBe('Claude (Anthropic)');
    expect(providerTitle('server')).toBe('Your model server');
    expect(providerTitle(undefined)).toBe('');
  });
});

describe('setupWords', () => {
  it('says what is missing, with the button to Settings that mends it', () => {
    const key = setupWords({ ...SETUP, missing: 'key' });
    expect(key.status).toContain('Claude');
    expect(key.fix).toEqual({ label: 'Paste a Key…' });
    expect(setupWords({ ...SETUP, missing: 'model', provider: 'server' }).status).toBe(
      'Your model server does not answer. Check its address, and that it runs, then try again.',
    );
    const model = setupWords({ ...SETUP, missing: 'model' });
    expect(model.status).toContain('listed no model');
    expect(model.fix).toEqual({ label: 'Open Settings' });
    expect(setupWords({ ...SETUP, missing: 'setup' })).toEqual({
      status: 'Set up the AI assistant to start: choose a provider.',
      fix: { label: 'Set Up…' },
    });
    expect(setupWords({ ...SETUP, missing: 'setup', provider: 'server' }).status).toBe(
      'Type your model server’s address in Settings to start.',
    );
  });
});

describe('problemWords', () => {
  it('explains a failed request, with a fix only where a key would mend it', () => {
    expect(problemWords('auth', 'anthropic').fix?.label).toBe('Paste a Key…');
    for (const kind of [
      'rate-limited',
      'network',
      'timeout',
      'refused',
      'bad-request',
      'cancelled',
      'failed',
    ] as const) {
      const words = problemWords(kind, 'openai');
      expect(words.status).not.toBe('');
      expect(words.fix).toBeUndefined();
    }
  });
});
