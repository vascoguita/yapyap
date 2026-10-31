import { generateKeyPairSync } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { signIndex } from '@yapyap/extension-sign';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RPC_OPTIONS } from './rpc.ts';
import { defaultSettings } from '../settings/decode.ts';
import type { ViewRegistry } from '../views.ts';
import { readFileSync, writeFileSync } from 'node:fs';
import {
  createExtensionChrome,
  installFlow,
  messageOf,
  openConsentWindow,
} from './extension-chrome.ts';
import { loadRecords, RECORDS_FILE, saveRecords, type ExtensionRecord } from './records.ts';
import { unsignedArchive, zipArchive } from '../../../test/extensions.ts';

const ACCOUNT = '6f1c2a5e-0b1d-4c8e-9a3f-2d4b6c8e0a1b';

/** A well-formed fingerprint: 32 bytes as colon-separated hex. */
const KEY = Array.from({ length: 32 }, () => 'ab').join(':');

const record = (id: string, extra: Partial<ExtensionRecord> = {}): ExtensionRecord => ({
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
    limits: {
      metrics: () => [],
      notify: vi.fn(),
      every: vi.fn(),
      now: () => 0,
      cores: 1,
      memoryMb: 8192,
    },
    askHost: vi.fn(() => Promise.resolve(false)),
    askLocal: vi.fn(() => Promise.resolve(false)),
    presentHeaders: (headers: Readonly<Record<string, string>>) => ({ ...headers }),
    confirmRemove: vi.fn(() => Promise.resolve(true)),
    forgetData: vi.fn(() => Promise.resolve()),
    marketplace: {
      source: {
        indexUrl: 'https://packages.example/extensions/index.json',
        signatureUrl: 'https://packages.example/extensions/index.json.sig',
        archiveUrl: (id: string, version: string) => `https://packages.example/${id}-${version}`,
        anchors: [],
      },
      appVersion: '0.1.2',
      fetchIndex: vi.fn(() => Promise.resolve(undefined)),
      fetchArchive: vi.fn(() => Promise.resolve(undefined)),
    },
    ...overrides,
  };
  const settings = defaultSettings();
  const views: ViewRegistry = new WeakMap();
  const warn = vi.fn();
  const insertDraft = vi.fn<(text: string) => Promise<boolean>>(() => Promise.resolve(true));
  const accounts = [{ id: ACCOUNT, name: 'Work' }];
  const chrome = createExtensionChrome(
    deps,
    { current: () => ({ ...settings, extensions: { ...settings.extensions, developerMode } }) },
    { createWindow, views, warn },
    {
      insertDraft,
      calls: {
        record: vi.fn(),
        stop: vi.fn(),
        state: vi.fn(),
        recordings: vi.fn(),
        reveal: vi.fn(),
      },
      readActiveChat: vi.fn(),
      readUnreadSummary: vi.fn(),
      replaceDraft: vi.fn(),
      readDraft: vi.fn(),
      pressEnter: vi.fn(() => Promise.resolve(true)),
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

describe('createExtensionChrome', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'yapyap-extension-chrome-'));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('lists the marketplace with the versions installed here, and marks pulled ones', async () => {
    const key = generateKeyPairSync('ed25519');
    const extension = {
      id: 'org.example.hello',
      name: 'Hello',
      summary: 'Says hello.',
      author: { name: 'Example' },
      homepage: 'https://example.org',
      license: 'MIT',
      review: 'reviewed',
      signer: Array.from({ length: 32 }, () => 'ab').join(':'),
      versions: [
        {
          version: '1.0.0',
          size: 1,
          sha256: `sha256-${'A'.repeat(43)}=`,
          capabilities: [],
          hosts: [],
          minYapYap: '0.1.0',
          published: '2026-10-27T08:00:00.000Z',
        },
      ],
    };
    const bytes = new TextEncoder().encode(
      JSON.stringify({
        format: 1,
        serial: 1,
        generated: new Date(Date.now() - 60_000).toISOString(),
        expires: new Date(Date.now() + 86_400_000).toISOString(),
        extensions: [extension],
        revoked: [
          { id: 'org.example.bad', versions: '*', signer: extension.signer, reason: 'Gone.' },
        ],
      }),
    );
    const signature = new TextEncoder().encode(signIndex(bytes, key.privateKey));
    const t = setup(root, false, {
      marketplace: {
        source: {
          indexUrl: 'https://packages.example/index.json',
          signatureUrl: 'https://packages.example/index.json.sig',
          archiveUrl: () => 'https://packages.example/archive',
          anchors: [key.publicKey.export({ format: 'pem', type: 'spki' })],
        },
        appVersion: '0.1.2',
        fetchIndex: (url: string) => Promise.resolve(url.endsWith('.sig') ? signature : bytes),
        fetchArchive: () => Promise.resolve(undefined),
      },
    });
    const signer = extension.signer;
    await saveRecords(
      root,
      new Map([
        ['org.example.hello', record('org.example.hello', { developer: true })],
        ['org.example.bad', record('org.example.bad', { fingerprint: signer })],
      ]),
    );
    expect(await t.handler('extensions:marketplace').handle({ sender: {} })).toEqual({
      status: 'ready',
      extensions: [expect.objectContaining({ installed: '1.0.0', action: 'installed' })],
    });
    // The pulled extension stays installed, marked, and the other is left as it was.
    const records = await loadRecords(root);
    expect(records.get('org.example.bad')?.pulled).toBe('Gone.');
    expect(records.get('org.example.hello')?.pulled).toBeUndefined();
  });

  it('says when the installed extensions cannot be read, and starts none', async () => {
    // A folder where the records file should be cannot be read as one.
    mkdirSync(join(root, RECORDS_FILE));
    const t = setup(root);
    await vi.waitFor(() => {
      expect(t.warn).toHaveBeenCalledExactlyOnceWith(
        'Could not read the installed extensions, so none was started.',
      );
    });
    expect(t.deps.createHost).not.toHaveBeenCalled();
  });

  it('lets a running extension’s drafts and chat reads go where YapYap sends them', async () => {
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
        webRequest: {
          onBeforeRequest: vi.fn(),
          onBeforeSendHeaders: vi.fn(),
          onHeadersReceived: vi.fn(),
        },
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
    // Hello does not hold assistant:bar, so the bar serves no one and ignores its offer.
    const [, services] = t.deps.methodsFor.mock.calls[0] as unknown as [
      unknown,
      { offerAssistant: (offer: { suggestions: string[] }) => void },
    ];
    services.offerAssistant({ suggestions: ['On my way'] });
    const view = { show: vi.fn(), publish: vi.fn() };
    t.chrome.attachAssistantBar((bar) => {
      expect(bar.state()).toEqual(expect.objectContaining({ extension: '', suggestions: [] }));
      return view;
    });
    expect(view.show).toHaveBeenLastCalledWith(false);
    expect(view.publish).not.toHaveBeenCalled();
  });

  it('lets the user take a grant back and give it again, for one account or the extension', async () => {
    const hello = record('org.example.hello', {
      developer: true,
      capabilities: ['composer:insert-draft', 'notifications:show'],
    });
    await saveRecords(root, new Map([['org.example.hello', hello]]));
    const t = setup(root);
    const set = t.handler('extensions:set-grant');
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
      extensions: { grants: unknown[] }[];
    };
    expect(list.extensions[0]?.grants).toEqual([
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

  it('forgets the user’s answer about looking for models once local-network is turned off or on', async () => {
    const hello = record('org.example.hello', {
      developer: true,
      capabilities: ['local-network', 'notifications:show'],
      modelSearch: false,
    });
    await saveRecords(root, new Map([['org.example.hello', hello]]));
    const t = setup(root);
    const set = t.handler('extensions:set-grant');
    const call = { sender: {} };
    const kept = async () => (await loadRecords(root)).get('org.example.hello')?.modelSearch;
    await set.handle(call, 'org.example.hello', 'notifications:show', null, false);
    expect(await kept()).toBe(false);
    await set.handle(call, 'org.example.hello', 'local-network', null, false);
    expect(await kept()).toBeUndefined();
    await saveRecords(root, new Map([['org.example.hello', { ...hello, modelSearch: true }]]));
    await set.handle(call, 'org.example.hello', 'local-network', null, true);
    expect(await kept()).toBeUndefined();
  });

  it('removes an extension through IPC once the user confirms, and answers with the list', async () => {
    const hello = record('org.example.hello', { developer: true });
    await saveRecords(root, new Map([['org.example.hello', hello]]));
    const session = { clearStorageData: vi.fn(), clearCache: vi.fn() };
    const t = setup(root, false, { sessionOf: () => session });
    const remove = t.handler('extensions:remove');
    expect(remove.accepts(['org.example.hello'])).toBe(true);
    for (const args of [[], [7], ['x'.repeat(301)], ['org.example.hello', 'more']]) {
      expect(remove.accepts(args)).toBe(false);
    }
    t.chrome.openExtensions();
    const list = (await remove.handle({ sender: {} }, 'org.example.hello')) as {
      extensions: unknown[];
    };
    // Every open Extensions window lists again, not just the one that asked (#342).
    expect(t.windows[0]?.webContents.send).toHaveBeenCalledWith('extensions:changed');
    expect(list.extensions).toEqual([]);
    expect(t.deps.confirmRemove).toHaveBeenCalledExactlyOnceWith('org.example.hello');
    expect(t.deps.forgetData).toHaveBeenCalledExactlyOnceWith('org.example.hello');
    expect(session.clearStorageData).toHaveBeenCalledTimes(2);
  });

  it('saves an extension setting through IPC, checking it against the extension’s form', async () => {
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
    const set = t.handler('extensions:set-setting');
    expect(set.accepts(['org.example.hello', 'concise', true])).toBe(true);
    expect(set.accepts(['org.example.hello', 'concise', [true]])).toBe(false);
    const list = (await set.handle({ sender: {} }, 'org.example.hello', 'concise', true)) as {
      extensions: { settings: unknown[] }[];
    };
    expect(list.extensions[0]?.settings).toEqual([
      { key: 'concise', type: 'boolean', value: true },
    ]);
  });

  it('lists installed extensions by ID, marked by who vouches for them', async () => {
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
    // A file edited by hand can list extensions in any order.
    const path = join(root, RECORDS_FILE);
    const file = JSON.parse(readFileSync(path, 'utf8')) as { extensions: Record<string, unknown> };
    file.extensions = Object.fromEntries(Object.entries(file.extensions).reverse());
    writeFileSync(path, JSON.stringify(file));
    const t = setup(root, true);
    await expect(t.handler('extensions:list').handle({ sender: {} })).resolves.toEqual({
      extensions: [
        {
          id: 'org.alpha',
          version: '1.0.0',
          trust: 'third-party',
          pulled: null,
          grants: [],
          settings: [],
        },
        {
          id: 'org.guita.yapyap.ai',
          version: '1.0.0',
          trust: 'first-party',
          pulled: null,
          grants: [],
          settings: [],
        },
        {
          id: 'org.zeta',
          version: '1.0.0',
          trust: 'developer',
          pulled: null,
          grants: [],
          settings: [],
        },
      ],
      developerMode: true,
      activity: [],
    });
  });

  it('lists nothing before any extension is installed', async () => {
    const t = setup(join(root, 'missing'));
    await expect(t.handler('extensions:list').handle({ sender: {} })).resolves.toEqual({
      extensions: [],
      developerMode: false,
      activity: [],
    });
  });

  it('opens the Extensions window once, and installs from the archive the user picks', async () => {
    const t = setup(root);
    t.chrome.openExtensions();
    t.chrome.openExtensions();
    expect(t.windows).toHaveLength(1);
    expect(t.windows[0]?.loadURL).toHaveBeenCalledWith('app://chrome/extensions.html');
    expect(t.windows[0]?.options).toEqual({
      autoHideMenuBar: true,
      title: 'Extensions',
      width: 520,
      height: 480,
      minWidth: 400,
      minHeight: 320,
      minimizable: false,
      maximizable: false,
      show: false,
    });
    t.deps.chooseArchive.mockResolvedValueOnce('/tmp/broken.yapyap-extension');
    t.chrome.install();
    await vi.waitFor(() => {
      expect(t.deps.showMessage).toHaveBeenCalledWith({
        type: 'error',
        message: 'This extension cannot be installed.',
        detail: expect.any(String) as string,
      });
    });
  });

  it('asks in the consent window before installing, then says it is installed', async () => {
    const t = setup(root, true);
    t.deps.chooseArchive.mockResolvedValueOnce('/tmp/draft.yapyap-extension');
    t.deps.readFile.mockResolvedValueOnce(zipArchive(unsignedArchive()));
    t.chrome.install();
    await vi.waitFor(() => {
      expect(t.windows).toHaveLength(1);
    });
    const consentWindow = t.windows[0];
    expect(consentWindow?.loadURL).toHaveBeenCalledWith('app://chrome/extension-consent.html');
    const call = { sender: (consentWindow as unknown as { webContents: object }).webContents };
    expect(t.handler('extensions:consent').handle(call)).toMatchObject({ trust: 'developer' });
    t.handler('extensions:answer').handle(call, true, true);
    await vi.waitFor(() => {
      expect(t.deps.showMessage).toHaveBeenCalledWith(expect.objectContaining({ type: 'info' }));
    });
  });

  it('answers consent calls only from the consent window', () => {
    const t = setup(root);
    expect(() => t.handler('extensions:consent').handle({ sender: {} })).toThrow(
      'No extension install belongs to this window.',
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
      message: 'This extension cannot be installed.',
      detail: 'Bad signature.',
    });
    expect(messageOf({ kind: 'failed' })).toEqual({
      type: 'error',
      message: 'The extension could not be installed. Try again.',
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
    expect(window.loadURL).toHaveBeenCalledWith('app://chrome/extension-consent.html');
    expect(createWindow).toHaveBeenCalledWith({
      autoHideMenuBar: true,
      title: 'Install Extension',
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
    root = mkdtempSync(join(tmpdir(), 'yapyap-extension-flow-'));
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
      limits: {
        metrics: () => [],
        notify: vi.fn(),
        every: vi.fn(),
        now: () => 0,
        cores: 1,
        memoryMb: 8192,
      },
      askHost: vi.fn(() => Promise.resolve(false)),
      askLocal: vi.fn(() => Promise.resolve(false)),
      presentHeaders: (headers: Readonly<Record<string, string>>) => ({ ...headers }),
      confirmRemove: vi.fn(),
      forgetData: vi.fn(),
      marketplace: {
        source: {
          indexUrl: 'https://packages.example/extensions/index.json',
          signatureUrl: 'https://packages.example/extensions/index.json.sig',
          archiveUrl: (id: string, version: string) => `https://packages.example/${id}-${version}`,
          anchors: [],
        },
        appVersion: '0.1.2',
        fetchIndex: vi.fn(() => Promise.resolve(undefined)),
        fetchArchive: vi.fn(() => Promise.resolve(undefined)),
      },
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
