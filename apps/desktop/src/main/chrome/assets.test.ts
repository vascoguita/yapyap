import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { CHROME_CSP, createChromeHandler, resolveChromeAsset } from './assets.ts';

const ROOT = join('/app', 'renderer');

describe('resolveChromeAsset', () => {
  it.each([
    ['app://chrome/about.html', 'about.html', 'text/html; charset=utf-8'],
    ['app://chrome/assets/about-1.js', 'assets/about-1.js', 'text/javascript; charset=utf-8'],
    ['app://chrome/assets/about-1.css?v=2#x', 'assets/about-1.css', 'text/css; charset=utf-8'],
    ['app://chrome/icon.svg', 'icon.svg', 'image/svg+xml'],
    ['app://chrome/logo.png', 'logo.png', 'image/png'],
    ['app://chrome/fonts/a.woff2', 'fonts/a.woff2', 'font/woff2'],
    ['app://chrome/my%20page.html', 'my page.html', 'text/html; charset=utf-8'],
  ])('serves %s from the renderer folder', (url, file, contentType) => {
    expect(resolveChromeAsset(url, ROOT)).toEqual({ path: join(ROOT, file), contentType });
  });

  it.each([
    'app://evil/about.html',
    'app://chrome:1/about.html',
    'https://chrome/about.html',
    'app://chrome/..%2f..%2fetc/passwd.html',
    'app://chrome/assets/..%2f..%2f..%2fsecret.html',
    'app://chrome/',
    'app://chrome/about',
    'app://chrome/script.exe',
    'app://chrome/%E0%A4%A.html',
    'not a url',
  ])('refuses %s', (url) => {
    expect(resolveChromeAsset(url, ROOT)).toBeUndefined();
  });

  it('keeps dot segments that the URL parser resolves inside the root', () => {
    for (const url of ['app://chrome/../about.html', 'app://chrome/%2e%2e/about.html']) {
      expect(resolveChromeAsset(url, ROOT)?.path).toBe(join(ROOT, 'about.html'));
    }
  });

  it('refuses a sibling folder whose name starts with the root', () => {
    expect(resolveChromeAsset('app://chrome/..%2frenderer-evil/a.html', ROOT)).toBeUndefined();
  });
});

describe('createChromeHandler', () => {
  it('serves files with the strict CSP and nosniff headers', async () => {
    const readFile = vi.fn(() => Promise.resolve(new TextEncoder().encode('<p>hi</p>')));
    const response = await createChromeHandler(ROOT, readFile)({ url: 'app://chrome/about.html' });
    expect(readFile).toHaveBeenCalledWith(join(ROOT, 'about.html'));
    expect(response.status).toBe(200);
    expect(Object.fromEntries(response.headers)).toEqual({
      'content-type': 'text/html; charset=utf-8',
      'content-security-policy': CHROME_CSP,
      'x-content-type-options': 'nosniff',
    });
    expect(await response.text()).toBe('<p>hi</p>');
  });

  it('answers 404 for refused URLs without touching the disk, and for missing files', async () => {
    const readFile = vi.fn(() => Promise.reject(new Error('ENOENT')));
    const handler = createChromeHandler(ROOT, readFile);
    expect((await handler({ url: 'app://chrome/..%2f..%2fx.html' })).status).toBe(404);
    expect(readFile).not.toHaveBeenCalled();
    expect((await handler({ url: 'app://chrome/missing.html' })).status).toBe(404);
  });

  it('allows only the chrome own resources in its CSP', () => {
    expect(CHROME_CSP).toBe(
      "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
    );
  });
});
