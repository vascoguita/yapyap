import { join, resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { hostScript } from './host-script.ts';
import {
  confinePluginRequests,
  HOST_PAGE,
  panelPage,
  PLUGIN_CSP,
  servePluginFiles,
  type PluginSource,
} from './plugin-files.ts';

const ID = 'org.example.hello';
const FOLDER = resolve('/plugins', ID, '1.0.0');

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
  let source: PluginSource | undefined = { folder: FOLDER, entry: 'main.js', panel };
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
  it('serves a page that starts YapYap’s bootstrap, which loads the entry, under the plugin CSP', async () => {
    const t = setup();
    const page = await t.get(`plugin://${ID}/`);
    expect(page.status).toBe(200);
    expect(page.headers.get('content-type')).toBe('text/html; charset=utf-8');
    expect(page.headers.get('content-security-policy')).toBe(PLUGIN_CSP);
    expect(await page.text()).toBe(HOST_PAGE);
    expect(HOST_PAGE).toContain('src="/__yapyap/host.js"');
    const script = await t.get(`plugin://${ID}/__yapyap/host.js`);
    expect(script.headers.get('content-type')).toBe('text/javascript');
    expect(script.headers.get('content-security-policy')).toBe(PLUGIN_CSP);
    expect(await script.text()).toBe(hostScript('main.js'));
  });

  it('serves the page of the plugin’s panel, if it has one, under the plugin CSP', async () => {
    const page = await setup(undefined, 'ui/panel.js').get(`plugin://${ID}/__yapyap/panel.html`);
    expect(page.headers.get('content-type')).toBe('text/html; charset=utf-8');
    expect(page.headers.get('content-security-policy')).toBe(PLUGIN_CSP);
    expect(await page.text()).toBe(panelPage('ui/panel.js'));
    expect(panelPage('ui/panel.js')).toContain('<script type="module" src="/ui/panel.js">');
    expect((await setup().get(`plugin://${ID}/__yapyap/panel.html`)).status).toBe(404);
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
  it('lets through only what the policy allows, and nothing when the policy fails', async () => {
    const decide = vi.fn((url: string) =>
      url === 'boom' ? Promise.reject(new Error('boom')) : Promise.resolve(url === 'ok'),
    );
    const filter = confinePluginRequests(decide);
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

  it('lets HTTPS requests reach the policy, and keeps everything else to the plugin', () => {
    expect(PLUGIN_CSP).toBe(
      "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src https:",
    );
  });
});
