import { runInNewContext } from 'node:vm';
import type { ExtensionHost } from '@yapyap/extension-sdk';
import { describe, expect, it, vi } from 'vitest';
import {
  bootExtension,
  hostApi,
  ownApi,
  hostScript,
  rpcClient,
  settleReply,
  type HostHandlers,
  type PagePort,
} from './host-script.ts';

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

const helpers = { hostApi, ownApi, rpcClient, settleReply };

describe('bootExtension', () => {
  it('activates the entry with the host API, whose calls wait for YapYap’s port', async () => {
    const p = page();
    let host: ExtensionHost | undefined;
    const load = vi.fn(() =>
      Promise.resolve({
        default: {
          activate: (api: ExtensionHost) => {
            host = api;
          },
        },
      }),
    );
    await bootExtension(p.scope, load, '/main.js', 'yapyap:extension-port', helpers);
    expect(load).toHaveBeenCalledExactlyOnceWith('/main.js');
    const shown = host?.notifications.show({ title: 'Hi', body: '' });
    p.deliver('something else');
    p.deliver('yapyap:extension-port', []);
    expect(p.postMessage).not.toHaveBeenCalled();
    p.deliver('yapyap:extension-port');
    expect(p.postMessage).toHaveBeenCalledExactlyOnceWith({
      id: 1,
      method: 'notifications.show',
      params: [{ title: 'Hi', body: '' }],
    });
    p.reply({ id: 1, result: 'done' });
    await expect(shown).resolves.toBe('done');
    // A second port, from anyone, is ignored.
    p.deliver('yapyap:extension-port', [{ postMessage: vi.fn(), onmessage: null }]);
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

  it('runs the handler of a command YapYap sends, and survives one that fails', async () => {
    const p = page();
    const ran: string[] = [];
    await bootExtension(
      p.scope,
      () =>
        Promise.resolve({
          default: {
            activate: (api: ExtensionHost) => {
              api.commands.onRun('translate', () => {
                ran.push('translate');
              });
              api.commands.onRun('broken', () => {
                throw new Error('bug');
              });
            },
          },
        }),
      '/main.js',
      'yapyap:extension-port',
      helpers,
    );
    p.deliver('yapyap:extension-port');
    p.reply({ command: 'translate' });
    p.reply({ command: 'broken' });
    p.reply({ command: 'unknown' });
    await vi.waitFor(() => {
      expect(ran).toEqual(['translate']);
    });
  });

  it('hands the assistant bar’s requests to the extension’s handler, and survives one that fails', async () => {
    const p = page();
    const asked: unknown[] = [];
    await bootExtension(
      p.scope,
      () =>
        Promise.resolve({
          default: {
            activate: (api: ExtensionHost) => {
              api.assistant.onRequest((request) => {
                if (request.type === 'confirm') {
                  throw new Error('bug');
                }
                asked.push(request);
              });
            },
          },
        }),
      '/main.js',
      'yapyap:extension-port',
      helpers,
    );
    p.deliver('yapyap:extension-port');
    p.reply({ assistant: { type: 'suggest' } });
    await vi.waitFor(() => {
      expect(asked).toEqual([{ type: 'suggest' }]);
    });
    p.reply({ assistant: { type: 'confirm' } });
    p.reply({ assistant: { type: 'prompt', text: 'Say hi' } });
    await vi.waitFor(() => {
      expect(asked).toEqual([{ type: 'suggest' }, { type: 'prompt', text: 'Say hi' }]);
    });
  });

  it('keeps the bar’s requests that come before the extension listens, and hands them over once it does', async () => {
    const p = page();
    const asked: unknown[] = [];
    let listen = (): void => undefined;
    const booted = bootExtension(
      p.scope,
      () =>
        Promise.resolve({
          default: {
            activate: (api: ExtensionHost) =>
              new Promise<void>((resolve) => {
                listen = () => {
                  api.assistant.onRequest((request) => {
                    if (request.type === 'confirm') {
                      throw new Error('bug');
                    }
                    asked.push(request);
                  });
                  resolve();
                };
              }),
          },
        }),
      '/main.js',
      'yapyap:extension-port',
      helpers,
    );
    p.deliver('yapyap:extension-port');
    p.reply({ assistant: { type: 'confirm' } });
    p.reply({ assistant: { type: 'suggest' } });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(asked).toEqual([]);
    listen();
    await booted;
    await vi.waitFor(() => {
      expect(asked).toEqual([{ type: 'suggest' }]);
    });
  });

  it('ignores assistant requests when the extension listens for none', async () => {
    const p = page();
    await bootExtension(
      p.scope,
      () => Promise.resolve({ default: { activate: () => undefined } }),
      '/main.js',
      'yapyap:extension-port',
      helpers,
    );
    p.deliver('yapyap:extension-port');
    p.reply({ assistant: { type: 'suggest' } });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(p.postMessage).not.toHaveBeenCalled();
  });

  it('loads an entry without an activate function, and does nothing with it', async () => {
    const p = page();
    for (const module of [{}, null, { default: { activate: 'no' } }]) {
      await expect(
        bootExtension(p.scope, () => Promise.resolve(module), '/main.js', 'c', helpers),
      ).resolves.toBeUndefined();
    }
  });
});

describe('hostApi', () => {
  it('turns every SDK method into one call, and keeps command handlers by ID', async () => {
    const call = vi.fn(() => Promise.resolve(undefined as never));
    const handlers: HostHandlers = { commands: new Map(), early: [] };
    const api = hostApi(call, handlers, ownApi);
    await api.chat.readActive();
    await api.chat.readUnreadSummary();
    await api.composer.insertDraft('Hi');
    await api.composer.replaceDraft('Hello');
    await api.composer.readDraft();
    await api.notifications.show({ title: 'T', body: 'B' });
    await api.calls.record();
    await api.calls.stop();
    await api.calls.state();
    await api.calls.recordings();
    await api.calls.reveal('a'.repeat(32));
    await api.storage.get('k');
    await api.storage.set('k', 1);
    await api.storage.delete('k');
    await api.secrets.get('s');
    await api.secrets.set('s', 'v');
    await api.secrets.delete('s');
    await api.settings.get();
    await api.localModels.find();
    await api.assistant.offer({ suggestions: ['Yes'] });
    const translate = vi.fn();
    api.commands.onRun('translate', translate);
    expect(handlers.commands.get('translate')).toBe(translate);
    const request = vi.fn();
    api.assistant.onRequest(request);
    expect(handlers.assistant).toBe(request);
    expect(call.mock.calls).toEqual([
      ['chat.readActive'],
      ['chat.readUnreadSummary'],
      ['composer.insertDraft', 'Hi'],
      ['composer.replaceDraft', 'Hello'],
      ['composer.readDraft'],
      ['notifications.show', { title: 'T', body: 'B' }],
      ['calls.record'],
      ['calls.stop'],
      ['calls.state'],
      ['calls.recordings'],
      ['calls.reveal', 'a'.repeat(32)],
      ['storage.get', 'k'],
      ['storage.set', 'k', 1],
      ['storage.delete', 'k'],
      ['secrets.get', 's'],
      ['secrets.set', 's', 'v'],
      ['secrets.delete', 's'],
      ['settings.get'],
      ['localModels.find'],
      ['assistant.offer', { suggestions: ['Yes'] }],
    ]);
  });
});

describe('hostScript', () => {
  it('runs the bootstrap with the entry’s path and YapYap’s channel', () => {
    const script = hostScript('dist/my entry.js');
    expect(script).toContain(String.raw`"\u002fdist\u002fmy%20entry.js"`);
    expect(script).toContain('"yapyap:extension-port"');
    // Nothing in a literal can close it or the script: <, >, / and line separators are escaped.
    expect(hostScript('a\u2028b\u2029.js')).toContain(String.raw`"\u002fa%E2%80%A8b%E2%80%A9.js"`);
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
