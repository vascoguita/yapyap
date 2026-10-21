import { describe, expect, it } from 'vitest';
import { jsonFetcher, optionalFileReader, resolveConfig } from './environment.ts';

describe('resolveConfig', () => {
  it('prefers the automation token and defaults the base branch', () => {
    expect(
      resolveConfig({ AUTOMATION_TOKEN: 'a', GITHUB_TOKEN: 'g', GITHUB_REPOSITORY: 'o/r' }),
    ).toEqual({
      token: 'a',
      repository: 'o/r',
      base: 'master',
    });
  });

  it('skips an empty automation token, as Actions passes for unset secrets', () => {
    expect(
      resolveConfig({ AUTOMATION_TOKEN: '', GITHUB_TOKEN: 'g', GITHUB_REPOSITORY: 'o/r' }).token,
    ).toBe('g');
  });

  it('falls back to the workflow token and honours BASE_BRANCH', () => {
    expect(
      resolveConfig({ GITHUB_TOKEN: 'g', GITHUB_REPOSITORY: 'o/r', BASE_BRANCH: 'dev' }),
    ).toEqual({
      token: 'g',
      repository: 'o/r',
      base: 'dev',
    });
  });

  it.each([{}, { GITHUB_TOKEN: '', GITHUB_REPOSITORY: 'o/r' }, { GITHUB_TOKEN: 'g' }])(
    'rejects %o',
    (env) => {
      expect(() => resolveConfig(env)).toThrow('required');
    },
  );
});

describe('optionalFileReader', () => {
  it('returns file contents, undefined for missing files, and rethrows other errors', async () => {
    const read = optionalFileReader((path) => {
      if (path === 'ok') {
        return Promise.resolve('data');
      }
      const error = Object.assign(new Error(path), {
        code: path === 'missing' ? 'ENOENT' : 'EACCES',
      });
      return Promise.reject(error);
    });
    expect(await read('ok')).toBe('data');
    expect(await read('missing')).toBeUndefined();
    await expect(read('denied')).rejects.toThrow('denied');
  });
});

describe('jsonFetcher', () => {
  it('parses successful responses and rejects failures', async () => {
    const fetchJson = jsonFetcher((url) =>
      Promise.resolve(url === 'ok' ? Response.json({ a: 1 }) : new Response(null, { status: 503 })),
    );
    expect(await fetchJson('ok')).toEqual({ a: 1 });
    await expect(fetchJson('down')).rejects.toThrow('failed with 503');
  });
});
