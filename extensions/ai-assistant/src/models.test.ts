import { describe, expect, it, vi } from 'vitest';
import {
  AUTO,
  autoModel,
  currentSetup,
  keptModels,
  MAX_MODELS,
  MODEL_KEY,
  modelsOf,
} from './models.ts';
import type { AssistantSettings } from './settings.ts';
import { fakeHost } from './testing/fake-host.ts';
import { LISTED, listing } from './testing/models.ts';

const SETTINGS: AssistantSettings = {
  provider: 'anthropic',
  model: '',
  endpoint: '',
  context: 10,
  localOnly: false,
};

const LOCAL: AssistantSettings = {
  ...SETTINGS,
  provider: 'compatible',
  endpoint: 'http://localhost:11435/v1',
};

/** A server that answers each request with what `answer` makes of its URL, and remembers where it was asked. */
function serving(answer: (url: string) => Response) {
  const urls: string[] = [];
  const fetch = vi.fn((url: string) => {
    urls.push(url);
    return Promise.resolve(answer(url));
  });
  return { fetch: fetch as unknown as typeof globalThis.fetch, urls };
}

const json =
  (body: object, status = 200) =>
  () =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json', 'x-should-retry': 'false' },
    });

const claude = (id: string, name: string) => ({
  type: 'model',
  id,
  display_name: name,
  created_at: '2026-01-01T00:00:00Z',
});

const claudeList = (data: readonly object[]) =>
  json({ data, has_more: false, first_id: null, last_id: null });

const served = (ids: readonly string[], created: (index: number) => number = () => 0) =>
  json({
    object: 'list',
    data: ids.map((id, index) => ({ id, object: 'model', created: created(index), owned_by: 'x' })),
  });

describe('modelsOf', () => {
  it('lists Claude’s models by name, as Anthropic orders them', async () => {
    const server = serving(
      claudeList([
        claude('claude-opus-5-5', 'Claude Opus 5.5'),
        claude('claude-haiku-5-5', 'Claude Haiku 5.5'),
      ]),
    );
    await expect(modelsOf(SETTINGS, 'sk', { fetch: server.fetch })).resolves.toEqual([
      { id: 'claude-opus-5-5', label: 'Claude Opus 5.5' },
      { id: 'claude-haiku-5-5', label: 'Claude Haiku 5.5' },
    ]);
    expect(server.urls[0]).toMatch(/^https:\/\/api\.anthropic\.com\/v1\/models\?limit=20/);
  });

  it('lists OpenAI’s chat models newest first, and everything a compatible server serves', async () => {
    const openai = serving(
      served(['gpt-old', 'text-embedding-3', 'whisper-1', 'gpt-new'], (index) => index),
    );
    await expect(
      modelsOf({ ...SETTINGS, provider: 'openai' }, 'k', { fetch: openai.fetch }),
    ).resolves.toEqual([
      { id: 'gpt-new', label: 'gpt-new' },
      { id: 'gpt-old', label: 'gpt-old' },
    ]);
    const local = serving((url) =>
      url.endsWith('/api/tags') ? new Response('not json') : served(['b', 'nomic-embed'])(),
    );
    await expect(modelsOf(LOCAL, 'k', { fetch: local.fetch })).resolves.toEqual([
      { id: 'b', label: 'b' },
      { id: 'nomic-embed', label: 'nomic-embed' },
    ]);
    expect(local.urls).toContain('http://localhost:11435/v1/models');
  });

  it('lists a local server’s smallest models first when it reports their sizes', async () => {
    const tags = { models: [{ name: 'big', size: 9 }, { name: 'small', size: 2 }, { name: 7 }] };
    const local = serving((url) =>
      url.endsWith('/api/tags') ? json(tags)() : served(['big', 'odd', 'small'])(),
    );
    await expect(modelsOf(LOCAL, 'k', { fetch: local.fetch })).resolves.toEqual([
      { id: 'small', label: 'small' },
      { id: 'big', label: 'big' },
      { id: 'odd', label: 'odd' },
    ]);
    expect(local.urls).toContain('http://localhost:11435/api/tags');
    const bare = serving((url) => (url.endsWith('/api/tags') ? json({})() : served(['x'])()));
    await expect(modelsOf(LOCAL, 'k', { fetch: bare.fetch })).resolves.toEqual([
      { id: 'x', label: 'x' },
    ]);
  });

  it('lists none when the provider refuses, and at most as many as the bar shows', async () => {
    const refused = serving(json({ type: 'error', error: { type: 'auth', message: 'no' } }, 401));
    await expect(modelsOf(SETTINGS, 'bad', { fetch: refused.fetch })).resolves.toEqual([]);
    const many = serving(served(Array.from({ length: 30 }, (_, index) => `m${String(index)}`)));
    await expect(modelsOf(LOCAL, 'k', { fetch: many.fetch })).resolves.toHaveLength(MAX_MODELS);
  });

  it('uses the page’s own fetch unless a test hands it another', async () => {
    const server = serving((url) =>
      url.includes('anthropic')
        ? claudeList([claude('claude-haiku-5-5', 'Claude Haiku 5.5')])()
        : served(['local'])(),
    );
    vi.stubGlobal('fetch', server.fetch);
    try {
      await expect(modelsOf(SETTINGS, 'sk')).resolves.toEqual([
        { id: 'claude-haiku-5-5', label: 'Claude Haiku 5.5' },
      ]);
      await expect(modelsOf(LOCAL, 'k')).resolves.toEqual([{ id: 'local', label: 'local' }]);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe('autoModel', () => {
  it('picks the newest of the provider’s quick models, or else the first listed', () => {
    expect(autoModel('anthropic', LISTED)?.id).toBe('claude-haiku-5-5');
    const named = [{ id: 'claude-x', label: 'Claude Haiku 9' }];
    expect(autoModel('anthropic', named)?.id).toBe('claude-x');
    expect(autoModel('anthropic', LISTED.slice(0, 1))?.id).toBe('claude-opus-5-5');
    const openai = [
      { id: 'gpt-new', label: 'gpt-new' },
      { id: 'gpt-new-mini', label: 'gpt-new-mini' },
    ];
    expect(autoModel('openai', openai)?.id).toBe('gpt-new-mini');
    // On this computer, the list is smallest first, so the first answers fastest.
    expect(autoModel('compatible', openai)?.id).toBe('gpt-new');
    expect(autoModel('compatible', [])).toBeUndefined();
  });
});

describe('keptModels', () => {
  it('keeps a provider’s list a while, per provider and key, then asks again', async () => {
    let clock = 0;
    const list = listing();
    const kept = keptModels(list, () => clock);
    await kept(SETTINGS, 'sk');
    await kept(SETTINGS, 'sk');
    expect(list).toHaveBeenCalledOnce();
    await kept(SETTINGS, 'other');
    await kept(LOCAL, 'sk');
    expect(list).toHaveBeenCalledTimes(3);
    clock = 10 * 60_000 + 1;
    await kept(SETTINGS, 'sk');
    expect(list).toHaveBeenCalledTimes(4);
  });
});

describe('currentSetup', () => {
  it('uses Auto’s model until the user picks one the provider still lists', async () => {
    const fake = fakeHost();
    fake.secrets.set('apiKey.anthropic', 'sk');
    const list = listing();
    await expect(currentSetup(fake.host, list)).resolves.toMatchObject({
      settings: { model: 'claude-haiku-5-5' },
      key: 'sk',
      picked: AUTO,
      models: LISTED,
      auto: LISTED[1],
    });
    fake.stored.set(MODEL_KEY, 'claude-opus-5-5');
    await expect(currentSetup(fake.host, list)).resolves.toMatchObject({
      settings: { model: 'claude-opus-5-5' },
      picked: 'claude-opus-5-5',
    });
    // A model the provider no longer lists falls back to Auto.
    fake.stored.set(MODEL_KEY, 'claude-gone');
    await expect(currentSetup(fake.host, list)).resolves.toMatchObject({
      settings: { model: 'claude-haiku-5-5' },
      picked: 'claude-gone',
    });
  });

  it('asks no provider before the assistant is set up, and has no model then', async () => {
    const fake = fakeHost();
    fake.stored.set(MODEL_KEY, 7);
    const list = listing();
    await expect(currentSetup(fake.host, list)).resolves.toMatchObject({
      settings: { model: '' },
      picked: AUTO,
      models: [],
      auto: undefined,
    });
    expect(list).not.toHaveBeenCalled();
  });
});
