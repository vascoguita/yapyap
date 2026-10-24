import { join, resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  confinePluginRequests,
  hostPage,
  PLUGIN_CSP,
  pluginOrigin,
  servePluginFiles,
} from './plugin-files.ts';

const ID = 'org.example.hello';
const FOLDER = resolve('/plugins', ID, '1.0.0');

function setup(files: Readonly<Record<string, string>> = { 'main.js': 'export default {};' }) {
  const readFile = vi.fn((path: string) => {
    const name = Object.keys(files).find((file) => join(FOLDER, file) === path);
    return name === undefined
      ? Promise.reject(new Error('ENOENT'))
      : Promise.resolve(new TextEncoder().encode(files[name]));
  });
  let source: { folder: string; entry: string } | undefined = { folder: FOLDER, entry: 'main.js' };
  const serve = servePluginFiles(ID, () => source, readFile);
  return {
    readFile,
    get: (url: string) => serve({ url }),
    stop: () => {
      source = undefined;
    },
  };
}

describe('servePluginFiles', () => {
  it('serves a page that loads the entry module, under the plugin CSP', async () => {
    const t = setup();
    const page = await t.get(`plugin://${ID}/`);
    expect(page.status).toBe(200);
    expect(page.headers.get('content-type')).toBe('text/html; charset=utf-8');
    expect(page.headers.get('content-security-policy')).toBe(PLUGIN_CSP);
    expect(await page.text()).toBe(hostPage('main.js'));
    expect(hostPage('dist/my entry.js')).toContain('src="/dist/my%20entry.js"');
  });

  it('serves the plugin’s files with their types, and nothing it did not ship', async () => {
    const t = setup({ 'main.js': 'export default {};', 'icon.SVG': '<svg/>', 'data.bin': 'x' });
    const script = await t.get(`plugin://${ID}/main.js`);
    expect(script.headers.get('content-type')).toBe('text/javascript');
    expect(script.headers.get('x-content-type-options')).toBe('nosniff');
    expect(script.headers.get('content-security-policy')).toBe(PLUGIN_CSP);
    expect(await script.text()).toBe('export default {};');
    expect((await t.get(`plugin://${ID}/icon.SVG`)).headers.get('content-type')).toBe(
      'image/svg+xml',
    );
    expect((await t.get(`plugin://${ID}/data.bin`)).headers.get('content-type')).toBe(
      'application/octet-stream',
    );
    expect((await t.get(`plugin://${ID}/missing.js`)).status).toBe(404);
  });

  it('never serves a file outside the plugin’s folder, or another plugin’s', async () => {
    const t = setup();
    for (const url of [
      `plugin://${ID}/..%2F..%2F.plugins.json`,
      `plugin://${ID}/%2E%2E%2F1.0.1/main.js`,
      `plugin://${ID}/%E0%A4%A`,
      `plugin://org.example.other/main.js`,
      `app://${ID}/main.js`,
    ]) {
      expect((await t.get(url)).status).toBe(404);
    }
    expect(t.readFile).not.toHaveBeenCalled();
  });

  it('serves nothing once the plugin has stopped', async () => {
    const t = setup();
    t.stop();
    expect((await t.get(`plugin://${ID}/`)).status).toBe(404);
  });
});

describe('confinePluginRequests', () => {
  it('lets a plugin load only its own files', () => {
    const filter = confinePluginRequests(ID);
    const decide = (url: string) => {
      const callback = vi.fn();
      filter({ url }, callback);
      return callback.mock.calls[0]?.[0] as { cancel: boolean };
    };
    expect(decide(`${pluginOrigin(ID)}/main.js`)).toEqual({ cancel: false });
    expect(decide('https://example.com/')).toEqual({ cancel: true });
    expect(decide('plugin://org.example.hello.evil/main.js')).toEqual({ cancel: true });
    expect(decide('plugin://org.example.other/main.js')).toEqual({ cancel: true });
    expect(decide('wss://example.com/')).toEqual({ cancel: true });
  });
});
