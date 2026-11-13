import { describe, expect, it } from 'vitest';
import { problemWords, privateWords, providerTitle, setupWords } from './bar-words.ts';
import type { PrivateModelStatus } from './private/private-model.ts';
import type { Setup } from './setup.ts';

const MODEL: PrivateModelStatus = {
  model: { id: 'qwen', name: 'Qwen', url: 'https://huggingface.co/q', size: 1000, sha256: 'a' },
  phase: { kind: 'none' },
  smaller: true,
  used: 0,
};

const SETUP: Setup = {
  provider: 'anthropic',
  missing: '',
  models: [],
  auto: undefined,
  model: '',
  key: '',
  endpoint: '',
};

const fixOf = (words: ReturnType<typeof privateWords>) => words.fix?.action;

describe('providerTitle', () => {
  it('names each provider as a sentence starts, and none before one is set up', () => {
    expect(providerTitle('built-in')).toBe('The private model on this computer');
    expect(providerTitle('local')).toBe('The model server on this computer');
    expect(providerTitle(undefined)).toBe('');
  });
});

describe('privateWords', () => {
  it('follows the private model’s download, with the fix each phase needs', () => {
    expect(privateWords({ ...MODEL, phase: { kind: 'downloading', done: 250 } }).status).toContain(
      '25%',
    );
    expect(fixOf(privateWords({ ...MODEL, phase: { kind: 'damaged' } }))).toBe('resume');
    expect(fixOf(privateWords({ ...MODEL, phase: { kind: 'out-of-memory' } }))).toBe('smaller');
    const small = privateWords({ ...MODEL, smaller: false, phase: { kind: 'out-of-memory' } });
    expect(small.fix).toBeUndefined();
    expect(small.status).toContain('enough memory');
    expect(fixOf(privateWords(MODEL))).toBe('settings');
  });

  it('says why a download paused, and offers to resume it', () => {
    const paused = (problem: '' | 'failed' | 'disk-full') =>
      privateWords({ ...MODEL, phase: { kind: 'paused', done: 400, problem } });
    expect(paused('').status).toContain('40%');
    expect(paused('failed').status).toContain('40%');
    expect(paused('failed').status).not.toBe(paused('').status);
    expect(paused('disk-full').status).toContain('free up 1 MB');
    for (const problem of ['', 'failed', 'disk-full'] as const) {
      expect(fixOf(paused(problem))).toBe('resume');
    }
  });
});

describe('setupWords', () => {
  it('says what is missing, with the one click that mends it', () => {
    const key = setupWords({ ...SETUP, missing: 'key' }, MODEL);
    expect(key.status).toContain('Claude');
    expect(key.fix).toEqual({ action: 'settings', label: 'Paste a key…' });
    expect(setupWords({ ...SETUP, missing: 'download' }, MODEL).fix?.action).toBe('settings');
    expect(setupWords({ ...SETUP, missing: 'model', provider: 'local' }, MODEL).status).toBe(
      'The model server on this computer does not answer. Start it, then try again.',
    );
    const model = setupWords({ ...SETUP, missing: 'model' }, MODEL);
    expect(model.status).toContain('listed no model');
    expect(model.fix).toEqual({ action: 'settings', label: 'Open settings' });
    expect(setupWords({ ...SETUP, missing: 'setup' }, MODEL)).toEqual({
      status: 'Set up the assistant to start: choose where it thinks.',
      fix: { action: 'settings', label: 'Set up…' },
    });
  });
});

describe('problemWords', () => {
  it('explains a failed request, with a fix only where one click mends it', () => {
    expect(problemWords('auth', 'anthropic', true).fix?.label).toBe('Paste a key…');
    expect(problemWords('out-of-memory', 'built-in', true).fix?.action).toBe('smaller');
    expect(problemWords('out-of-memory', 'built-in', false).fix).toBeUndefined();
    for (const kind of [
      'rate-limited',
      'network',
      'timeout',
      'refused',
      'bad-request',
      'cancelled',
      'failed',
    ] as const) {
      const words = problemWords(kind, 'openai', true);
      expect(words.status).not.toBe('');
      expect(words.fix).toBeUndefined();
    }
  });
});
