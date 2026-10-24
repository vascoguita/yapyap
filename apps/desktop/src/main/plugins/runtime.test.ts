import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import type { ViewRegistry } from '../views.ts';
import { loadRecords, saveRecords, type PluginRecord } from './records.ts';
import { Type } from 'typebox';
import type { ProcessMetrics } from './resource-guard.ts';
import { RPC_OPTIONS } from './rpc.ts';
import { createPluginRuntime, pluginPartition } from './runtime.ts';

const MANIFEST = {
  id: 'org.example.hello',
  name: 'Hello',
  version: '1.0.0',
  author: { name: 'Example' },
  apiVersion: '1.0.0',
  entry: 'main.js',
  capabilities: [],
};

const record = (overrides: Partial<PluginRecord> = {}): PluginRecord => ({
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

async function install(plugin: PluginRecord, manifest: object | string = MANIFEST): Promise<void> {
  const folder = join(root, plugin.id, plugin.version);
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
  readonly webRequest: { readonly onBeforeRequest: Mock<(listener: unknown) => void> };
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

function setup() {
  const sampled: (() => void)[] = [];
  const sessions = new Map<string, FakeSession>();
  const hosts: FakeHost[] = [];
  const views: ViewRegistry = new WeakMap();
  const deps = {
    root,
    sessionOf: vi.fn((partition: string): FakeSession => {
      const session = sessions.get(partition) ?? {
        protocol: { handle: vi.fn() },
        webRequest: { onBeforeRequest: vi.fn() },
      };
      sessions.set(partition, session);
      return session;
    }),
    createHost: vi.fn((partition: string): FakeHost => {
      const host = fakeHost(partition);
      hosts.push(host);
      return host;
    }),
    readFile: (path: string) => readFile(path),
    views,
    warn: vi.fn(),
    methodsFor: vi.fn(() => ({
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
    askHost: vi.fn<(plugin: string, host: string) => Promise<boolean>>(() =>
      Promise.resolve(false),
    ),
    activeAccount: vi.fn((): string | undefined => undefined),
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
  return { deps, sessions, hosts, views, only, sample, runtime: createPluginRuntime(deps) };
}

describe('pluginPartition', () => {
  it('keeps a plugin’s storage only when it may store data', () => {
    expect(pluginPartition(record())).toBe('plugin:org.example.hello');
    expect(pluginPartition(record({ capabilities: ['storage:local'] }))).toBe(
      'persist:plugin:org.example.hello',
    );
  });
});

describe('createPluginRuntime', () => {
  it('runs each installed plugin in a hidden window of its own, serving only its files', async () => {
    await install(record());
    await saveRecords(root, new Map([['org.example.hello', record()]]));
    const t = setup();
    await t.runtime.startAll();
    expect(t.runtime.running()).toEqual(['org.example.hello']);
    const host = t.only(t.hosts);
    expect(host.partition).toBe('plugin:org.example.hello');
    expect(host.loadURL).toHaveBeenCalledExactlyOnceWith('plugin://org.example.hello/');
    expect(t.views.get(host.webContents)).toEqual({
      zone: 'plugin',
      home: 'plugin://org.example.hello',
      label: 'org.example.hello',
    });
    const session = t.only([...t.sessions.values()]);
    expect(t.deps.sessionOf).toHaveBeenCalledExactlyOnceWith('plugin:org.example.hello');
    expect(session.webRequest.onBeforeRequest).toHaveBeenCalledOnce();
    const [scheme, serve] = t.only(session.protocol.handle.mock.calls);
    expect(scheme).toBe('plugin');
    const script = await serve({ url: 'plugin://org.example.hello/main.js' });
    expect(await script.text()).toBe('export default {};');
  });

  it('gives each page the plugin loads a port of its own, served with the plugin’s name', async () => {
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
    expect(t.deps.methodsFor).toHaveBeenCalledExactlyOnceWith({
      id: 'org.example.hello',
      name: 'Hello',
    });
    // A call over the port is audited under the plugin's ID.
    const [port] = host.ports;
    const receive = port?.on.mock.calls[0]?.[1];
    receive?.({ data: { id: 1, method: 'notifications.show', params: [] } });
    await vi.waitFor(() => {
      expect(t.deps.audit.record).toHaveBeenCalledExactlyOnceWith({
        plugin: 'org.example.hello',
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

  it('restarts a plugin over its limits, stops one that keeps going over, and lists processes', async () => {
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

  it('says when a plugin over its limits cannot be restarted', async () => {
    await install(record());
    await saveRecords(root, new Map([['org.example.hello', record()]]));
    const t = setup();
    await t.runtime.startAll();
    t.deps.limits.metrics.mockReturnValue([
      { pid: 4242, cpu: { percentCPUUsage: 100 }, memory: { workingSetSize: 0 } },
    ]);
    // The records file became unreadable, as a folder in its place is.
    await rm(join(root, '.plugins.json'));
    await mkdir(join(root, '.plugins.json'));
    for (let index = 0; index < 3; index += 1) {
      t.sample();
    }
    await vi.waitFor(() => {
      expect(t.deps.warn).toHaveBeenCalledWith('Plugin org.example.hello could not be restarted.');
    });
  });

  it('lets a plugin reach a host the user allows, and keeps that for good', async () => {
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
    // An approval that lands after the plugin was removed records nothing.
    await saveRecords(root, new Map());
    expect(await request('https://other.example.net/')).toBe(true);
    expect(await loadRecords(root)).toEqual(new Map());
  });

  it('lists the running plugins’ commands, runs one over the port, and says when they change', async () => {
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
        plugin: 'org.example.hello',
        pluginName: 'Hello',
        id: 'translate',
        title: 'Translate draft',
      },
    ]);
    // Before its page has loaded, the plugin has no port to take the command.
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

  it('starts an updated plugin again on the same session, from its new folder', async () => {
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

  it('skips a plugin whose manifest is missing or broken, saying so', async () => {
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
      'Plugin org.example.hello has no readable manifest, so it was not started.',
    );
    expect(t.deps.warn).toHaveBeenCalledTimes(2);
  });

  it('says when a plugin page cannot load', async () => {
    await install(record());
    await saveRecords(root, new Map([['org.example.hello', record()]]));
    const t = setup();
    t.deps.createHost.mockImplementationOnce((partition: string) =>
      fakeHost(partition, Promise.reject(new Error('ERR_FAILED'))),
    );
    await t.runtime.startAll();
    expect(t.deps.warn).toHaveBeenCalledExactlyOnceWith(
      'Plugin org.example.hello could not be loaded.',
    );
  });

  it('starts nothing when nothing is installed', async () => {
    const t = setup();
    await t.runtime.startAll();
    expect(t.runtime.running()).toEqual([]);
  });
});
