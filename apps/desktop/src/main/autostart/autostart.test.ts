import { describe, expect, it, vi } from 'vitest';
import { en } from '../../shared/messages/en.ts';
import { fakeSettings } from '../../../test/fake-settings.ts';
import {
  applyAutostart,
  chooseAutostart,
  loginItemAutostart,
  portalAutostart,
  syncAutostartSetting,
  type AutostartPort,
} from './autostart.ts';

/** Windows' login items, which find an entry only with the arguments it was written with. */
function loginItems(openAtLogin = false, args: readonly string[] = []) {
  const items = {
    openAtLogin,
    args,
    getLoginItemSettings: (options?: { args: string[] }) => ({
      openAtLogin: items.openAtLogin && (options?.args ?? []).join(' ') === items.args.join(' '),
    }),
    setLoginItemSettings: vi.fn((settings: { openAtLogin: boolean; args?: string[] }) => {
      items.openAtLogin = settings.openAtLogin;
      items.args = settings.args ?? [];
    }),
  };
  return items;
}

const port = (enabled: boolean) => ({
  enabled: () => enabled,
  enable: vi.fn(),
  disable: vi.fn(),
  refresh: vi.fn(),
});

describe('chooseAutostart', () => {
  const xdg = port(false);
  const portal = port(false);

  it('uses login items on Windows and macOS', async () => {
    const items = loginItems();
    for (const platform of ['win32', 'darwin']) {
      await chooseAutostart({
        platform,
        flatpak: false,
        loginItems: items,
        xdg: () => xdg,
        portal: () => portal,
      }).enable();
    }
    expect(items.setLoginItemSettings).toHaveBeenCalledTimes(2);
  });

  it('uses the autostart folder on Linux, and the Background portal inside Flatpak', () => {
    const sources = {
      platform: 'linux',
      loginItems: loginItems(),
      xdg: () => xdg,
      portal: () => portal,
    };
    expect(chooseAutostart({ ...sources, flatpak: false })).toBe(xdg);
    expect(chooseAutostart({ ...sources, flatpak: true })).toBe(portal);
  });
});

describe('portalAutostart', () => {
  it('asks the portal, and remembers what it granted, starting from the setting', async () => {
    const ask = vi.fn((autostart: boolean) => Promise.resolve(autostart));
    const autostart = portalAutostart(ask, false);
    expect(autostart.enabled()).toBe(false);
    await autostart.enable();
    expect(ask).toHaveBeenLastCalledWith(true);
    expect(autostart.enabled()).toBe(true);
    await autostart.disable();
    expect(ask).toHaveBeenLastCalledWith(false);
    expect(autostart.enabled()).toBe(false);
    autostart.refresh();
    expect(ask).toHaveBeenCalledTimes(2);
    expect(portalAutostart(ask, true).enabled()).toBe(true);
  });

  it('keeps what it had when the portal refuses', async () => {
    const autostart = portalAutostart(() => Promise.reject(new Error('cancelled')), true);
    await expect(autostart.disable()).rejects.toThrow('cancelled');
    expect(autostart.enabled()).toBe(true);
  });
});

describe('loginItemAutostart', () => {
  it('reads and writes the login item', () => {
    const items = loginItems();
    const autostart = loginItemAutostart(items);
    void autostart.enable();
    expect(items.setLoginItemSettings).toHaveBeenCalledWith({
      openAtLogin: true,
      args: ['--started-at-login'],
    });
    expect(autostart.enabled()).toBe(true);
    void autostart.disable();
    expect(autostart.enabled()).toBe(false);
    autostart.refresh();
    expect(items.setLoginItemSettings).toHaveBeenLastCalledWith({
      openAtLogin: true,
      args: ['--started-at-login'],
    });
  });

  it('finds a login item from before the login flag, which refresh gives the flag', () => {
    const items = loginItems(true);
    const autostart = loginItemAutostart(items);
    expect(autostart.enabled()).toBe(true);
    autostart.refresh();
    expect(items.args).toEqual(['--started-at-login']);
    expect(autostart.enabled()).toBe(true);
  });
});

describe('syncAutostartSetting', () => {
  it('turns the setting off when the user removed the login item', () => {
    const settings = fakeSettings({ general: { autostart: true } });
    syncAutostartSetting(port(false), settings, vi.fn());
    expect(settings.current().general.autostart).toBe(false);
  });

  it('turns the setting on and refreshes the entry when the login item exists', () => {
    const settings = fakeSettings({ general: { autostart: false } });
    const autostart = port(true);
    syncAutostartSetting(autostart, settings, vi.fn());
    expect(settings.current().general.autostart).toBe(true);
    expect(autostart.refresh).toHaveBeenCalledOnce();
    expect(autostart.enable).not.toHaveBeenCalled();
  });

  it('saves nothing when both agree', () => {
    const settings = fakeSettings({ general: { autostart: false } });
    syncAutostartSetting(port(false), settings, vi.fn());
    expect(settings.update).not.toHaveBeenCalled();
  });

  it('warns and leaves the setting alone when the system cannot be read', () => {
    const settings = fakeSettings({ general: { autostart: true } });
    const warn = vi.fn();
    const broken: AutostartPort = {
      enabled: () => {
        throw new Error('no access');
      },
      enable: vi.fn(),
      disable: vi.fn(),
      refresh: vi.fn(),
    };
    syncAutostartSetting(broken, settings, warn);
    expect(warn).toHaveBeenCalledWith('Could not check autostart: Error: no access');
    expect(settings.update).not.toHaveBeenCalled();
  });
});

describe('applyAutostart', () => {
  it('changes the login item and reports nothing when it took hold', async () => {
    const items = loginItems();
    const apply = applyAutostart(loginItemAutostart(items), vi.fn());
    expect(await apply(true)).toBeUndefined();
    expect(items.openAtLogin).toBe(true);
    expect(await apply(false)).toBeUndefined();
    expect(items.openAtLogin).toBe(false);
  });

  it('treats anything but true as off', async () => {
    const autostart = port(false);
    await applyAutostart(autostart, vi.fn())('yes');
    expect(autostart.disable).toHaveBeenCalledOnce();
    expect(autostart.enable).not.toHaveBeenCalled();
  });

  it('says so when the system ignored the change', async () => {
    expect(await applyAutostart(port(false), vi.fn())(true)).toBe(
      en.settings.problems.autostartFailed,
    );
  });

  it('says so and warns when the system refused', async () => {
    const warn = vi.fn();
    const refusing: AutostartPort = {
      enabled: () => false,
      enable: () => {
        throw new Error('denied');
      },
      disable: vi.fn(),
      refresh: vi.fn(),
    };
    expect(await applyAutostart(refusing, warn)(true)).toBe(en.settings.problems.autostartFailed);
    expect(warn).toHaveBeenCalledWith('Could not change autostart: Error: denied');
  });
});
