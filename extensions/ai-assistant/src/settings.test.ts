import { describe, expect, it } from 'vitest';
import {
  assistantSettings,
  choseProvider,
  keyName,
  LOCAL_SERVER_KEY,
  missingSetting,
  missingSetup,
  offersSearch,
  providerFor,
  usesLocalServer,
} from './settings.ts';

describe('assistantSettings', () => {
  it('uses Claude until the user chooses a provider, and leaves the model to the bar', () => {
    expect(assistantSettings({})).toEqual({
      provider: 'anthropic',
      model: '',
      endpoint: '',
      context: 10,
      localOnly: false,
      source: 'default',
    });
    expect(
      assistantSettings({ provider: 'openai', model: ' gpt-x ', endpoint: 7, context: 20 }),
    ).toEqual({
      provider: 'openai',
      model: '',
      endpoint: '',
      context: 20,
      localOnly: false,
      source: 'chosen',
    });
    expect(assistantSettings({ context: 7 }).context).toBe(10);
    expect(assistantSettings({ context: 5 }).context).toBe(5);
    expect(
      assistantSettings({ provider: 'compatible', endpoint: ' https://llm.example.org/v1 ' }),
    ).toEqual({
      provider: 'compatible',
      model: '',
      endpoint: 'https://llm.example.org/v1',
      context: 10,
      localOnly: false,
      source: 'chosen',
    });
    expect(assistantSettings({ provider: 'other', model: 'claude-haiku-5-5' })).toMatchObject({
      provider: 'anthropic',
      model: '',
      source: 'default',
    });
    expect(assistantSettings({ endpoint: ' https://llm.example.org/v1 ' }).endpoint).toBe(
      'https://llm.example.org/v1',
    );
  });

  const found = { endpoint: 'http://localhost:11435/v1' };

  it('uses the model server found on this computer until the user chooses a provider', () => {
    expect(assistantSettings({ localOnly: true, context: 5 }, found)).toEqual({
      provider: 'compatible',
      model: '',
      endpoint: 'http://localhost:11435/v1',
      context: 5,
      localOnly: true,
      source: 'found',
    });
    for (const provider of ['anthropic', 'openai', 'compatible']) {
      const chosen = assistantSettings({ provider, endpoint: 'https://llm.example.org/v1' }, found);
      expect(chosen).toMatchObject({
        provider,
        endpoint: 'https://llm.example.org/v1',
        source: 'chosen',
      });
    }
    expect(choseProvider({ provider: 'openai' })).toBe(true);
    expect(choseProvider({ provider: 'other' })).toBe(false);
    expect(choseProvider({})).toBe(false);
  });

  it('takes only a server on this computer as found', () => {
    for (const kept of [
      undefined,
      null,
      'http://localhost:11434/v1',
      { endpoint: 7 },
      { endpoint: 'https://llm.example.org/v1' },
      { endpoint: 'http://192.168.1.2:11434/v1' },
    ]) {
      expect(assistantSettings({}, kept)).toMatchObject({
        provider: 'anthropic',
        source: 'default',
      });
    }
    expect(LOCAL_SERVER_KEY).toBe('localServer');
  });
});

describe('offersSearch', () => {
  it('offers to find a model only to someone who set nothing up and has no key', () => {
    expect(offersSearch(assistantSettings({}), undefined)).toBe(true);
    expect(offersSearch(assistantSettings({}), '')).toBe(true);
    expect(offersSearch(assistantSettings({ localOnly: true }), 'sk')).toBe(true);
    expect(offersSearch(assistantSettings({}), 'sk')).toBe(false);
    expect(offersSearch(assistantSettings({ provider: 'anthropic' }), undefined)).toBe(false);
    expect(offersSearch(assistantSettings({ provider: 'openai' }), undefined)).toBe(false);
    const found = assistantSettings({}, { endpoint: 'http://localhost:11434/v1' });
    expect(offersSearch(found, undefined)).toBe(false);
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

  it('names the first thing missing: the key, a secure server address, or a model to use', () => {
    expect(missingSetup(claude, undefined)).toBe('key');
    expect(missingSetup(claude, '')).toBe('key');
    expect(missingSetup(claude, 'sk')).toBe('');
    // With everything set up, only a provider that lists no model is left wanting.
    expect(missingSetting(claude, 'sk')).toBe('model');
    expect(missingSetting({ ...claude, model: 'claude-haiku-5-5' }, 'sk')).toBe('');
    expect(missingSetting(claude, undefined)).toBe('key');
    // The server found on this computer lists no model when it stopped answering.
    const found = assistantSettings({}, { endpoint: 'http://localhost:11434/v1' });
    expect(missingSetting(found, undefined)).toBe('local-server');
    expect(missingSetting({ ...found, model: 'llama' }, undefined)).toBe('');
    const local = { provider: 'compatible' } as const;
    expect(missingSetup(assistantSettings({ ...local, endpoint: 'http://x' }), 'sk')).toBe(
      'endpoint',
    );
    expect(
      missingSetup(assistantSettings({ ...local, endpoint: 'https://llm.example.org' }), 'sk'),
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

describe('local servers', () => {
  const local = (endpoint: string, extra: object = {}) =>
    assistantSettings({ provider: 'compatible', model: 'llama', endpoint, ...extra });

  it('knows a server on this computer by its address, over HTTP or HTTPS', () => {
    for (const endpoint of [
      'http://localhost:11434/v1',
      'http://127.0.0.1:8080',
      'https://localhost/v1',
      'http://[::1]:1234/v1',
    ]) {
      expect(usesLocalServer(local(endpoint))).toBe(true);
    }
    for (const endpoint of [
      'http://localhost.example.org/v1',
      'http://192.168.1.2:11434/v1',
      'ftp://localhost/',
      'http://localhost:123456/',
    ]) {
      expect(usesLocalServer(local(endpoint))).toBe(false);
    }
    const remote = assistantSettings({ provider: 'openai', endpoint: 'http://localhost:1/' });
    expect(usesLocalServer(remote)).toBe(false);
  });

  it('needs no key for a server on this computer, and takes no other address over HTTP', () => {
    expect(missingSetup(local('http://localhost:11434/v1'), undefined)).toBe('');
    expect(missingSetup(local('http://llm.example.org/v1'), 'sk')).toBe('endpoint');
    expect(missingSetup(local('http://llm.example.org/v1'), undefined)).toBe('key');
    expect(providerFor(local('http://localhost:11434/v1'), undefined).complete).toBeTypeOf(
      'function',
    );
  });

  it('asks only a server on this computer in local-only mode', () => {
    const only = { localOnly: true };
    expect(assistantSettings({ localOnly: true }).localOnly).toBe(true);
    expect(assistantSettings({ localOnly: 'yes' }).localOnly).toBe(false);
    expect(missingSetup(local('http://localhost:11434/v1', only), undefined)).toBe('');
    expect(missingSetup(local('https://llm.example.org/v1', only), 'sk')).toBe('local-only');
    expect(missingSetup(assistantSettings(only), 'sk')).toBe('local-only');
  });
});
