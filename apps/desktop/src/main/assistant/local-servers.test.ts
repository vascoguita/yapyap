import { describe, expect, it, vi } from 'vitest';
import {
  findLocalModels,
  LIST_MAX_BYTES,
  loopbackRequest,
  MODEL_SERVER_PORTS,
  modelIds,
  modelServerPorts,
  PROBE_TIMEOUT_MS,
} from './local-servers.ts';

const listing = (...ids: unknown[]) => ({ object: 'list', data: ids.map((id) => ({ id })) });

const answer = (body: unknown, status = 200) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));

describe('modelIds', () => {
  it('reads the IDs of an OpenAI-style list of models, in its order', () => {
    expect(modelIds(listing('llama3.2:1b', 'hf.co/org/model:Q4_K_M'))).toEqual([
      'llama3.2:1b',
      'hf.co/org/model:Q4_K_M',
    ]);
    expect(modelIds(listing())).toEqual([]);
  });

  it('takes no list from anything else', () => {
    expect(modelIds(null)).toBeUndefined();
    expect(modelIds('<html>')).toBeUndefined();
    expect(modelIds({ models: [{ name: 'llama3.2:1b' }] })).toBeUndefined();
    expect(modelIds({ data: { id: 'llama3.2:1b' } })).toBeUndefined();
  });

  it('keeps only short, plain IDs, and twenty at most', () => {
    const ids = modelIds({
      data: [
        { id: 'a'.repeat(200) },
        { id: 'b'.repeat(201) },
        { id: '' },
        { id: 'line\nbreak' },
        { id: 7 },
        null,
        'c',
        { id: 'ok' },
      ],
    });
    expect(ids).toEqual(['a'.repeat(200), 'ok']);
    const many = Array.from({ length: 25 }, (_, index) => `m${String(index)}`);
    expect(modelIds(listing(...many))).toEqual(many.slice(0, 20));
  });
});

describe('findLocalModels', () => {
  it('asks each port on 127.0.0.1 for its models at once, and names the servers that answer', async () => {
    const started: string[] = [];
    let release: () => void = () => undefined;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const request = vi.fn(async (url: string) => {
      started.push(url);
      await held;
      return url.includes(':11435/')
        ? new Response(JSON.stringify(listing('tiny')))
        : new Response(JSON.stringify(listing('big', 'small')));
    });
    const finding = findLocalModels({ ports: [11434, 11435], request });
    await vi.waitFor(() => {
      expect(started).toEqual([
        'http://127.0.0.1:11434/v1/models',
        'http://127.0.0.1:11435/v1/models',
      ]);
    });
    release();
    await expect(finding).resolves.toEqual([
      {
        server: 'localhost:11434',
        endpoint: 'http://localhost:11434/v1',
        models: ['big', 'small'],
      },
      { server: 'localhost:11435', endpoint: 'http://localhost:11435/v1', models: ['tiny'] },
    ]);
  });

  it('leaves out servers that fail, refuse, answer junk or answer too much', async () => {
    const request = vi.fn((url: string) => {
      const port = new URL(url).port;
      switch (port) {
        case '1':
          return Promise.reject(new Error('ECONNREFUSED'));
        case '2':
          return answer(listing('a'), 404);
        case '3':
          return Promise.resolve(new Response('not json'));
        case '4':
          return Promise.resolve(new Response('x'.repeat(LIST_MAX_BYTES + 1)));
        case '5':
          return answer({ error: 'no such route' });
        default:
          return answer(listing());
      }
    });
    await expect(findLocalModels({ ports: [1, 2, 3, 4, 5, 6], request })).resolves.toEqual([
      { server: 'localhost:6', endpoint: 'http://localhost:6/v1', models: [] },
    ]);
  });

  it('reads a list right at the size limit', async () => {
    const id = 'm'.repeat(200);
    const body = JSON.stringify(listing(id));
    const padded = body.padEnd(LIST_MAX_BYTES, ' ');
    const request = () => Promise.resolve(new Response(padded));
    await expect(findLocalModels({ ports: [1234], request })).resolves.toEqual([
      { server: 'localhost:1234', endpoint: 'http://localhost:1234/v1', models: [id] },
    ]);
  });

  it('names four servers at most', async () => {
    const request = () => answer(listing('a'));
    const found = await findLocalModels({ ports: [1, 2, 3, 4, 5], request });
    expect(found.map(({ server }) => server)).toEqual([
      'localhost:1',
      'localhost:2',
      'localhost:3',
      'localhost:4',
    ]);
  });

  it('asks no port that no server can have', async () => {
    const request = vi.fn(() => answer(listing('a')));
    await expect(findLocalModels({ ports: [123_456, 0, 1.5, 8080], request })).resolves.toEqual([
      { server: 'localhost:8080', endpoint: 'http://localhost:8080/v1', models: ['a'] },
    ]);
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('looks where Ollama, Alpaca, LM Studio and llama.cpp listen', () => {
    expect(MODEL_SERVER_PORTS).toEqual([11434, 11435, 1234, 8080]);
  });
});

describe('loopbackRequest', () => {
  it('follows no redirect, sends no credentials and asks for JSON', async () => {
    const fetcher = vi.fn<typeof fetch>(() => Promise.resolve(new Response('')));
    await loopbackRequest(fetcher)('http://127.0.0.1:11434/v1/models');
    const [url, init] = fetcher.mock.calls[0] ?? [];
    expect(url).toBe('http://127.0.0.1:11434/v1/models');
    expect(init).toMatchObject({
      redirect: 'error',
      credentials: 'omit',
      headers: { accept: 'application/json' },
    });
    expect(init?.signal?.aborted).toBe(false);
    expect(PROBE_TIMEOUT_MS).toBe(1500);
  });

  it('gives up once the server takes too long', async () => {
    const fetcher = vi.fn<typeof fetch>(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            reject(new Error('aborted'));
          });
        }),
    );
    await expect(loopbackRequest(fetcher, 10)('http://127.0.0.1:1/')).rejects.toThrow('aborted');
  });
});

describe('modelServerPorts', () => {
  it('uses the usual ports, unless an unpackaged build is given others for tests', () => {
    expect(modelServerPorts({}, false)).toBe(MODEL_SERVER_PORTS);
    const env = { YAPYAP_TEST_MODEL_PORTS: '40001,40002' };
    expect(modelServerPorts(env, false)).toEqual([40001, 40002]);
    expect(modelServerPorts(env, true)).toBe(MODEL_SERVER_PORTS);
  });

  it('ignores a list that is not up to four real ports', () => {
    for (const given of ['', 'x', '0', '65536', '1.5', '1,2,3,4,5', '80;81', '80,x']) {
      expect(modelServerPorts({ YAPYAP_TEST_MODEL_PORTS: given }, false)).toBe(MODEL_SERVER_PORTS);
    }
    expect(modelServerPorts({ YAPYAP_TEST_MODEL_PORTS: '1,65535,3,4' }, false)).toEqual([
      1, 65_535, 3, 4,
    ]);
  });
});
