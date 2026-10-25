import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RPC_OPTIONS } from './rpc.ts';
import { defaultSettings } from '../settings/decode.ts';
import type { ViewRegistry } from '../views.ts';
import { readFileSync, writeFileSync } from 'node:fs';
import { createPluginChrome, installFlow, messageOf, openConsentWindow } from './plugin-chrome.ts';
import { loadRecords, RECORDS_FILE, saveRecords, type PluginRecord } from './records.ts';
import { unsignedArchive, zipArchive } from '../../../test/plugins.ts';

const ACCOUNT = '6f1c2a5e-0b1d-4c8e-9a3f-2d4b6c8e0a1b';

/** A well-formed fingerprint: 32 bytes as colon-separated hex. */
const KEY = Array.from({ length: 32 }, () => 'ab').join(':');

const record = (id: string, extra: Partial<PluginRecord> = {}): PluginRecord => ({
  id,
  version: '1.0.0',
  fingerprint: null,
  firstParty: false,
  developer: false,
  capabilities: [],
  hosts: [],
  ...extra,
});

function setup(root: string, developerMode = false, overrides: object = {}) {
  const windows: {
    loadURL: ReturnType<typeof vi.fn>;
    options: object;
    webContents: { send: ReturnType<typeof vi.fn> };
  }[] = [];
  const createWindow = vi.fn((options: object) => {
    const window = {
      options,
      webContents: { send: vi.fn() },
      isDestroyed: vi.fn(() => false),
      focus: vi.fn(),
      once: vi.fn(),
      close: vi.fn(),
      show: vi.fn(),
      loadURL: vi.fn(() => Promise.resolve()),
    };
    windows.push(window);
    return window;
  });
  const deps = {
    root,
    anchors: new Set<string>(),
    chooseArchive: vi.fn(() => Promise.resolve<string | undefined>(undefined)),
    readFile: vi.fn(() => Promise.resolve<Uint8Array>(new Uint8Array())),
    showMessage: vi.fn(),
    sessionOf: vi.fn(),
    createHost: vi.fn(),
    createPanel: vi.fn(),
    methodsFor: vi.fn(() => ({})),
    rpc: { ...RPC_OPTIONS, now: () => 0, after: vi.fn() },
    audit: { record: vi.fn(), recent: vi.fn(() => []) },
    limits: { metrics: () => [], notify: vi.fn(), every: vi.fn(), now: () => 0, cores: 1 },
    askHost: vi.fn(() => Promise.resolve(false)),
    confirmRemove: vi.fn(() => Promise.resolve(true)),
    forgetData: vi.fn(() => Promise.resolve()),
    ...overrides,
  };
  const settings = defaultSettings();
  const views: ViewRegistry = new WeakMap();
  const warn = vi.fn();
  const insertDraft = vi.fn<(text: string) => Promise<boolean>>(() => Promise.resolve(true));
  const accounts = [{ id: ACCOUNT, name: 'Work' }];
  const chrome = createPluginChrome(
    deps,
    { current: () => ({ ...settings, plugins: { ...settings.plugins, developerMode } }) },
    { createWindow, views, warn },
    {
      insertDraft,
      readActiveChat: vi.fn(),
      replaceDraft: vi.fn(),
      readDraft: vi.fn(),
      active: () => undefined,
      list: () => accounts,
    },
  );
  const handler = (channel: string) => {
    const found = chrome.handlers.find((candidate) => candidate.channel === channel);
    if (found === undefined) {
      throw new Error(`No handler for ${channel}`);
    }
    return found;
  };
  return { deps, chrome, windows, handler, warn, insertDraft };
}

describe('createPluginChrome', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'yapyap-plugin-chrome-'));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('says when the installed plugins cannot be read, and starts none', async () => {
    // A folder where the records file should be cannot be read as one.
    mkdirSync(join(root, RECORDS_FILE));
    const t = setup(root);
    await vi.waitFor(() => {
      expect(t.warn).toHaveBeenCalledExactlyOnceWith(
        'Could not read the installed plugins, so none was started.',
      );
    });
    expect(t.deps.createHost).not.toHaveBeenCalled();
  });

  it('lets a running plugin’s drafts and chat reads go where YapYap sends them', async () => {
    const folder = join(root, 'org.example.hello', '1.0.0');
    mkdirSync(folder, { recursive: true });
    writeFileSync(
      join(folder, 'manifest.json'),
      JSON.stringify({
        id: 'org.example.hello',
        name: 'Hello',
        version: '1.0.0',
        author: { name: 'Example' },
        apiVersion: '1.0.0',
        entry: 'main.js',
        capabilities: [],
      }),
    );
    await saveRecords(
      root,
      new Map([['org.example.hello', record('org.example.hello', { developer: true })]]),
    );
    const t = setup(root, false, {
      readFile: (path: string) => Promise.resolve(new Uint8Array(readFileSync(path))),
      sessionOf: () => ({
        protocol: { handle: vi.fn() },
        webRequest: { onBeforeRequest: vi.fn() },
        clearStorageData: () => Promise.resolve(),
        clearCache: () => Promise.resolve(),
      }),
      createHost: () => ({
        webContents: { on: vi.fn(), getOSProcessId: () => 1 },
        loadURL: () => Promise.resolve(),
        destroy: vi.fn(),
        openPort: vi.fn(),
      }),
    });
    await vi.waitFor(() => {
      expect(t.deps.methodsFor).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({ id: 'org.example.hello', name: 'Hello' }),
        expect.objectContaining({ insertDraft: t.insertDraft }),
      );
    });
  });

  it('lets the user take a grant back and give it again, for one account or the plugin', async () => {
    const hello = record('org.example.hello', {
      developer: true,
      capabilities: ['composer:insert-draft', 'notifications:show'],
    });
    await saveRecords(root, new Map([['org.example.hello', hello]]));
    const t = setup(root);
    const set = t.handler('plugins:set-grant');
    const call = { sender: {} };
    expect(set.accepts(['org.example.hello', 'composer:insert-draft', ACCOUNT, false])).toBe(true);
    expect(set.accepts(['org.example.hello', 'notifications:show', null, true])).toBe(true);
    for (const args of [
      ['org.example.hello', 'composer:insert-draft', 'unknown-account', false],
      ['org.example.hello', 'notifications:show', null, 'no'],
      ['org.example.hello', 'x'.repeat(301), null, false],
      [7, 'notifications:show', null, false],
      ['org.example.hello', 'notifications:show', null, false, 'more'],
    ]) {
      expect(set.accepts(args)).toBe(false);
    }
    const list = (await set.handle(
      call,
      'org.example.hello',
      'composer:insert-draft',
      ACCOUNT,
      false,
    )) as {
      plugins: { grants: unknown[] }[];
    };
    expect(list.plugins[0]?.grants).toEqual([
      {
        capability: 'composer:insert-draft',
        granted: true,
        accounts: [{ id: ACCOUNT, name: 'Work', granted: false }],
      },
      { capability: 'notifications:show', granted: true },
    ]);
    await set.handle(call, 'org.example.hello', 'notifications:show', null, false);
    expect((await loadRecords(root)).get('org.example.hello')?.revoked).toEqual([
      'notifications:show',
    ]);
    await set.handle(call, 'org.example.gone', 'notifications:show', null, false);
    expect([...(await loadRecords(root)).keys()]).toEqual(['org.example.hello']);
  });

  it('removes a plugin through IPC once the user confirms, and answers with the list', async () => {
    const hello = record('org.example.hello', { developer: true });
    await saveRecords(root, new Map([['org.example.hello', hello]]));
    const session = { clearStorageData: vi.fn(), clearCache: vi.fn() };
    const t = setup(root, false, { sessionOf: () => session });
    const remove = t.handler('plugins:remove');
    expect(remove.accepts(['org.example.hello'])).toBe(true);
    for (const args of [[], [7], ['x'.repeat(301)], ['org.example.hello', 'more']]) {
      expect(remove.accepts(args)).toBe(false);
    }
    t.chrome.openPlugins();
    const list = (await remove.handle({ sender: {} }, 'org.example.hello')) as {
      plugins: unknown[];
    };
    // Every open Plugins window lists again, not just the one that asked (#342).
    expect(t.windows[0]?.webContents.send).toHaveBeenCalledWith('plugins:changed');
    expect(list.plugins).toEqual([]);
    expect(t.deps.confirmRemove).toHaveBeenCalledExactlyOnceWith('org.example.hello');
    expect(t.deps.forgetData).toHaveBeenCalledExactlyOnceWith('org.example.hello');
    expect(session.clearStorageData).toHaveBeenCalledTimes(2);
  });

  it('saves a plugin setting through IPC, checking it against the plugin’s form', async () => {
    const folder = join(root, 'org.example.hello', '1.0.0');
    mkdirSync(folder, { recursive: true });
    writeFileSync(
      join(folder, 'manifest.json'),
      JSON.stringify({
        id: 'org.example.hello',
        name: 'Hello',
        version: '1.0.0',
        author: { name: 'Example' },
        apiVersion: '1.0.0',
        entry: 'main.js',
        capabilities: [],
        contributes: {
          settings: { type: 'object', properties: { concise: { type: 'boolean' } } },
        },
      }),
    );
    await saveRecords(
      root,
      new Map([['org.example.hello', record('org.example.hello', { developer: true })]]),
    );
    const t = setup(root, false, {
      readFile: (path: string) => Promise.resolve(new Uint8Array(readFileSync(path))),
    });
    const set = t.handler('plugins:set-setting');
    expect(set.accepts(['org.example.hello', 'concise', true])).toBe(true);
    expect(set.accepts(['org.example.hello', 'concise', [true]])).toBe(false);
    const list = (await set.handle({ sender: {} }, 'org.example.hello', 'concise', true)) as {
      plugins: { settings: unknown[] }[];
    };
    expect(list.plugins[0]?.settings).toEqual([{ key: 'concise', type: 'boolean', value: true }]);
  });

  it('lists installed plugins by ID, marked by who vouches for them', async () => {
    await saveRecords(
      root,
      new Map([
        ['org.zeta', record('org.zeta', { developer: true })],
        [
          'org.guita.yapyap.ai',
          record('org.guita.yapyap.ai', { firstParty: true, fingerprint: KEY }),
        ],
        ['org.alpha', record('org.alpha', { fingerprint: KEY })],
      ]),
    );
    // A file edited by hand can list plugins in any order.
    const path = join(root, RECORDS_FILE);
    const file = JSON.parse(readFileSync(path, 'utf8')) as { plugins: Record<string, unknown> };
    file.plugins = Object.fromEntries(Object.entries(file.plugins).reverse());
    writeFileSync(path, JSON.stringify(file));
    const t = setup(root, true);
    await expect(t.handler('plugins:list').handle({ sender: {} })).resolves.toEqual({
      plugins: [
        { id: 'org.alpha', version: '1.0.0', trust: 'third-party', grants: [], settings: [] },
        {
          id: 'org.guita.yapyap.ai',
          version: '1.0.0',
          trust: 'first-party',
          grants: [],
          settings: [],
        },
        { id: 'org.zeta', version: '1.0.0', trust: 'developer', grants: [], settings: [] },
      ],
      developerMode: true,
      activity: [],
    });
  });

  it('lists nothing before any plugin is installed', async () => {
    const t = setup(join(root, 'missing'));
    await expect(t.handler('plugins:list').handle({ sender: {} })).resolves.toEqual({
      plugins: [],
      developerMode: false,
      activity: [],
    });
  });

  it('opens the Plugins window once, and installs from the archive the user picks', async () => {
    const t = setup(root);
    t.chrome.openPlugins();
    t.chrome.openPlugins();
    expect(t.windows).toHaveLength(1);
    expect(t.windows[0]?.loadURL).toHaveBeenCalledWith('app://chrome/plugins.html');
    expect(t.windows[0]?.options).toEqual({
      autoHideMenuBar: true,
      title: 'Plugins',
      width: 520,
      height: 480,
      minWidth: 400,
      minHeight: 320,
      minimizable: false,
      maximizable: false,
      show: false,
    });
    t.deps.chooseArchive.mockResolvedValueOnce('/tmp/broken.yapyap-plugin');
    t.chrome.install();
    await vi.waitFor(() => {
      expect(t.deps.showMessage).toHaveBeenCalledWith({
        type: 'error',
        message: 'This plugin cannot be installed.',
        detail: expect.any(String) as string,
      });
    });
  });

  it('asks in the consent window before installing, then says it is installed', async () => {
    const t = setup(root, true);
    t.deps.chooseArchive.mockResolvedValueOnce('/tmp/draft.yapyap-plugin');
    t.deps.readFile.mockResolvedValueOnce(zipArchive(unsignedArchive()));
    t.chrome.install();
    await vi.waitFor(() => {
      expect(t.windows).toHaveLength(1);
    });
    const consentWindow = t.windows[0];
    expect(consentWindow?.loadURL).toHaveBeenCalledWith('app://chrome/plugin-consent.html');
    const call = { sender: (consentWindow as unknown as { webContents: object }).webContents };
    expect(t.handler('plugins:consent').handle(call)).toMatchObject({ trust: 'developer' });
    t.handler('plugins:answer').handle(call, true, true);
    await vi.waitFor(() => {
      expect(t.deps.showMessage).toHaveBeenCalledWith(expect.objectContaining({ type: 'info' }));
    });
  });

  it('answers consent calls only from the consent window', () => {
    const t = setup(root);
    expect(() => t.handler('plugins:consent').handle({ sender: {} })).toThrow(
      'No plugin install belongs to this window.',
    );
  });
});

describe('messageOf', () => {
  it('tells how an install ended', () => {
    expect(messageOf({ kind: 'installed', name: 'Hello', version: '1.0.0' })).toEqual({
      type: 'info',
      message: 'Hello 1.0.0 is installed.',
      detail: '',
    });
    expect(messageOf({ kind: 'rejected', reason: 'Bad signature.' })).toEqual({
      type: 'error',
      message: 'This plugin cannot be installed.',
      detail: 'Bad signature.',
    });
    expect(messageOf({ kind: 'failed' })).toEqual({
      type: 'error',
      message: 'The plugin could not be installed. Try again.',
      detail: '',
    });
  });
});

describe('openConsentWindow', () => {
  it('opens the consent page, closes it once, and says when it is gone', () => {
    let closed: (() => void) | undefined;
    const window = {
      webContents: { send: vi.fn() },
      isDestroyed: vi.fn(() => false),
      focus: vi.fn(),
      once: vi.fn((event: string, listener: () => void) => {
        if (event === 'closed') {
          closed = listener;
        }
      }),
      close: vi.fn(),
      show: vi.fn(),
      loadURL: vi.fn(() => Promise.resolve()),
    };
    const views: ViewRegistry = new WeakMap();
    const createWindow = vi.fn<(options: object) => typeof window>(() => window);
    const consent = openConsentWindow({ createWindow, views, warn: vi.fn() });
    expect(window.loadURL).toHaveBeenCalledWith('app://chrome/plugin-consent.html');
    expect(createWindow).toHaveBeenCalledWith({
      autoHideMenuBar: true,
      title: 'Install Plugin',
      width: 520,
      height: 620,
      minWidth: 420,
      minHeight: 420,
      minimizable: false,
      maximizable: false,
      show: false,
    });
    expect(consent.webContents).toBe(window.webContents);
    const listener = vi.fn();
    consent.onClosed(listener);
    closed?.();
    expect(listener).toHaveBeenCalledOnce();
    consent.close();
    expect(window.close).toHaveBeenCalledOnce();
    window.isDestroyed.mockReturnValue(true);
    consent.close();
    expect(window.close).toHaveBeenCalledOnce();
  });
});

describe('installFlow', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'yapyap-plugin-flow-'));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('checks archives against this installation, and writes approved ones there', async () => {
    const showMessage = vi.fn();
    const deps = {
      root,
      anchors: new Set<string>(),
      chooseArchive: vi.fn(),
      readFile: vi.fn(),
      showMessage,
      sessionOf: vi.fn(),
      createHost: vi.fn(),
      createPanel: vi.fn(),
      methodsFor: vi.fn(() => ({})),
      rpc: { ...RPC_OPTIONS, now: () => 0, after: vi.fn() },
      audit: { record: vi.fn(), recent: vi.fn(() => []) },
      limits: { metrics: () => [], notify: vi.fn(), every: vi.fn(), now: () => 0, cores: 1 },
      askHost: vi.fn(() => Promise.resolve(false)),
      confirmRemove: vi.fn(),
      forgetData: vi.fn(),
    };
    const started = vi.fn();
    const flow = installFlow(deps, { current: defaultSettings }, vi.fn(), started);
    const prepared = await flow.prepare(new Uint8Array([1, 2, 3]));
    expect(prepared.decision.kind).toBe('rejected');
    const request = {
      id: 'org.example.hello',
      name: 'Hello',
      version: '1.0.0',
      author: { name: 'Example', url: undefined },
      fingerprint: undefined,
      firstParty: false,
      developer: true,
      capabilities: [],
      hosts: [],
    };
    const manifest = { id: 'org.example.hello' } as never;
    await flow.commit({
      decision: { kind: 'consent', request },
      archive: { manifest, files: new Map([['index.js', new Uint8Array([65])]]) },
    });
    expect(readFileSync(join(root, 'org.example.hello', '1.0.0', 'index.js'), 'utf8')).toBe('A');
    expect(started).toHaveBeenCalledExactlyOnceWith('org.example.hello');
    flow.report({ kind: 'failed' });
    expect(showMessage).toHaveBeenCalledWith(expect.objectContaining({ type: 'error' }));
  });
});
