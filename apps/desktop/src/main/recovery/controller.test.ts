import { describe, expect, it, vi, type Mock } from 'vitest';
import type { ViewInfo } from '../views.ts';
import { createRecovery, type Overlay } from './controller.ts';

const ORIGIN = 'https://web.whatsapp.com';
const BLANK = { kind: 'blank' } as const;

function setup() {
  interface FakeOverlay {
    readonly webContents: { readonly loadURL: Mock<(url: string) => Promise<void>> };
    readonly remove: Mock<() => void>;
  }
  const overlays: FakeOverlay[] = [];
  const createOverlay = vi.fn((): Overlay & FakeOverlay => {
    const overlay = {
      webContents: { loadURL: vi.fn<(url: string) => Promise<void>>(() => Promise.resolve()) },
      remove: vi.fn(),
    };
    overlays.push(overlay);
    return overlay;
  });
  const contents = {
    loadURL: vi.fn(() => Promise.resolve()),
    session: {
      clearCache: vi.fn(() => Promise.resolve()),
      clearStorageData: vi.fn(() => Promise.resolve()),
    },
  };
  const views = new WeakMap<object, ViewInfo>();
  const deps = {
    contents,
    origin: ORIGIN,
    createOverlay,
    views,
    writeClipboard: vi.fn(() => Promise.resolve()),
    technicalDetails: () => 'YapYap 0.1.0 (deb)',
    warn: vi.fn(),
  };
  return { deps, overlays, recovery: createRecovery(deps) };
}

const settle = () => new Promise((resolve) => setTimeout(resolve));

describe('createRecovery', () => {
  it('lays the recovery screen over the window as an app chrome view', () => {
    const t = setup();
    t.recovery.show(BLANK);
    const [overlay] = t.overlays;
    expect(overlay?.webContents.loadURL).toHaveBeenCalledWith('app://chrome/recovery.html');
    expect(overlay && t.deps.views.get(overlay.webContents)).toEqual({
      zone: 'chrome',
      home: 'app://chrome',
      label: 'YapYap',
    });
    expect(overlay && t.recovery.owns(overlay.webContents)).toBe(true);
    expect(t.recovery.owns({})).toBe(false);
    expect(t.recovery.problem()).toEqual({
      kind: 'blank',
      description: 'WhatsApp loaded a blank page.',
    });
  });

  it('reuses the open screen and shows the newest problem', () => {
    const t = setup();
    t.recovery.show(BLANK);
    t.recovery.show({ kind: 'unsupported' });
    expect(t.deps.createOverlay).toHaveBeenCalledOnce();
    expect(t.overlays[0]?.webContents.loadURL).toHaveBeenCalledTimes(2);
    expect(t.recovery.problem()?.kind).toBe('unsupported');
  });

  it('removes the screen and reloads WhatsApp on retry', async () => {
    const t = setup();
    t.recovery.show(BLANK);
    await t.recovery.retry();
    expect(t.overlays[0]?.remove).toHaveBeenCalledOnce();
    expect(t.deps.contents.loadURL).toHaveBeenCalledExactlyOnceWith(ORIGIN);
    expect(t.recovery.problem()).toBeNull();
    expect(t.overlays[0] && t.recovery.owns(t.overlays[0].webContents)).toBe(false);
  });

  it('leaves a failed reload to the load monitor', async () => {
    const t = setup();
    t.deps.contents.loadURL.mockRejectedValueOnce(new Error('ERR_CONNECTION_REFUSED'));
    await expect(t.recovery.retry()).resolves.toBeUndefined();
  });

  it('clears only the cache and service workers, keeping the login, then retries', async () => {
    const t = setup();
    t.recovery.show(BLANK);
    await t.recovery.clearCacheAndRetry();
    expect(t.deps.contents.session.clearCache).toHaveBeenCalledOnce();
    expect(t.deps.contents.session.clearStorageData).toHaveBeenCalledExactlyOnceWith({
      storages: ['serviceworkers', 'cachestorage'],
    });
    expect(t.deps.contents.loadURL).toHaveBeenCalledWith(ORIGIN);
  });

  it('copies the technical details with the current problem', async () => {
    const t = setup();
    await t.recovery.copyDiagnostics();
    t.recovery.show(BLANK);
    await t.recovery.copyDiagnostics();
    expect(t.deps.writeClipboard.mock.calls).toEqual([
      ['YapYap 0.1.0 (deb)\nProblem: none'],
      ['YapYap 0.1.0 (deb)\nProblem: WhatsApp loaded a blank page.'],
    ]);
  });

  it('logs a recovery screen that fails to load', async () => {
    const t = setup();
    t.recovery.show(BLANK);
    t.overlays[0]?.webContents.loadURL.mockRejectedValueOnce(new Error('ERR_FAILED'));
    t.recovery.show(BLANK);
    await settle();
    expect(t.deps.warn).toHaveBeenCalledExactlyOnceWith('Could not load the recovery screen.');
  });
});
