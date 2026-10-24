import type { ActiveChat, PluginHost, UnreadChat } from '@yapyap/plugin-sdk';
import { PLUGIN_PORT_CHANNEL } from '../../shared/plugin-rpc.ts';

/** The page's side of the port, as far as the bootstrap uses it. */
export interface PagePort {
  postMessage(message: unknown): void;
  onmessage: ((event: { readonly data: unknown }) => void) | null;
}

/** The plugin page's global scope, as far as the bootstrap uses it. */
interface PageScope {
  addEventListener(
    type: 'message',
    listener: (event: { readonly data: unknown; readonly ports: readonly PagePort[] }) => void,
  ): void;
}

type Call = <T>(method: string, ...params: unknown[]) => Promise<T>;

/** The typed host API of `@yapyap/plugin-sdk`, each method one call over the port. */
export function hostApi(call: Call): PluginHost {
  return {
    chat: {
      readActive: () => call<ActiveChat | null>('chat.readActive'),
      readUnreadSummary: () => call<readonly UnreadChat[]>('chat.readUnreadSummary'),
    },
    composer: { insertDraft: (text) => call('composer.insertDraft', text) },
    notifications: { show: (notification) => call('notifications.show', notification) },
    storage: {
      get: (key) => call('storage.get', key),
      set: (key, value) => call('storage.set', key, value),
      delete: (key) => call('storage.delete', key),
    },
    secrets: {
      get: (name) => call('secrets.get', name),
      set: (name, value) => call('secrets.set', name, value),
      delete: (name) => call('secrets.delete', name),
    },
    // YapYap offers no commands until UI contributions arrive (#98), so none can run.
    commands: { onRun: () => undefined },
  };
}

/** Calls over a port that may not have arrived yet: they wait for it, in order. */
export function rpcClient(): { call: Call; attach: (port: PagePort) => void } {
  const pending = new Map<number, { resolve(value: never): void; reject(error: unknown): void }>();
  const waiting: unknown[] = [];
  let port: PagePort | undefined;
  let next = 0;
  const call: Call = (method, ...params) =>
    new Promise((resolve, reject) => {
      next += 1;
      pending.set(next, { resolve, reject });
      const message = { id: next, method, params };
      if (port === undefined) {
        waiting.push(message);
      } else {
        port.postMessage(message);
      }
    });
  const attach = (given: PagePort): void => {
    port = given;
    given.onmessage = ({ data }) => {
      const { id, result, error } = Object(data) as Record<string, unknown>;
      const waiter = pending.get(Number(id));
      pending.delete(Number(id));
      if (error === undefined) {
        waiter?.resolve(result as never);
      } else {
        waiter?.reject(error);
      }
    };
    for (const message of waiting.splice(0)) {
      given.postMessage(message);
    }
  };
  return { call, attach };
}

/**
 * Starts a plugin inside its page: takes the one port YapYap hands over,
 * then imports the entry module and activates it with the host API. Runs in
 * the plugin's page as source text, so everything it uses comes in as a
 * parameter.
 */
export function bootPlugin(
  scope: PageScope,
  load: (path: string) => Promise<unknown>,
  entry: string,
  channel: string,
  helpers: { readonly hostApi: typeof hostApi; readonly rpcClient: typeof rpcClient },
): Promise<void> {
  const client = helpers.rpcClient();
  let connected = false;
  scope.addEventListener('message', ({ data, ports: [given] }) => {
    if (data === channel && !connected && given !== undefined) {
      connected = true;
      client.attach(given);
    }
  });
  return load(entry).then(async (module) => {
    const plugin = (Object(module) as { default?: unknown }).default;
    const { activate } = Object(plugin) as { activate?: unknown };
    if (typeof activate === 'function') {
      await (activate as (api: PluginHost) => unknown)(helpers.hostApi(client.call));
    }
  });
}

/** The bootstrap as the module YapYap serves for every plugin page. */
export function hostScript(entry: string): string {
  const path = JSON.stringify(`/${encodeURI(entry)}`);
  const helpers = `{ hostApi: ${hostApi.toString()}, rpcClient: ${rpcClient.toString()} }`;
  return `(${bootPlugin.toString()})(globalThis, (path) => import(path), ${path}, ${JSON.stringify(PLUGIN_PORT_CHANNEL)}, ${helpers});`;
}
