import type {
  ActiveChat,
  AssistantRequest,
  ExtensionHost,
  UnreadChat,
} from '@yapyap/extension-sdk';
import { EXTENSION_PORT_CHANNEL } from '../../shared/extension-rpc.ts';

/** The page's side of the port, as far as the bootstrap uses it. */
export interface PagePort {
  postMessage(message: unknown): void;
  onmessage: ((event: { readonly data: unknown }) => void) | null;
}

/** The extension page's global scope, as far as the bootstrap uses it. */
interface PageScope {
  addEventListener(
    type: 'message',
    listener: (event: { readonly data: unknown; readonly ports: readonly PagePort[] }) => void,
  ): void;
}

type Call = <T>(method: string, ...params: unknown[]) => Promise<T>;

/** What the user asks of the extension outside its calls: commands, and the assistant bar's requests. */
export interface HostHandlers {
  readonly commands: Map<string, () => unknown>;
  assistant?: (request: AssistantRequest) => unknown;
}

/** The typed host API of `@yapyap/extension-sdk`, each method one call over the port. */
export function hostApi(call: Call, handlers: HostHandlers): ExtensionHost {
  return {
    chat: {
      readActive: () => call<ActiveChat | null>('chat.readActive'),
      readUnreadSummary: () => call<readonly UnreadChat[]>('chat.readUnreadSummary'),
    },
    composer: {
      insertDraft: (text) => call('composer.insertDraft', text),
      replaceDraft: (text) => call('composer.replaceDraft', text),
      readDraft: () => call<string | null>('composer.readDraft'),
    },
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
    commands: {
      onRun: (id, handler) => {
        handlers.commands.set(id, handler);
      },
    },
    settings: { get: () => call('settings.get') },
    assistant: {
      offer: (offer) => call('assistant.offer', offer),
      onRequest: (handler) => {
        handlers.assistant = handler;
      },
    },
  };
}

type Pending = Map<number, { resolve(value: never): void; reject(error: unknown): void }>;

/**
 * Settles the call a reply answers, or hands what YapYap sends on its own,
 * a command the user picked or a request from the assistant bar, to `onHost`.
 */
export function settleReply(
  pending: Pending,
  data: unknown,
  onHost: (message: { readonly command?: string; readonly assistant?: unknown }) => void,
): void {
  const { id, result, error, command, assistant } = Object(data) as Record<string, unknown>;
  if (typeof command === 'string' || assistant !== undefined) {
    onHost({ ...(typeof command === 'string' ? { command } : {}), assistant });
    return;
  }
  const waiter = pending.get(Number(id));
  pending.delete(Number(id));
  if (error === undefined) {
    waiter?.resolve(result as never);
  } else {
    waiter?.reject(error);
  }
}

/**
 * Calls over a port that may not have arrived yet: they wait for it, in
 * order. YapYap also sends a command the user picked (#98), or an assistant
 * bar request (ADR 0013), which go to `onHost`.
 */
export function rpcClient(
  onHost: Parameters<typeof settleReply>[2],
  settle: typeof settleReply,
): {
  call: Call;
  attach: (port: PagePort) => void;
} {
  const pending: Pending = new Map();
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
      settle(pending, data, onHost);
    };
    for (const message of waiting.splice(0)) {
      given.postMessage(message);
    }
  };
  return { call, attach };
}

/**
 * Starts an extension inside its page: takes the one port YapYap hands over,
 * then imports the entry module and activates it with the host API. Runs in
 * the extension's page as source text, so everything it uses comes in as a
 * parameter.
 */
export function bootExtension(
  scope: PageScope,
  load: (path: string) => Promise<unknown>,
  entry: string,
  channel: string,
  helpers: {
    readonly hostApi: typeof hostApi;
    readonly rpcClient: typeof rpcClient;
    readonly settleReply: typeof settleReply;
  },
): Promise<void> {
  const handlers: HostHandlers = { commands: new Map() };
  // A handler that throws or rejects affects only itself.
  const client = helpers.rpcClient(({ command, assistant }) => {
    Promise.resolve()
      .then(() =>
        command === undefined
          ? handlers.assistant?.(assistant as AssistantRequest)
          : handlers.commands.get(command)?.(),
      )
      .catch(() => undefined);
  }, helpers.settleReply);
  let connected = false;
  scope.addEventListener('message', ({ data, ports: [given] }) => {
    if (data === channel && !connected && given !== undefined) {
      connected = true;
      client.attach(given);
    }
  });
  return load(entry).then(async (module) => {
    const extension = (Object(module) as { default?: unknown }).default;
    const { activate } = Object(extension) as { activate?: unknown };
    if (typeof activate === 'function') {
      await (activate as (api: ExtensionHost) => unknown)(helpers.hostApi(client.call, handlers));
    }
  });
}

/**
 * A string as a JavaScript literal that nothing in it can end early: the
 * manifest already limits the entry's characters, and this holds even if
 * that check ever changes.
 */
function literal(value: string): string {
  return JSON.stringify(value).replaceAll(
    /[<>/\u2028\u2029]/gu,
    (char) => String.raw`\u` + Number(char.codePointAt(0)).toString(16).padStart(4, '0'),
  );
}

/** The bootstrap as the module YapYap serves for every extension page. */
export function hostScript(entry: string): string {
  const path = literal(`/${encodeURI(entry)}`);
  const helpers = `{ hostApi: ${hostApi.toString()}, rpcClient: ${rpcClient.toString()}, settleReply: ${settleReply.toString()} }`;
  return `(${bootExtension.toString()})(globalThis, (path) => import(path), ${path}, ${literal(EXTENSION_PORT_CHANNEL)}, ${helpers});`;
}
