import { describe, expect, it, vi } from 'vitest';
import { en } from '../../shared/messages/en.ts';
import { refuseUnsafeStart, sandboxDisabled, TROUBLESHOOTING_URL } from './sandbox-check.ts';

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
      explain: vi.fn(() => {
        order.push('explain');
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
    expect(t.order).toEqual(['log', 'ready', 'explain', 'quit']);
    expect(t.deps.logError).toHaveBeenCalledExactlyOnceWith(
      `${en.dialogs.unsafeStart.message}. ${en.dialogs.unsafeStart.detail}`,
    );
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
    expect(en.dialogs.unsafeStart.detail).toMatch(/\.deb, \.rpm or Flatpak/);
    expect(en.dialogs.unsafeStart.detail).toMatch(/AppArmor profile/);
    expect(en.dialogs.unsafeStart.detail).not.toMatch(/--no-sandbox|sysctl/);
  });

  it('says each thing once, since the log joins the message and the detail', () => {
    expect(en.dialogs.unsafeStart.detail).not.toContain('cannot start safely');
  });
});
