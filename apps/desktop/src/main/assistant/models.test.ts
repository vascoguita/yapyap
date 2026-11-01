import { describe, expect, it, vi } from 'vitest';
import {
  autoModel,
  keptModels,
  keyProblem,
  MAX_MODELS,
  modelsOf,
  type ListTarget,
} from './models.ts';

const CLAUDE: ListTarget = {
  provider: 'anthropic',
  key: 'sk',
  endpoint: '',
  privateModel: undefined,
};

const LOCAL: ListTarget = { ...CLAUDE, provider: 'local', endpoint: 'http://localhost:11435/v1' };

const LISTED = [
  { id: 'claude-opus-5-5', label: 'Claude Opus 5.5' },
  { id: 'claude-haiku-5-5', label: 'Claude Haiku 5.5' },
];

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
    await expect(modelsOf(CLAUDE, server.fetch)).resolves.toEqual(LISTED);
    expect(server.urls[0]).toMatch(/^https:\/\/api\.anthropic\.com\/v1\/models\?limit=20/);
  });

  it('lists OpenAI’s chat models newest first, and everything a local server serves', async () => {
    const openai = serving(
      served(['gpt-old', 'text-embedding-3', 'whisper-1', 'gpt-new'], (index) => index),
    );
    await expect(modelsOf({ ...CLAUDE, provider: 'openai' }, openai.fetch)).resolves.toEqual([
      { id: 'gpt-new', label: 'gpt-new' },
      { id: 'gpt-old', label: 'gpt-old' },
    ]);
    expect(openai.urls[0]).toMatch(/^https:\/\/api\.openai\.com\/v1\/models/);
    const local = serving((url) =>
      url.endsWith('/api/tags') ? new Response('not json') : served(['b', 'nomic-embed'])(),
    );
    await expect(modelsOf(LOCAL, local.fetch)).resolves.toEqual([
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
    await expect(modelsOf(LOCAL, local.fetch)).resolves.toEqual([
      { id: 'small', label: 'small' },
      { id: 'big', label: 'big' },
      { id: 'odd', label: 'odd' },
    ]);
    expect(local.urls).toContain('http://localhost:11435/api/tags');
    const bare = serving((url) => (url.endsWith('/api/tags') ? json({})() : served(['x'])()));
    await expect(modelsOf({ ...LOCAL, key: '' }, bare.fetch)).resolves.toEqual([
      { id: 'x', label: 'x' },
    ]);
  });

  it('lists none when the provider refuses, and at most as many as Settings shows', async () => {
    const refused = serving(json({ type: 'error', error: { type: 'auth', message: 'no' } }, 401));
    await expect(modelsOf(CLAUDE, refused.fetch)).resolves.toEqual([]);
    const many = serving(served(Array.from({ length: 30 }, (_, index) => `m${String(index)}`)));
    await expect(modelsOf(LOCAL, many.fetch)).resolves.toHaveLength(MAX_MODELS);
  });

  it('lists the downloaded private model by a plain name, without asking anyone', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>();
    const target: ListTarget = {
      ...CLAUDE,
      provider: 'built-in',
      privateModel: { id: 'qwen-1.5b', name: 'Qwen2.5 1.5B' },
    };
    const listed = await modelsOf(target, fetch);
    expect(listed).toEqual([{ id: 'qwen-1.5b', label: 'Private model (Qwen2.5 1.5B)' }]);
    expect(autoModel('built-in', listed)).toEqual(listed[0]);
    await expect(modelsOf({ ...target, privateModel: undefined }, fetch)).resolves.toEqual([]);
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe('keyProblem', () => {
  it('asks the provider for its models with the key, and names what failed', async () => {
    const claudeOk = serving(claudeList([claude('claude-haiku-5-5', 'Claude Haiku 5.5')]));
    await expect(keyProblem('anthropic', 'sk', claudeOk.fetch)).resolves.toBe('');
    const refused = serving(json({ type: 'error', error: { type: 'auth', message: 'no' } }, 401));
    await expect(keyProblem('anthropic', 'bad', refused.fetch)).resolves.toBe('auth');
    const openai = serving(served(['gpt-new']));
    await expect(keyProblem('openai', 'sk', openai.fetch)).resolves.toBe('');
    const down = serving(json({ error: { message: 'busy' } }, 429));
    await expect(keyProblem('openai', 'sk', down.fetch)).resolves.toBe('rate-limited');
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
    expect(autoModel('local', openai)?.id).toBe('gpt-new');
    expect(autoModel('local', [])).toBeUndefined();
  });
});

describe('keptModels', () => {
  it('keeps a provider’s list a while, per provider and key, then asks again', async () => {
    let clock = 0;
    const list = vi.fn(() => Promise.resolve([...LISTED]));
    const fetch = vi.fn<typeof globalThis.fetch>();
    const kept = keptModels(list, () => clock);
    await kept(CLAUDE, fetch);
    await kept(CLAUDE, fetch);
    expect(list).toHaveBeenCalledOnce();
    await kept({ ...CLAUDE, key: 'other' }, fetch);
    expect(list).toHaveBeenCalledTimes(2);
    clock = 600_001;
    await expect(kept(CLAUDE, fetch)).resolves.toEqual(LISTED);
    expect(list).toHaveBeenCalledTimes(3);
  });

  it('asks again next time when the provider listed nothing', async () => {
    const list = vi.fn(() => Promise.resolve([]));
    const kept = keptModels(list);
    await kept(CLAUDE, vi.fn());
    await kept(CLAUDE, vi.fn());
    expect(list).toHaveBeenCalledTimes(2);
  });
});
