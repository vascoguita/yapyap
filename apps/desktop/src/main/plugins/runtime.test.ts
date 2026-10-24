import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import type { ViewRegistry } from '../views.ts';
import { saveRecords, type PluginRecord } from './records.ts';
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

interface FakeHost {
  readonly partition: string;
  readonly webContents: object;
  readonly loadURL: Mock<(url: string) => Promise<unknown>>;
  readonly destroy: Mock<() => void>;
}

const fakeHost = (partition: string, loaded: Promise<unknown> = Promise.resolve()): FakeHost => ({
  partition,
  webContents: {},
  loadURL: vi.fn(() => loaded),
  destroy: vi.fn(),
});

function setup() {
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
  };
  const only = <T>(items: readonly T[]): T => {
    const [item] = items;
    if (items.length !== 1 || item === undefined) {
      throw new Error(`Expected one item, got ${String(items.length)}.`);
    }
    return item;
  };
  return { deps, sessions, hosts, views, only, runtime: createPluginRuntime(deps) };
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
