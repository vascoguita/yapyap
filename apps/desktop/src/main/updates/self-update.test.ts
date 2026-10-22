import { describe, expect, it, vi } from 'vitest';
import { NOTICE_INTERVAL_MS } from './update-notice.ts';
import { startSelfUpdates } from './self-update.ts';

function fakeUpdater(check: () => Promise<unknown> = () => Promise.resolve()) {
  const listeners = new Map<string, (value: never) => void>();
  return {
    autoDownload: false,
    autoInstallOnAppQuit: true,
    allowPrerelease: true,
    allowDowngrade: true,
    checkForUpdates: vi.fn(check),
    on: vi.fn((event: string, listener: (value: never) => void) => listeners.set(event, listener)),
    quitAndInstall: vi.fn(),
    emit: (event: string, value: unknown) => {
      listeners.get(event)?.(value as never);
    },
  };
}

function deps(policy: 'self-update' | 'notify' | 'system' | 'manual', agree = true) {
  return {
    policy,
    askToInstall: vi.fn(() => Promise.resolve(agree)),
    every: vi.fn(),
    warn: vi.fn(),
  };
}

const flush = () => new Promise((resolve) => setTimeout(resolve));

describe('startSelfUpdates', () => {
  it.each(['notify', 'system', 'manual'] as const)('does nothing under the %s policy', (policy) => {
    const updater = fakeUpdater();
    const d = deps(policy);
    const create = vi.fn(() => updater);
    startSelfUpdates(create, d);
    expect(create).not.toHaveBeenCalled();
    expect(updater.checkForUpdates).not.toHaveBeenCalled();
    expect(updater.on).not.toHaveBeenCalled();
    expect(updater.autoInstallOnAppQuit).toBe(true);
  });

  it('downloads only stable upgrades and never installs on its own', () => {
    const updater = fakeUpdater();
    const d = deps('self-update');
    startSelfUpdates(() => updater, d);
    expect(updater).toEqual(
      expect.objectContaining({
        autoDownload: true,
        autoInstallOnAppQuit: false,
        allowPrerelease: false,
        allowDowngrade: false,
      }),
    );
    expect(updater.checkForUpdates).toHaveBeenCalledOnce();
    expect(d.every).toHaveBeenCalledExactlyOnceWith(expect.any(Function), NOTICE_INTERVAL_MS);
    (d.every.mock.calls[0]?.[0] as () => void)();
    expect(updater.checkForUpdates).toHaveBeenCalledTimes(2);
  });

  it('installs a downloaded update only after the user agrees to restart', async () => {
    const updater = fakeUpdater();
    const d = deps('self-update');
    startSelfUpdates(() => updater, d);
    updater.emit('update-downloaded', { version: '0.2.0' });
    await flush();
    expect(d.askToInstall).toHaveBeenCalledExactlyOnceWith('0.2.0');
    expect(updater.quitAndInstall).toHaveBeenCalledOnce();
  });

  it('keeps running the current version when the user says later', async () => {
    const updater = fakeUpdater();
    const d = deps('self-update', false);
    startSelfUpdates(() => updater, d);
    updater.emit('update-downloaded', { version: '0.2.0' });
    await flush();
    expect(updater.quitAndInstall).not.toHaveBeenCalled();
  });

  it('logs failed checks, updater errors and a prompt that could not open', async () => {
    const updater = fakeUpdater(() => Promise.reject(new Error('offline')));
    const d = deps('self-update');
    d.askToInstall.mockRejectedValueOnce(new Error('no display'));
    startSelfUpdates(() => updater, d);
    await flush();
    updater.emit('error', new Error('bad signature'));
    updater.emit('update-downloaded', { version: '0.2.0' });
    await flush();
    expect(d.warn.mock.calls).toEqual([
      ['Could not check for or download a YapYap update.'],
      ['Could not check for or download a YapYap update.'],
      ['Could not ask about installing a YapYap update.'],
    ]);
    expect(updater.quitAndInstall).not.toHaveBeenCalled();
  });
});
