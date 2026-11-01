import { join, resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { hostScript } from './host-script.ts';
import {
  confineExtensionRequests,
  HOST_PAGE,
  panelPage,
  EXTENSION_CSP,
  serveExtensionFiles,
  type ExtensionSource,
} from './extension-files.ts';
import { PANEL_STYLE } from './panel-style.ts';

const ID = 'org.example.hello';
const FOLDER = resolve('/extensions', ID, '1.0.0');

function setup(
  files: Readonly<Record<string, string>> = { 'main.js': 'export default {};' },
  panel?: string,
) {
  const readFile = vi.fn((path: string) => {
    const name = Object.keys(files).find((file) => join(FOLDER, file) === path);
    return name === undefined
      ? Promise.reject(new Error('ENOENT'))
      : Promise.resolve(new TextEncoder().encode(files[name]));
  });
  let source: ExtensionSource | undefined = { folder: FOLDER, entry: 'main.js', panel };
  const serve = serveExtensionFiles(ID, () => source, readFile);
  return {
    readFile,
    get: (url: string) => serve({ url }),
    stop: () => {
      source = undefined;
    },
  };
}

describe('serveExtensionFiles', () => {
  it('serves a page that starts YapYap’s bootstrap, which loads the entry, under the extension CSP', async () => {
    const t = setup();
    const page = await t.get(`extension://${ID}/`);
    expect(page.status).toBe(200);
    expect(page.headers.get('content-type')).toBe('text/html; charset=utf-8');
    expect(page.headers.get('content-security-policy')).toBe(EXTENSION_CSP);
    expect(await page.text()).toBe(HOST_PAGE);
    expect(HOST_PAGE).toContain('src="/__yapyap/host.js"');
    const script = await t.get(`extension://${ID}/__yapyap/host.js`);
    expect(script.headers.get('content-type')).toBe('text/javascript');
    expect(script.headers.get('content-security-policy')).toBe(EXTENSION_CSP);
    expect(await script.text()).toBe(hostScript('main.js'));
  });

  it('serves the page of the extension’s panel, if it has one, under the extension CSP', async () => {
    const page = await setup(undefined, 'ui/panel.js').get(`extension://${ID}/__yapyap/panel.html`);
    expect(page.headers.get('content-type')).toBe('text/html; charset=utf-8');
    expect(page.headers.get('content-security-policy')).toBe(EXTENSION_CSP);
    expect(await page.text()).toBe(panelPage('ui/panel.js'));
    expect(panelPage('ui/panel.js')).toContain('<script type="module" src="/ui/panel.js">');
    expect(panelPage('ui/panel.js')).toContain(
      '<link rel="stylesheet" href="/__yapyap/panel.css">',
    );
    expect((await setup().get(`extension://${ID}/__yapyap/panel.html`)).status).toBe(404);
  });

  it('serves YapYap’s panel style under the extension CSP, which no extension file replaces', async () => {
    const style = await setup({ '__yapyap/panel.css': 'body { color: red }' }).get(
      `extension://${ID}/__yapyap/panel.css`,
    );
    expect(style.headers.get('content-type')).toBe('text/css');
    expect(style.headers.get('content-security-policy')).toBe(EXTENSION_CSP);
    expect(await style.text()).toBe(PANEL_STYLE);
    expect(PANEL_STYLE).toContain('--yapyap-accent');
  });

  it('serves the extension’s files with their types, and nothing it did not ship', async () => {
    const t = setup({ 'main.js': 'export default {};', 'icon.SVG': '<svg/>', 'data.bin': 'x' });
    const script = await t.get(`extension://${ID}/main.js`);
    expect(script.headers.get('content-type')).toBe('text/javascript');
    expect(script.headers.get('x-content-type-options')).toBe('nosniff');
    expect(script.headers.get('content-security-policy')).toBe(EXTENSION_CSP);
    expect(await script.text()).toBe('export default {};');
    expect((await t.get(`extension://${ID}/icon.SVG`)).headers.get('content-type')).toBe(
      'image/svg+xml',
    );
    expect((await t.get(`extension://${ID}/data.bin`)).headers.get('content-type')).toBe(
      'application/octet-stream',
    );
    const missing = await t.get(`extension://${ID}/missing.js`);
    expect(missing.status).toBe(404);
    expect(missing.headers.get('content-type')).toBe('text/plain');
  });

  it('names the type of every kind of file an extension may ship, and lets nothing cache them', async () => {
    const types = {
      'a.mjs': 'text/javascript',
      'a.css': 'text/css',
      'a.json': 'application/json',
      'a.png': 'image/png',
      'a.jpg': 'image/jpeg',
      'a.jpeg': 'image/jpeg',
      'a.gif': 'image/gif',
      'a.webp': 'image/webp',
      'a.woff2': 'font/woff2',
      'a.txt': 'text/plain; charset=utf-8',
      'a.wasm': 'application/octet-stream',
    };
    const t = setup(Object.fromEntries(Object.keys(types).map((name) => [name, 'x'])));
    for (const [name, type] of Object.entries(types)) {
      const file = await t.get(`extension://${ID}/${name}`);
      expect(file.headers.get('content-type')).toBe(type);
      expect(file.headers.get('cache-control')).toBe('no-store');
    }
  });

  it('never serves a file outside the extension’s folder, or another extension’s', async () => {
    const t = setup();
    for (const url of [
      `extension://${ID}/..%2F..%2F.extensions.json`,
      `extension://${ID}/%2E%2E%2F1.0.1/main.js`,
      `extension://${ID}/%E0%A4%A`,
      `extension://org.example.other/main.js`,
      `app://${ID}/main.js`,
    ]) {
      expect((await t.get(url)).status).toBe(404);
    }
    expect(t.readFile).not.toHaveBeenCalled();
  });

  it('serves nothing once the extension has stopped', async () => {
    const t = setup();
    t.stop();
    expect((await t.get(`extension://${ID}/`)).status).toBe(404);
  });
});

/** Every response YapYap serves an extension: its pages, its bootstrap and style, its files, and a miss. */
const EVERY_KIND = [
  '/',
  '/__yapyap/host.js',
  '/__yapyap/panel.html',
  '/__yapyap/panel.css',
  '/main.js',
  '/engine.wasm',
];

const headersOf = (response: Response): [string, string][] => [...response.headers.entries()];

describe('serveExtensionFiles, headers', () => {
  const files = { 'main.js': 'export default {};', 'engine.wasm': '\0asm\x01\0\0\0' };

  it('serves every response under the extension CSP, uncached and unsniffed', async () => {
    const t = setup(files, 'main.js');
    for (const path of EVERY_KIND) {
      const response = await t.get(`extension://${ID}${path}`);
      expect(headersOf(response).filter(([name]) => name !== 'content-type')).toEqual([
        ['cache-control', 'no-store'],
        [
          'content-security-policy',
          "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; " +
            'connect-src https: http://localhost:* http://127.0.0.1:* http://[::1]:*; ' +
            "base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
        ],
        ['x-content-type-options', 'nosniff'],
      ]);
    }
  });
});

describe('confineExtensionRequests', () => {
  it('lets through only what the policy allows, and nothing when the policy fails', async () => {
    const decide = vi.fn((url: string) =>
      url === 'boom' ? Promise.reject(new Error('boom')) : Promise.resolve(url === 'ok'),
    );
    const filter = confineExtensionRequests(decide);
    const answer = async (url: string) => {
      const callback = vi.fn();
      filter({ url }, callback);
      await vi.waitFor(() => {
        expect(callback).toHaveBeenCalledOnce();
      });
      return callback.mock.calls[0]?.[0] as { cancel: boolean };
    };
    expect(await answer('ok')).toEqual({ cancel: false });
    expect(await answer('no')).toEqual({ cancel: true });
    expect(await answer('boom')).toEqual({ cancel: true });
  });

  it('lets HTTPS and this computer’s HTTP reach the policy, and keeps everything else to the extension', () => {
    expect(EXTENSION_CSP).toBe(
      "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src https: http://localhost:* http://127.0.0.1:* http://[::1]:*; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
    );
  });
});
