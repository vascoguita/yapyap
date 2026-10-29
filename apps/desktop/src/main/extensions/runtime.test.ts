import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import type { ViewRegistry } from '../views.ts';
import { loadRecords, saveRecords, type ExtensionRecord } from './records.ts';
import { Type } from 'typebox';
import type { ProcessMetrics } from './resource-guard.ts';
import type { CallingExtension } from './host-methods.ts';
import { RPC_OPTIONS, type RpcMethod } from './rpc.ts';
import { createExtensionRuntime, extensionPartition } from './runtime.ts';

const MANIFEST = {
  id: 'org.example.hello',
  name: 'Hello',
  version: '1.0.0',
  author: { name: 'Example' },
  apiVersion: '1.0.0',
  entry: 'main.js',
  capabilities: [],
};

const record = (overrides: Partial<ExtensionRecord> = {}): ExtensionRecord => ({
  id: 'org.example.hello',
  version: '1.0.0',
  fingerprint: null,
  firstParty: false,
  developer: true,
  capabilities: [],
  hosts: [],
  ...overrides,
});

let root = '';

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'yapyap-runtime-'));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

async function install(
  extension: ExtensionRecord,
  manifest: object | string = MANIFEST,
): Promise<void> {
  const folder = join(root, extension.id, extension.version);
  await mkdir(folder, { recursive: true });
  const text = typeof manifest === 'string' ? manifest : JSON.stringify(manifest);
  await writeFile(join(folder, 'manifest.json'), text);
  await writeFile(join(folder, 'main.js'), 'export default {};');
}

interface FakeSession {
  readonly protocol: {
    readonly handle: Mock<
      (scheme: string, handler: (request: { url: string }) => Promise<Response>) => void
    >;
  };
  readonly webRequest: {
    readonly onBeforeRequest: Mock<(listener: unknown) => void>;
    readonly onBeforeSendHeaders: Mock<(listener: unknown) => void>;
    readonly onHeadersReceived: Mock<(listener: unknown) => void>;
  };
  readonly clearStorageData: Mock<() => Promise<void>>;
  readonly clearCache: Mock<() => Promise<void>>;
}

interface FakePort {
  readonly on: Mock<(event: 'message', listener: (event: { data: unknown }) => void) => void>;
  readonly postMessage: Mock<(message: unknown) => void>;
  readonly start: Mock<() => void>;
}

interface FakeHost {
  readonly partition: string;
  readonly webContents: {
    readonly on: Mock<(event: 'did-finish-load', listener: () => void) => void>;
    readonly getOSProcessId: () => number;
  };
  readonly loadURL: Mock<(url: string) => Promise<unknown>>;
  readonly destroy: Mock<() => void>;
  readonly openPort: Mock<() => FakePort>;
  /** The page loaded, as `did-finish-load` reports it. */
  readonly load: () => void;
  readonly ports: FakePort[];
}

const fakeHost = (partition: string, loaded: Promise<unknown> = Promise.resolve()): FakeHost => {
  const listeners: (() => void)[] = [];
  const ports: FakePort[] = [];
  return {
    partition,
    webContents: {
      on: vi.fn((_event: 'did-finish-load', listener: () => void) => {
        listeners.push(listener);
      }),
      getOSProcessId: () => 4242,
    },
    loadURL: vi.fn(() => loaded),
    destroy: vi.fn(),
    openPort: vi.fn(() => {
      const port = { on: vi.fn(), postMessage: vi.fn(), start: vi.fn() };
      ports.push(port);
      return port;
    }),
    load: () => {
      for (const listener of listeners) {
        listener();
      }
    },
    ports,
  };
};

function fakePanel() {
  const closed: (() => void)[] = [];
  return {
    webContents: {},
    loadURL: vi.fn((): Promise<unknown> => Promise.resolve()),
    focus: vi.fn(),
    destroy: vi.fn(),
    onClosed: vi.fn((listener: () => void) => {
      closed.push(listener);
    }),
    close: () => {
      for (const listener of closed) {
        listener();
      }
    },
  };
}

function setup() {
  const sampled: (() => void)[] = [];
  const panels: ReturnType<typeof fakePanel>[] = [];
  const sessions = new Map<string, FakeSession>();
  const hosts: FakeHost[] = [];
  const views: ViewRegistry = new WeakMap();
  const deps = {
    root,
    sessionOf: vi.fn((partition: string): FakeSession => {
      const session = sessions.get(partition) ?? {
        protocol: { handle: vi.fn() },
        webRequest: {
          onBeforeRequest: vi.fn(),
          onBeforeSendHeaders: vi.fn(),
          onHeadersReceived: vi.fn(),
        },
        clearStorageData: vi.fn(() => Promise.resolve()),
        clearCache: vi.fn(() => Promise.resolve()),
      };
      sessions.set(partition, session);
      return session;
    }),
    createHost: vi.fn((partition: string): FakeHost => {
      const host = fakeHost(partition);
      hosts.push(host);
      return host;
    }),
    createPanel: vi.fn<(partition: string, title: string) => ReturnType<typeof fakePanel>>(() => {
      const panel = fakePanel();
      panels.push(panel);
      return panel;
    }),
    readFile: (path: string) => readFile(path),
    views,
    warn: vi.fn(),
    methodsFor: vi.fn<(extension: CallingExtension) => Readonly<Record<string, RpcMethod>>>(() => ({
      'notifications.show': {
        capability: 'notifications:show',
        params: Type.Tuple([]),
        run: () => Promise.resolve(),
      },
    })),
    rpc: { ...RPC_OPTIONS, now: () => 0, after: vi.fn() },
    audit: { record: vi.fn() },
    limits: {
      metrics: vi.fn((): ProcessMetrics[] => []),
      notify: vi.fn(),
      every: vi.fn((callback: () => void) => {
        sampled.push(callback);
      }),
      now: () => 0,
      cores: 1,
    },
    askHost: vi.fn<(extension: string, host: string) => Promise<boolean>>(() =>
      Promise.resolve(false),
    ),
    activeAccount: vi.fn((): string | undefined => undefined),
    presentHeaders: (headers: Readonly<Record<string, string>>) => ({ ...headers, Presented: '1' }),
  };
  const only = <T>(items: readonly T[]): T => {
    const [item] = items;
    if (items.length !== 1 || item === undefined) {
      throw new Error(`Expected one item, got ${String(items.length)}.`);
    }
    return item;
  };
  const sample = (): void => {
    for (const callback of sampled) {
      callback();
    }
  };
  const runtime = createExtensionRuntime(deps);
  return { deps, sessions, hosts, panels, views, only, sample, runtime };
}

describe('extensionPartition', () => {
  it('keeps an extension’s storage only when it may store data', () => {
    expect(extensionPartition(record())).toBe('extension:org.example.hello');
    expect(extensionPartition(record({ capabilities: ['storage:local'] }))).toBe(
      'persist:extension:org.example.hello',
    );
  });
});

describe('createExtensionRuntime', () => {
  it('runs each installed extension in a hidden window of its own, serving only its files', async () => {
    await install(record());
    await saveRecords(root, new Map([['org.example.hello', record()]]));
    const t = setup();
    await t.runtime.startAll();
    expect(t.runtime.running()).toEqual(['org.example.hello']);
    const host = t.only(t.hosts);
    expect(host.partition).toBe('extension:org.example.hello');
    expect(host.loadURL).toHaveBeenCalledExactlyOnceWith('extension://org.example.hello/');
    expect(t.views.get(host.webContents)).toEqual({
      zone: 'extension',
      home: 'extension://org.example.hello',
      label: 'org.example.hello',
    });
    const session = t.only([...t.sessions.values()]);
    expect(t.deps.sessionOf).toHaveBeenCalledExactlyOnceWith('extension:org.example.hello');
    expect(session.webRequest.onBeforeRequest).toHaveBeenCalledOnce();
    const [scheme, serve] = t.only(session.protocol.handle.mock.calls);
    expect(scheme).toBe('extension');
    const script = await serve({ url: 'extension://org.example.hello/main.js' });
    expect(await script.text()).toBe('export default {};');
  });

  it('gives each page the extension loads a port of its own, served with the extension’s name', async () => {
    await install(record({ capabilities: ['notifications:show'] }));
    await saveRecords(
      root,
      new Map([['org.example.hello', record({ capabilities: ['notifications:show'] })]]),
    );
    const t = setup();
    await t.runtime.startAll();
    const host = t.only(t.hosts);
    expect(host.openPort).not.toHaveBeenCalled();
    host.load();
    host.load();
    expect(host.openPort).toHaveBeenCalledTimes(2);
    expect(host.ports.map((port) => port.start.mock.calls.length)).toEqual([1, 1]);
    const [calling] = t.deps.methodsFor.mock.calls[0] ?? [];
    expect(calling).toMatchObject({ id: 'org.example.hello', name: 'Hello' });
    // Its manifest declares no settings form, so the extension gets no settings.
    expect(calling?.settings()).toEqual({});
    // A call over the port is audited under the extension's ID.
    const [port] = host.ports;
    const receive = port?.on.mock.calls[0]?.[1];
    receive?.({ data: { id: 1, method: 'notifications.show', params: [] } });
    await vi.waitFor(() => {
      expect(t.deps.audit.record).toHaveBeenCalledExactlyOnceWith({
        extension: 'org.example.hello',
        method: 'notifications.show',
        capability: 'notifications:show',
        outcome: 'ok',
      });
    });
    // Taking the grant back stops the very next call, without a restart (#94).
    const granted = record({ capabilities: ['notifications:show'] });
    await saveRecords(
      root,
      new Map([['org.example.hello', { ...granted, revoked: ['notifications:show'] }]]),
    );
    await t.runtime.regrant('org.example.hello');
    await t.runtime.regrant('org.example.missing');
    receive?.({ data: { id: 2, method: 'notifications.show', params: [] } });
    await vi.waitFor(() => {
      expect(t.deps.audit.record).toHaveBeenLastCalledWith(
        expect.objectContaining({ outcome: 'not-granted' }),
      );
    });
  });

  it('restarts an extension over its limits, stops one that keeps going over, and lists processes', async () => {
    await install(record());
    await saveRecords(root, new Map([['org.example.hello', record()]]));
    const t = setup();
    await t.runtime.startAll();
    expect(t.runtime.processes()).toEqual([{ id: 'org.example.hello', name: 'Hello', pid: 4242 }]);
    t.deps.limits.metrics.mockReturnValue([
      { pid: 4242, cpu: { percentCPUUsage: 100 }, memory: { workingSetSize: 0 } },
    ]);
    for (let index = 0; index < 3; index += 1) {
      t.sample();
    }
    await vi.waitFor(() => {
      expect(t.hosts).toHaveLength(2);
    });
    expect(t.hosts[0]?.destroy).toHaveBeenCalledOnce();
    for (let index = 0; index < 6; index += 1) {
      t.sample();
    }
    await vi.waitFor(() => {
      expect(t.runtime.running()).toEqual([]);
    });
    expect(t.deps.limits.notify).toHaveBeenCalledOnce();
    t.runtime.stop('org.example.missing');
  });

  it('says when an extension over its limits cannot be restarted', async () => {
    await install(record());
    await saveRecords(root, new Map([['org.example.hello', record()]]));
    const t = setup();
    await t.runtime.startAll();
    t.deps.limits.metrics.mockReturnValue([
      { pid: 4242, cpu: { percentCPUUsage: 100 }, memory: { workingSetSize: 0 } },
    ]);
    // The records file became unreadable, as a folder in its place is.
    await rm(join(root, '.extensions.json'));
    await mkdir(join(root, '.extensions.json'));
    for (let index = 0; index < 3; index += 1) {
      t.sample();
    }
    await vi.waitFor(() => {
      expect(t.deps.warn).toHaveBeenCalledWith(
        'Extension org.example.hello could not be restarted.',
      );
    });
  });

  it('lets an extension reach a host the user allows, and keeps that for good', async () => {
    await install(record());
    await saveRecords(root, new Map([['org.example.hello', record()]]));
    const t = setup();
    t.deps.askHost.mockResolvedValue(true);
    await t.runtime.startAll();
    const session = t.only([...t.sessions.values()]);
    const filter = session.webRequest.onBeforeRequest.mock.calls[0]?.[0] as (
      details: { url: string },
      callback: (response: { cancel: boolean }) => void,
    ) => void;
    const request = (url: string) =>
      new Promise<boolean>((resolve) => {
        filter({ url }, ({ cancel }) => {
          resolve(!cancel);
        });
      });
    expect(await request('https://llm.example.net/v1')).toBe(true);
    expect(t.deps.askHost).toHaveBeenCalledExactlyOnceWith('Hello', 'llm.example.net');
    expect((await loadRecords(root)).get('org.example.hello')?.hosts).toEqual(['llm.example.net']);
    expect(await request('https://llm.example.net/v2')).toBe(true);
    expect(t.deps.askHost).toHaveBeenCalledOnce();
    // An approval that lands after the extension was removed records nothing.
    await saveRecords(root, new Map());
    expect(await request('https://other.example.net/')).toBe(true);
    expect(await loadRecords(root)).toEqual(new Map());
  });

  it('does not start an extension the marketplace pulled', async () => {
    const pulled = record({ pulled: 'It sent chats away.' });
    await install(pulled);
    await saveRecords(root, new Map([['org.example.hello', pulled]]));
    const t = setup();
    await t.runtime.startAll();
    expect(t.deps.createHost).not.toHaveBeenCalled();
    expect(t.runtime.running()).toEqual([]);
  });

  it('lets an extension reach this computer only while it holds local-network', async () => {
    const local = record({ capabilities: ['local-network'] });
    await install(local);
    await saveRecords(root, new Map([['org.example.hello', local]]));
    const t = setup();
    await t.runtime.startAll();
    const session = t.only([...t.sessions.values()]);
    const filter = session.webRequest.onBeforeRequest.mock.calls[0]?.[0] as (
      details: { url: string },
      callback: (response: { cancel: boolean }) => void,
    ) => void;
    const request = (url: string) =>
      new Promise<boolean>((resolve) => {
        filter({ url }, ({ cancel }) => {
          resolve(!cancel);
        });
      });
    expect(await request('http://localhost:11434/v1')).toBe(true);
    const send = session.webRequest.onBeforeSendHeaders.mock.calls[0]?.[0] as (
      details: { url: string; requestHeaders: Record<string, string> },
      callback: (response: { requestHeaders: Record<string, string> }) => void,
    ) => void;
    const receive = session.webRequest.onHeadersReceived.mock.calls[0]?.[0] as (
      details: { url: string; method: string },
      callback: (response: object) => void,
    ) => void;
    const sent = (url: string) =>
      new Promise((resolve) => {
        send(
          { url, requestHeaders: { Origin: 'extension://org.example.hello' } },
          ({ requestHeaders }) => {
            resolve(requestHeaders);
          },
        );
      });
    const received = (url: string) =>
      new Promise((resolve) => {
        receive({ url, method: 'POST' }, resolve);
      });
    expect(await sent('http://localhost:11434/v1')).toEqual({ Presented: '1' });
    expect(await received('http://localhost:11434/v1')).toMatchObject({
      responseHeaders: { 'Access-Control-Allow-Origin': ['extension://org.example.hello'] },
    });
    await saveRecords(
      root,
      new Map([['org.example.hello', { ...local, revoked: ['local-network'] }]]),
    );
    await t.runtime.regrant('org.example.hello');
    expect(await request('http://localhost:11434/v1')).toBe(false);
    expect(await sent('http://localhost:11434/v1')).toEqual({
      Origin: 'extension://org.example.hello',
      Presented: '1',
    });
    expect(await received('http://localhost:11434/v1')).toEqual({});
    expect(t.deps.askHost).not.toHaveBeenCalled();
  });

  it('lists the running extensions’ commands, runs one over the port, and says when they change', async () => {
    const commands = [{ id: 'translate', title: 'Translate draft' }];
    await install(record(), { ...MANIFEST, contributes: { commands } });
    await saveRecords(root, new Map([['org.example.hello', record()]]));
    const t = setup();
    const changes = vi.fn();
    t.runtime.onChange(changes);
    await t.runtime.startAll();
    expect(changes).toHaveBeenCalledOnce();
    expect(t.runtime.commands()).toEqual([
      {
        extension: 'org.example.hello',
        extensionName: 'Hello',
        id: 'translate',
        title: 'Translate draft',
      },
    ]);
    // Before its page has loaded, the extension has no port to take the command.
    expect(t.runtime.runCommand('org.example.hello', 'translate')).toBe(false);
    const host = t.only(t.hosts);
    host.load();
    expect(t.runtime.runCommand('org.example.hello', 'translate')).toBe(true);
    expect(host.ports[0]?.postMessage).toHaveBeenCalledExactlyOnceWith({ command: 'translate' });
    expect(t.runtime.runCommand('org.example.hello', 'unknown')).toBe(false);
    expect(t.runtime.runCommand('org.example.other', 'translate')).toBe(false);
    t.runtime.stop('org.example.hello');
    expect(changes).toHaveBeenCalledTimes(2);
    expect(t.runtime.commands()).toEqual([]);
  });

  it('lists the extensions that may fill the assistant bar for the account on screen, and passes them requests', async () => {
    const assistant = record({ capabilities: ['assistant:bar'] });
    await install(assistant);
    await saveRecords(root, new Map([['org.example.hello', assistant]]));
    const t = setup();
    await t.runtime.startAll();
    expect(t.runtime.assistants()).toEqual([]);
    t.deps.activeAccount.mockReturnValue('acct-1');
    expect(t.runtime.assistants()).toEqual([{ id: 'org.example.hello', name: 'Hello' }]);
    // Before its page has loaded, the extension has no port to take the request.
    expect(t.runtime.askAssistant('org.example.hello', { type: 'suggest' })).toBe(false);
    const host = t.only(t.hosts);
    host.load();
    expect(t.runtime.askAssistant('org.example.hello', { type: 'suggest' })).toBe(true);
    expect(host.ports[0]?.postMessage).toHaveBeenLastCalledWith({ assistant: { type: 'suggest' } });
    expect(t.runtime.askAssistant('org.example.other', { type: 'suggest' })).toBe(false);
    t.deps.activeAccount.mockReturnValue(undefined);
    expect(t.runtime.askAssistant('org.example.hello', { type: 'suggest' })).toBe(false);
  });

  it('lists the running extensions’ right-click items, only for commands they declare', async () => {
    const contributes = {
      commands: [{ id: 'translate', title: 'Translate draft' }],
      composerActions: [
        { title: 'Translate', command: 'translate' },
        { title: 'Missing', command: 'missing' },
      ],
      contextMenu: [
        { title: 'Explain', command: 'translate', on: 'message' },
        { title: 'Summarize', command: 'translate', on: 'chat' },
        { title: 'Undeclared', command: 'missing', on: 'chat' },
      ],
    };
    await install(record(), { ...MANIFEST, contributes });
    await saveRecords(root, new Map([['org.example.hello', record()]]));
    const t = setup();
    await t.runtime.startAll();
    const item = { extension: 'org.example.hello', extensionName: 'Hello', command: 'translate' };
    expect(t.runtime.actions()).toEqual([
      { ...item, title: 'Translate', on: 'composer' },
      { ...item, title: 'Explain', on: 'message' },
      { ...item, title: 'Summarize', on: 'chat' },
    ]);
    t.runtime.stop('org.example.hello');
    expect(t.runtime.actions()).toEqual([]);
  });

  it('lists no right-click items for an extension that contributes none', async () => {
    await install(record());
    await saveRecords(root, new Map([['org.example.hello', record()]]));
    const t = setup();
    await t.runtime.startAll();
    expect(t.runtime.actions()).toEqual([]);
  });

  it('opens an extension’s panel in a window titled with its name, and brings it forward again', async () => {
    const panel = { title: 'Notes', entry: 'panel.js' };
    await install(record(), { ...MANIFEST, contributes: { panel } });
    await saveRecords(root, new Map([['org.example.hello', record()]]));
    const t = setup();
    await t.runtime.startAll();
    expect(t.runtime.panels()).toEqual([
      { extension: 'org.example.hello', extensionName: 'Hello', title: 'Notes' },
    ]);
    expect(t.runtime.openPanel('org.example.hello')).toBe(true);
    expect(t.deps.createPanel).toHaveBeenCalledExactlyOnceWith(
      'extension:org.example.hello',
      'Hello: Notes',
    );
    const window = t.only(t.panels);
    expect(window.loadURL).toHaveBeenCalledWith(
      'extension://org.example.hello/__yapyap/panel.html',
    );
    expect(t.views.get(window.webContents)).toEqual({
      home: 'extension://org.example.hello',
      zone: 'extension',
      label: 'org.example.hello',
    });
    expect(t.runtime.openPanel('org.example.hello')).toBe(true);
    expect(window.focus).toHaveBeenCalledOnce();
    window.close();
    t.runtime.openPanel('org.example.hello');
    expect(t.panels).toHaveLength(2);
    t.runtime.stop('org.example.hello');
    expect(t.panels[1]?.destroy).toHaveBeenCalledOnce();
    expect(t.runtime.panels()).toEqual([]);
  });

  it('opens no panel for an extension without one, or one that does not run', async () => {
    await install(record());
    await saveRecords(root, new Map([['org.example.hello', record()]]));
    const t = setup();
    await t.runtime.startAll();
    expect(t.runtime.panels()).toEqual([]);
    expect(t.runtime.openPanel('org.example.hello')).toBe(false);
    expect(t.runtime.openPanel('org.example.other')).toBe(false);
    expect(t.deps.createPanel).not.toHaveBeenCalled();
  });

  it('says when a panel’s page cannot load, and forgets a panel closed after a restart', async () => {
    await install(record(), {
      ...MANIFEST,
      contributes: { panel: { title: 'Notes', entry: 'panel.js' } },
    });
    await saveRecords(root, new Map([['org.example.hello', record()]]));
    const t = setup();
    await t.runtime.startAll();
    t.deps.createPanel.mockImplementationOnce(() => {
      const panel = fakePanel();
      panel.loadURL.mockRejectedValue(new Error('gone'));
      t.panels.push(panel);
      return panel;
    });
    t.runtime.openPanel('org.example.hello');
    await vi.waitFor(() => {
      expect(t.deps.warn).toHaveBeenCalledWith(
        'The panel of extension org.example.hello could not be loaded.',
      );
    });
    await t.runtime.restart('org.example.hello');
    const old = t.only(t.panels);
    expect(old.destroy).toHaveBeenCalledOnce();
    old.close();
    t.runtime.openPanel('org.example.hello');
    expect(t.panels).toHaveLength(2);
  });

  it('forgets a removed extension: its windows close, its files stop, and both its sessions are cleared', async () => {
    const panel = { title: 'Notes', entry: 'panel.js' };
    await install(record(), { ...MANIFEST, contributes: { panel } });
    await saveRecords(root, new Map([['org.example.hello', record()]]));
    const t = setup();
    await t.runtime.startAll();
    t.runtime.openPanel('org.example.hello');
    const listener = vi.fn();
    t.runtime.onChange(listener);
    const [, serve] = t.only(t.only([...t.sessions.values()]).protocol.handle.mock.calls);
    await t.runtime.forget('org.example.hello');
    expect(t.only(t.hosts).destroy).toHaveBeenCalledOnce();
    expect(t.only(t.panels).destroy).toHaveBeenCalledOnce();
    expect(t.runtime.running()).toEqual([]);
    expect(listener).toHaveBeenCalledOnce();
    expect((await serve({ url: 'extension://org.example.hello/main.js' })).status).toBe(404);
    expect([...t.sessions.keys()]).toEqual([
      'extension:org.example.hello',
      'persist:extension:org.example.hello',
    ]);
    for (const session of t.sessions.values()) {
      expect(session.clearStorageData).toHaveBeenCalledOnce();
      expect(session.clearCache).toHaveBeenCalledOnce();
    }
  });

  it('starts an updated extension again on the same session, from its new folder', async () => {
    await install(record());
    await saveRecords(root, new Map([['org.example.hello', record()]]));
    const t = setup();
    await t.runtime.startAll();
    const updated = record({ version: '1.1.0' });
    await install(updated);
    await saveRecords(root, new Map([['org.example.hello', updated]]));
    await t.runtime.restart('org.example.hello');
    expect(t.hosts[0]?.destroy).toHaveBeenCalledOnce();
    expect(t.hosts).toHaveLength(2);
    expect(t.deps.sessionOf).toHaveBeenCalledOnce();
    await t.runtime.restart('org.example.missing');
    expect(t.hosts).toHaveLength(2);
  });

  it('skips an extension whose manifest is missing or broken, saying so', async () => {
    await install(record(), '{');
    const other = record({ id: 'org.example.other' });
    await install(other, { ...MANIFEST, id: 'org.example.other', entry: '../escape.js' });
    await saveRecords(
      root,
      new Map([
        ['org.example.hello', record()],
        ['org.example.other', other],
      ]),
    );
    const t = setup();
    await t.runtime.startAll();
    expect(t.hosts).toHaveLength(0);
    expect(t.deps.warn).toHaveBeenCalledWith(
      'Extension org.example.hello has no readable manifest, so it was not started.',
    );
    expect(t.deps.warn).toHaveBeenCalledTimes(2);
  });

  it('says when an extension page cannot load', async () => {
    await install(record());
    await saveRecords(root, new Map([['org.example.hello', record()]]));
    const t = setup();
    t.deps.createHost.mockImplementationOnce((partition: string) =>
      fakeHost(partition, Promise.reject(new Error('ERR_FAILED'))),
    );
    await t.runtime.startAll();
    expect(t.deps.warn).toHaveBeenCalledExactlyOnceWith(
      'Extension org.example.hello could not be loaded.',
    );
  });

  it('starts nothing when nothing is installed', async () => {
    const t = setup();
    await t.runtime.startAll();
    expect(t.runtime.running()).toEqual([]);
  });
});
