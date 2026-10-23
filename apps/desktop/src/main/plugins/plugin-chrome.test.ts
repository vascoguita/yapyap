import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultSettings } from '../settings/decode.ts';
import type { ViewRegistry } from '../views.ts';
import { readFileSync } from 'node:fs';
import { createPluginChrome, installFlow, messageOf, openConsentWindow } from './plugin-chrome.ts';
import { saveRecords, type PluginRecord } from './records.ts';
import { unsignedArchive, zipArchive } from '../../../test/plugins.ts';

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

function setup(root: string, developerMode = false) {
  const windows: { loadURL: ReturnType<typeof vi.fn>; options: object }[] = [];
  const createWindow = vi.fn((options: object) => {
    const window = {
      options,
      webContents: {},
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
  };
  const settings = defaultSettings();
  const views: ViewRegistry = new WeakMap();
  const chrome = createPluginChrome(
    deps,
    { current: () => ({ ...settings, plugins: { developerMode } }) },
    { createWindow, views, warn: vi.fn() },
  );
  const handler = (channel: string) => {
    const found = chrome.handlers.find((candidate) => candidate.channel === channel);
    if (found === undefined) {
      throw new Error(`No handler for ${channel}`);
    }
    return found;
  };
  return { deps, chrome, windows, handler };
}

describe('createPluginChrome', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'yapyap-plugin-chrome-'));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
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
    const t = setup(root, true);
    await expect(t.handler('plugins:list').handle({ sender: {} })).resolves.toEqual({
      plugins: [
        { id: 'org.alpha', version: '1.0.0', trust: 'third-party' },
        { id: 'org.guita.yapyap.ai', version: '1.0.0', trust: 'first-party' },
        { id: 'org.zeta', version: '1.0.0', trust: 'developer' },
      ],
      developerMode: true,
    });
  });

  it('lists nothing before any plugin is installed', async () => {
    const t = setup(join(root, 'missing'));
    await expect(t.handler('plugins:list').handle({ sender: {} })).resolves.toEqual({
      plugins: [],
      developerMode: false,
    });
  });

  it('opens the Plugins window once, and installs from the archive the user picks', async () => {
    const t = setup(root);
    t.chrome.openPlugins();
    t.chrome.openPlugins();
    expect(t.windows).toHaveLength(1);
    expect(t.windows[0]?.loadURL).toHaveBeenCalledWith('app://chrome/plugins.html');
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
      webContents: {},
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
    const consent = openConsentWindow({ createWindow: () => window, views, warn: vi.fn() });
    expect(window.loadURL).toHaveBeenCalledWith('app://chrome/plugin-consent.html');
    expect(consent.webContents).toBe(window.webContents);
    const listener = vi.fn();
    consent.onClosed(listener);
    closed?.();
    expect(listener).toHaveBeenCalledOnce();
    consent.close();
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
    };
    const flow = installFlow(deps, { current: defaultSettings }, vi.fn());
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
    flow.report({ kind: 'failed' });
    expect(showMessage).toHaveBeenCalledWith(expect.objectContaining({ type: 'error' }));
  });
});
