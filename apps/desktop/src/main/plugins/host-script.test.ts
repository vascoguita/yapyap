import { runInNewContext } from 'node:vm';
import type { PluginHost } from '@yapyap/plugin-sdk';
import { describe, expect, it, vi } from 'vitest';
import { bootPlugin, hostApi, hostScript, rpcClient, type PagePort } from './host-script.ts';

type Listener = (event: { readonly data: unknown; readonly ports: readonly PagePort[] }) => void;

function page() {
  let listener: Listener | undefined;
  const scope = {
    addEventListener: vi.fn((_type: 'message', given: Listener) => {
      listener = given;
    }),
  };
  const postMessage = vi.fn<(message: unknown) => void>();
  const port: PagePort = { postMessage, onmessage: null };
  return {
    scope,
    port,
    postMessage,
    deliver: (data: unknown, ports: readonly PagePort[] = [port]) => {
      listener?.({ data, ports });
    },
    reply: (data: unknown) => {
      port.onmessage?.({ data });
    },
  };
}

const helpers = { hostApi, rpcClient };

describe('bootPlugin', () => {
  it('activates the entry with the host API, whose calls wait for YapYap’s port', async () => {
    const p = page();
    let host: PluginHost | undefined;
    const load = vi.fn(() =>
      Promise.resolve({
        default: {
          activate: (api: PluginHost) => {
            host = api;
          },
        },
      }),
    );
    await bootPlugin(p.scope, load, '/main.js', 'yapyap:plugin-port', helpers);
    expect(load).toHaveBeenCalledExactlyOnceWith('/main.js');
    const shown = host?.notifications.show({ title: 'Hi', body: '' });
    p.deliver('something else');
    p.deliver('yapyap:plugin-port', []);
    expect(p.postMessage).not.toHaveBeenCalled();
    p.deliver('yapyap:plugin-port');
    expect(p.postMessage).toHaveBeenCalledExactlyOnceWith({
      id: 1,
      method: 'notifications.show',
      params: [{ title: 'Hi', body: '' }],
    });
    p.reply({ id: 1, result: 'done' });
    await expect(shown).resolves.toBe('done');
    // A second port, from anyone, is ignored.
    p.deliver('yapyap:plugin-port', [{ postMessage: vi.fn(), onmessage: null }]);
    const refused = host?.storage.get('key');
    expect(p.postMessage).toHaveBeenLastCalledWith({
      id: 2,
      method: 'storage.get',
      params: ['key'],
    });
    p.reply({ id: 2, error: { kind: 'not-granted', message: 'No.' } });
    await expect(refused).rejects.toEqual({ kind: 'not-granted', message: 'No.' });
    // Replies to calls nobody made change nothing.
    p.reply({ id: 9, result: 1 });
    p.reply(null);
  });

  it('loads an entry without an activate function, and does nothing with it', async () => {
    const p = page();
    for (const module of [{}, null, { default: { activate: 'no' } }]) {
      await expect(
        bootPlugin(p.scope, () => Promise.resolve(module), '/main.js', 'c', helpers),
      ).resolves.toBeUndefined();
    }
  });
});

describe('hostApi', () => {
  it('turns every SDK method into one call, and runs no commands yet', async () => {
    const call = vi.fn(() => Promise.resolve(undefined as never));
    const api = hostApi(call);
    await api.chat.readActive();
    await api.chat.readUnreadSummary();
    await api.composer.insertDraft('Hi');
    await api.notifications.show({ title: 'T', body: 'B' });
    await api.storage.get('k');
    await api.storage.set('k', 1);
    await api.storage.delete('k');
    await api.secrets.get('s');
    await api.secrets.set('s', 'v');
    await api.secrets.delete('s');
    api.commands.onRun('translate', vi.fn());
    expect(call.mock.calls).toEqual([
      ['chat.readActive'],
      ['chat.readUnreadSummary'],
      ['composer.insertDraft', 'Hi'],
      ['notifications.show', { title: 'T', body: 'B' }],
      ['storage.get', 'k'],
      ['storage.set', 'k', 1],
      ['storage.delete', 'k'],
      ['secrets.get', 's'],
      ['secrets.set', 's', 'v'],
      ['secrets.delete', 's'],
    ]);
  });
});

describe('hostScript', () => {
  it('runs the bootstrap with the entry’s path and YapYap’s channel', () => {
    const script = hostScript('dist/my entry.js');
    expect(script).toContain('"/dist/my%20entry.js"');
    expect(script).toContain('"yapyap:plugin-port"');
  });

  // Mutation testing instruments the functions with helpers from outside them,
  // so only uninstrumented source can run on its own.
  it.skipIf(hostScript('main.js').includes('stryMutAct'))(
    'stands alone: it runs with nothing but the page’s scope and import()',
    async () => {
      const loaded: string[] = [];
      const context = {
        addEventListener: vi.fn(),
        load: (path: string) => {
          loaded.push(path);
          return Promise.resolve({});
        },
      };
      // A vm script cannot import modules, so the page's import() is swapped for a recorder.
      const runnable = hostScript('main.js').replace('(path) => import(path)', 'load');
      await (runInNewContext(runnable, context) as Promise<void>);
      expect(context.addEventListener).toHaveBeenCalledWith('message', expect.any(Function));
      expect(loaded).toEqual(['/main.js']);
    },
  );
});
