import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ENGINE_CSP, rangeOf, serveEngineFiles } from './engine-files.ts';

let folder: string;
let model: string;

beforeEach(async () => {
  folder = await mkdtemp(join(tmpdir(), 'yapyap-engine-'));
  model = join(folder, 'model.gguf');
  await writeFile(model, '0123456789');
});

afterEach(async () => {
  await rm(folder, { recursive: true, force: true });
});

const files: Record<string, string> = {
  'engine.html': '<!doctype html>',
  'wllama.wasm': 'wasm',
  'assets/engine-Ab1_2.js': 'code',
};

function serve(ready = true) {
  const readFile = vi.fn((path: string) => {
    const name = path.slice(folder.length + 1).replaceAll('\\', '/');
    const text = files[name];
    return text === undefined
      ? Promise.reject(new Error('ENOENT'))
      : Promise.resolve(new TextEncoder().encode(text));
  });
  return serveEngineFiles({ root: folder, readFile, model: () => (ready ? model : undefined) });
}

const ask = (handler: ReturnType<typeof serve>, path: string, range?: string) =>
  handler({
    url: `app://engine${path}`,
    headers: new Headers(range === undefined ? {} : { range }),
  });

describe('serveEngineFiles', () => {
  it('serves the page, its scripts and the engine under its CSP and cross-origin isolation', async () => {
    const handler = serve();
    const page = await ask(handler, '/engine.html');
    expect(await page.text()).toBe('<!doctype html>');
    expect(page.headers.get('content-type')).toBe('text/html; charset=utf-8');
    expect(page.headers.get('content-security-policy')).toBe(ENGINE_CSP);
    expect(page.headers.get('cross-origin-opener-policy')).toBe('same-origin');
    expect(page.headers.get('cross-origin-embedder-policy')).toBe('require-corp');
    expect((await ask(handler, '/wllama.wasm')).headers.get('content-type')).toBe(
      'application/wasm',
    );
    expect(await (await ask(handler, '/assets/engine-Ab1_2.js')).text()).toBe('code');
    expect(ENGINE_CSP).toContain("script-src 'self' 'wasm-unsafe-eval'");
    expect(ENGINE_CSP).toContain("connect-src 'self'");
  });

  it('serves nothing else, and nothing on another origin', async () => {
    const handler = serve();
    for (const path of [
      '/settings.html',
      '/assets/settings-1.js',
      '/assets/engine-x.js',
      '/../x',
    ]) {
      expect((await ask(handler, path)).status).toBe(404);
    }
    const other = await handler({ url: 'app://chrome/engine.html', headers: new Headers() });
    expect(other.status).toBe(404);
  });

  it('serves the downloaded model, whole or by range, and nothing while there is none', async () => {
    const handler = serve();
    const whole = await ask(handler, '/model.gguf');
    expect([whole.status, await whole.text()]).toEqual([200, '0123456789']);
    expect(whole.headers.get('accept-ranges')).toBe('bytes');
    const part = await ask(handler, '/model.gguf', 'bytes=2-4');
    expect([part.status, await part.text()]).toEqual([206, '234']);
    expect(part.headers.get('content-range')).toBe('bytes 2-4/10');
    const bad = await ask(handler, '/model.gguf', 'bytes=20-');
    expect([bad.status, bad.headers.get('content-range')]).toEqual([416, 'bytes */10']);
    expect((await ask(serve(false), '/model.gguf')).status).toBe(404);
    await rm(model);
    expect((await ask(handler, '/model.gguf')).status).toBe(404);
  });
});

describe('rangeOf', () => {
  it('reads one byte range, from the start, to the end, or the last bytes', () => {
    expect(rangeOf(null, 10)).toBeNull();
    expect(rangeOf('bytes=2-4', 10)).toEqual([2, 4]);
    expect(rangeOf('bytes=5-', 10)).toEqual([5, 9]);
    expect(rangeOf('bytes=-3', 10)).toEqual([7, 9]);
    expect(rangeOf('bytes=-30', 10)).toEqual([0, 9]);
    expect(rangeOf('bytes=8-99', 10)).toEqual([8, 9]);
    for (const header of ['bytes=-', 'items=1-2', 'bytes=5-2', 'bytes=1-2,4-5']) {
      expect(rangeOf(header, 10)).toBeUndefined();
    }
  });
});
