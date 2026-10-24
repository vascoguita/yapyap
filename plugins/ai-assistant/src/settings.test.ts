import { describe, expect, it } from 'vitest';
import { assistantSettings, keyName, missingSetting, providerFor } from './settings.ts';

describe('assistantSettings', () => {
  it('uses Claude’s default model until the user chooses a provider and model', () => {
    expect(assistantSettings({})).toEqual({
      provider: 'anthropic',
      model: 'claude-opus-5-5',
      endpoint: '',
    });
    expect(assistantSettings({ provider: 'openai', model: ' gpt-x ', endpoint: 7 })).toEqual({
      provider: 'openai',
      model: 'gpt-x',
      endpoint: '',
    });
    expect(
      assistantSettings({ provider: 'compatible', endpoint: ' https://llm.example.org/v1 ' }),
    ).toEqual({ provider: 'compatible', model: '', endpoint: 'https://llm.example.org/v1' });
    expect(assistantSettings({ provider: 'other', model: 'claude-haiku-5-5' })).toMatchObject({
      provider: 'anthropic',
      model: 'claude-haiku-5-5',
    });
  });
});

describe('keyName', () => {
  it('keeps one key per provider', () => {
    expect(keyName('anthropic')).toBe('apiKey.anthropic');
    expect(keyName('compatible')).toBe('apiKey.compatible');
  });
});

describe('missingSetting', () => {
  const claude = assistantSettings({});

  it('names the first thing missing: the key, the model, or a secure server address', () => {
    expect(missingSetting(claude, undefined)).toBe('key');
    expect(missingSetting(claude, '')).toBe('key');
    expect(missingSetting(claude, 'sk')).toBe('');
    expect(missingSetting(assistantSettings({ provider: 'openai' }), 'sk')).toBe('model');
    const local = { provider: 'compatible', model: 'llama' } as const;
    expect(missingSetting(assistantSettings({ ...local, endpoint: 'http://x' }), 'sk')).toBe(
      'endpoint',
    );
    expect(
      missingSetting(assistantSettings({ ...local, endpoint: 'https://llm.example.org' }), 'sk'),
    ).toBe('');
  });
});

describe('providerFor', () => {
  it('makes a provider for each choice', () => {
    for (const provider of ['anthropic', 'openai', 'compatible']) {
      const settings = assistantSettings({ provider, model: 'm', endpoint: 'https://x.example' });
      expect(providerFor(settings, 'sk').complete).toBeTypeOf('function');
    }
  });
});
