import { describe, expect, it, vi } from 'vitest';
import {
  checkAddress,
  isPublicAddress,
  publicGet,
  readCapped,
  Refused,
  type HttpGet,
  type PublicNetwork,
  type Resolve,
} from './public-fetch.ts';

const PUBLIC = '93.184.215.14';

/** Every host resolves to `addresses`, unless `byHost` lists its own. */
const resolving =
  (
    addresses: readonly string[],
    byHost: Readonly<Record<string, readonly string[]>> = {},
  ): Resolve =>
  (host) =>
    Promise.resolve(
      (byHost[host] ?? addresses).map((address) => ({
        address,
        family: address.includes(':') ? 6 : 4,
      })),
    );

const stream = (...chunks: number[]) =>
  new ReadableStream<Uint8Array>({
    start(controller) {
      for (const size of chunks) {
        controller.enqueue(new Uint8Array(size).fill(size));
      }
      controller.close();
    },
  });

const redirect = (location: string | undefined, status = 302) =>
  Promise.resolve(
    new Response(null, {
      status,
      headers: location === undefined ? {} : { location },
    }),
  );

describe('isPublicAddress', () => {
  it.each([
    '0.0.0.0',
    '10.1.2.3',
    '100.64.0.1',
    '127.0.0.1',
    '169.254.169.254',
    '172.16.0.1',
    '172.31.255.255',
    '192.0.0.8',
    '192.168.1.1',
    '198.18.0.1',
    '224.0.0.1',
    '255.255.255.255',
  ])('refuses the IPv4 address %s', (address) => {
    expect(isPublicAddress({ address, family: 4 })).toBe(false);
  });

  it.each([
    '::',
    '::1',
    '64:ff9b::a9fe:a9fe',
    'fc00::1',
    'fd12:3456::1',
    'fe80::1',
    'ff02::1',
    '::ffff:127.0.0.1',
    '::ffff:169.254.169.254',
  ])('refuses the IPv6 address %s', (address) => {
    expect(isPublicAddress({ address, family: 6 })).toBe(false);
  });

  it('accepts public addresses, and only in their own family', () => {
    expect(isPublicAddress({ address: PUBLIC, family: 4 })).toBe(true);
    expect(isPublicAddress({ address: '172.32.0.1', family: 4 })).toBe(true);
    expect(isPublicAddress({ address: '2606:4700::1111', family: 6 })).toBe(true);
    expect(isPublicAddress({ address: PUBLIC, family: 6 })).toBe(false);
    expect(isPublicAddress({ address: 'example.org', family: 4 })).toBe(false);
  });
});

describe('checkAddress', () => {
  const check = (url: string, resolve: Resolve = resolving([PUBLIC])) =>
    checkAddress(new URL(url), resolve);

  it('accepts HTTPS to a host whose every address is public', async () => {
    await expect(check('https://downloads.example.org/x')).resolves.toBeUndefined();
    await expect(check('https://[2606:4700::1111]/x')).resolves.toBeUndefined();
  });

  it.each([
    ['http://downloads.example.org/x', 'must use https:'],
    ['ftp://downloads.example.org/x', 'must use https:'],
    ['https://user@downloads.example.org/x', 'user name or password'],
    ['https://:secret@downloads.example.org/x', 'user name or password'],
  ])('refuses %s', async (url, reason) => {
    const resolve = vi.fn(resolving([PUBLIC]));
    await expect(check(url, resolve)).rejects.toThrow(reason);
    expect(resolve).not.toHaveBeenCalled();
  });

  it('refuses an internal IP address in the URL itself, without asking DNS', async () => {
    const resolve = vi.fn(resolving([PUBLIC]));
    for (const url of ['https://127.0.0.1/x', 'https://[::1]/x', 'https://[fe80::1]/x']) {
      await expect(check(url, resolve)).rejects.toThrow(Refused);
    }
    expect(resolve).not.toHaveBeenCalled();
  });

  it('refuses a host with any internal address, or none', async () => {
    await expect(check('https://a.example/x', resolving([PUBLIC, '10.0.0.1']))).rejects.toThrow(
      'a.example resolves to an address that is not on the public internet',
    );
    await expect(check('https://a.example/x', resolving([]))).rejects.toThrow(Refused);
  });
});

describe('readCapped', () => {
  it('joins the chunks of a body within the limit', async () => {
    const abort = vi.fn();
    expect(await readCapped(stream(2, 3), 5, abort)).toEqual(new Uint8Array([2, 2, 3, 3, 3]));
    expect(await readCapped(null, 5, abort)).toEqual(new Uint8Array());
    expect(abort).not.toHaveBeenCalled();
  });

  it('aborts as soon as the body passes the limit', async () => {
    const abort = vi.fn();
    await expect(readCapped(stream(3, 3, 3), 5, abort)).rejects.toThrow(
      'the latest address served more than 5 bytes.',
    );
    expect(abort).toHaveBeenCalledOnce();
  });
});

describe('publicGet', () => {
  const network = (get: HttpGet, resolve: Resolve = resolving([PUBLIC])): PublicNetwork => ({
    get,
    resolve,
  });

  it('sends a plain GET that hands redirects back, and reads a success', async () => {
    const get = vi.fn<HttpGet>(() => Promise.resolve(new Response(new Uint8Array([1, 2]))));
    expect(await publicGet('https://a.example/x', network(get), 10)).toEqual({
      status: 200,
      bytes: new Uint8Array([1, 2]),
    });
    expect(get).toHaveBeenCalledExactlyOnceWith('https://a.example/x', {
      method: 'GET',
      redirect: 'manual',
      signal: expect.any(AbortSignal) as AbortSignal,
    });
  });

  it('refuses a success larger than the limit, aborting its request', async () => {
    let signal: AbortSignal | undefined;
    const get = vi.fn<HttpGet>((_url, init) => {
      signal = init.signal;
      return Promise.resolve(new Response(new Uint8Array(11)));
    });
    await expect(publicGet('https://a.example/x', network(get), 10)).rejects.toThrow(Refused);
    expect(signal?.aborted).toBe(true);
  });

  it('gives back any other status without reading its body', async () => {
    let signal: AbortSignal | undefined;
    const get = vi.fn<HttpGet>((_url, init) => {
      signal = init.signal;
      return Promise.resolve(new Response('Not here', { status: 404 }));
    });
    expect(await publicGet('https://a.example/x', network(get), 10)).toEqual({
      status: 404,
      bytes: undefined,
    });
    expect(signal?.aborted).toBe(true);
  });

  it('follows each redirect, relative ones too, after checking where it goes', async () => {
    const get = vi
      .fn<HttpGet>()
      .mockImplementationOnce(() => redirect('https://b.example/release', 301))
      .mockImplementationOnce(() => redirect('/file', 307))
      .mockImplementationOnce(() => Promise.resolve(new Response(new Uint8Array([7]))));
    const resolve = vi.fn(resolving([PUBLIC]));
    expect(await publicGet('https://a.example/x', network(get, resolve), 10)).toEqual({
      status: 200,
      bytes: new Uint8Array([7]),
    });
    expect(get.mock.calls.map(([url]) => url)).toEqual([
      'https://a.example/x',
      'https://b.example/release',
      'https://b.example/file',
    ]);
    expect(resolve.mock.calls.map(([host]) => host)).toEqual([
      'a.example',
      'b.example',
      'b.example',
    ]);
  });

  it.each([
    ['to an internal host', 'https://metadata.example/latest', 'not on the public internet'],
    ['to plain HTTP', 'http://a.example/latest', 'must use https:'],
    ['without a location', undefined, 'redirected without saying where'],
  ])('refuses a redirect %s, fetching nothing more', async (_case, location, reason) => {
    const get = vi.fn<HttpGet>(() => redirect(location));
    const resolve = resolving([PUBLIC], { 'metadata.example': ['169.254.169.254'] });
    await expect(publicGet('https://a.example/x', network(get, resolve), 10)).rejects.toThrow(
      reason,
    );
    expect(get).toHaveBeenCalledOnce();
  });

  it('refuses a redirect chain longer than five', async () => {
    const get = vi.fn<HttpGet>(() => redirect('https://a.example/again', 308));
    await expect(publicGet('https://a.example/x', network(get), 10)).rejects.toThrow(
      'the latest address redirected more than 5 times.',
    );
    expect(get).toHaveBeenCalledTimes(6);
  });
});
