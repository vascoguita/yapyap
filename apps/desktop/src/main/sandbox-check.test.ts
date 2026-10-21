import { describe, expect, it, vi } from 'vitest';
import {
  refuseUnsafeStart,
  sandboxDisabled,
  TROUBLESHOOTING_URL,
  UNSAFE_START_MESSAGE,
} from './sandbox-check.ts';

const switches = (...present: string[]) => ({
  hasSwitch: (name: string) => present.includes(name),
});

describe('sandboxDisabled', () => {
  it('sees --no-sandbox and ELECTRON_DISABLE_SANDBOX', () => {
    expect(sandboxDisabled(switches('no-sandbox'), {})).toBe(true);
    expect(sandboxDisabled(switches(), { ELECTRON_DISABLE_SANDBOX: '1' })).toBe(true);
  });

  it('is false for an ordinary start', () => {
    expect(sandboxDisabled(switches('safe-mode'), { ELECTRON_DISABLE_SANDBOX: '' })).toBe(false);
    expect(sandboxDisabled(switches(), {})).toBe(false);
  });
});

describe('refuseUnsafeStart', () => {
  function setup(wantsGuide: boolean) {
    const order: string[] = [];
    const deps = {
      whenReady: vi.fn(() => {
        order.push('ready');
        return Promise.resolve();
      }),
      explain: vi.fn((message: string) => {
        order.push(`explain:${message === UNSAFE_START_MESSAGE ? 'message' : 'other'}`);
        return Promise.resolve(wantsGuide);
      }),
      openExternal: vi.fn(() => Promise.resolve()),
      logError: vi.fn(() => {
        order.push('log');
      }),
      quit: vi.fn(() => {
        order.push('quit');
      }),
    };
    return { deps, order };
  }

  it('logs, explains once ready, and quits', async () => {
    const t = setup(false);
    await refuseUnsafeStart(t.deps);
    expect(t.order).toEqual(['log', 'ready', 'explain:message', 'quit']);
    expect(t.deps.logError).toHaveBeenCalledExactlyOnceWith(UNSAFE_START_MESSAGE);
    expect(t.deps.openExternal).not.toHaveBeenCalled();
  });

  it('opens the troubleshooting guide when asked, and quits even if that fails', async () => {
    const t = setup(true);
    t.deps.openExternal.mockRejectedValueOnce(new Error('no browser'));
    await refuseUnsafeStart(t.deps);
    expect(t.deps.openExternal).toHaveBeenCalledExactlyOnceWith(TROUBLESHOOTING_URL);
    expect(t.deps.quit).toHaveBeenCalledOnce();
  });

  it('points to the safe options and never suggests turning the sandbox off', () => {
    expect(UNSAFE_START_MESSAGE).toMatch(/\.deb, \.rpm or Flatpak/);
    expect(UNSAFE_START_MESSAGE).toMatch(/AppArmor profile/);
    expect(UNSAFE_START_MESSAGE).not.toMatch(/--no-sandbox|sysctl/);
  });
});
