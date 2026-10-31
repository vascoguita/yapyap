import { describe, expect, it } from 'vitest';
import { findModel } from './find-model.ts';
import { fakeHost } from './testing/fake-host.ts';

const server = (port: number, models: string[]) => ({
  server: `localhost:${String(port)}`,
  endpoint: `http://localhost:${String(port)}/v1`,
  models,
});

describe('findModel', () => {
  it('keeps the first server that serves a model, and only its address', async () => {
    const { host, stored } = fakeHost();
    host.localModels.find.mockResolvedValueOnce([
      server(11434, []),
      server(11435, ['tiny', 'big']),
      server(1234, ['other']),
    ]);
    await expect(findModel(host)).resolves.toBe('found');
    expect([...stored]).toEqual([['localServer', { endpoint: 'http://localhost:11435/v1' }]]);
  });

  it('tells no server from servers without models, and keeps nothing then', async () => {
    const { host, stored } = fakeHost();
    await expect(findModel(host)).resolves.toBe('no-server');
    host.localModels.find.mockResolvedValueOnce([server(11434, []), server(8080, [])]);
    await expect(findModel(host)).resolves.toBe('no-models');
    expect(stored.size).toBe(0);
  });

  it('tells a refusal and a YapYap too old to look from any other failure', async () => {
    const { host } = fakeHost();
    const fails = async (error: unknown) => {
      host.localModels.find.mockRejectedValueOnce(error);
      return findModel(host);
    };
    await expect(fails({ kind: 'not-granted', message: '' })).resolves.toBe('search-refused');
    await expect(fails({ kind: 'invalid', message: '' })).resolves.toBe('search-unsupported');
    await expect(fails({ kind: 'timeout', message: '' })).resolves.toBe('search-failed');
    await expect(fails({ kind: 'toString', message: '' })).resolves.toBe('search-failed');
    await expect(fails({ kind: 7 })).resolves.toBe('search-failed');
    await expect(fails(null)).resolves.toBe('search-failed');
  });
});
