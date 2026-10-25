import { describe, expect, it, vi } from 'vitest';
import { en } from '../../shared/messages/en.ts';
import { defaultSettings } from '../settings/decode.ts';
import type { Settings } from '../settings/schema.ts';
import {
  applyAutostart,
  chooseAutostart,
  loginItemAutostart,
  syncAutostartSetting,
  UNSUPPORTED_AUTOSTART,
  type AutostartPort,
} from './autostart.ts';

function loginItems(openAtLogin = false) {
  const items = {
    openAtLogin,
    getLoginItemSettings: () => ({ openAtLogin: items.openAtLogin }),
    setLoginItemSettings: vi.fn((settings: { readonly openAtLogin: boolean }) => {
      items.openAtLogin = settings.openAtLogin;
    }),
  };
  return items;
}

function settingsWith(autostart: boolean) {
  let settings: Settings = defaultSettings();
  settings = { ...settings, general: { ...settings.general, autostart } };
  return {
    current: () => settings,
    notice: undefined,
    readOnly: false,
    firstRun: false,
    update: vi.fn((change: (current: Settings) => Settings) => {
      settings = change(settings);
    }),
    onChange: vi.fn(),
  };
}

const port = (enabled: boolean) => ({
  enabled: () => enabled,
  enable: vi.fn(),
  disable: vi.fn(),
  refresh: vi.fn(),
});

describe('chooseAutostart', () => {
  const xdg = port(false);

  it('uses login items on Windows and macOS', () => {
    const items = loginItems();
    for (const platform of ['win32', 'darwin']) {
      chooseAutostart({ platform, flatpak: false, loginItems: items, xdg: () => xdg }).enable();
    }
    expect(items.setLoginItemSettings).toHaveBeenCalledTimes(2);
  });

  it('uses the autostart folder on Linux, except inside Flatpak', () => {
    const sources = { platform: 'linux', loginItems: loginItems(), xdg: () => xdg };
    expect(chooseAutostart({ ...sources, flatpak: false })).toBe(xdg);
    expect(chooseAutostart({ ...sources, flatpak: true })).toBe(UNSUPPORTED_AUTOSTART);
  });
});

describe('loginItemAutostart', () => {
  it('reads and writes the login item', () => {
    const items = loginItems();
    const autostart = loginItemAutostart(items);
    autostart.enable();
    expect(items.setLoginItemSettings).toHaveBeenCalledWith({ openAtLogin: true });
    expect(autostart.enabled()).toBe(true);
    autostart.disable();
    expect(autostart.enabled()).toBe(false);
    autostart.refresh();
    expect(items.setLoginItemSettings).toHaveBeenLastCalledWith({ openAtLogin: true });
  });
});

describe('UNSUPPORTED_AUTOSTART', () => {
  it('is never on, refuses to turn on and allows turning off', () => {
    expect(UNSUPPORTED_AUTOSTART.enabled()).toBe(false);
    expect(() => {
      UNSUPPORTED_AUTOSTART.enable();
    }).toThrow('not available');
    expect(() => {
      UNSUPPORTED_AUTOSTART.disable();
    }).not.toThrow();
    expect(() => {
      UNSUPPORTED_AUTOSTART.refresh();
    }).not.toThrow();
  });
});

describe('syncAutostartSetting', () => {
  it('turns the setting off when the user removed the login item', () => {
    const settings = settingsWith(true);
    syncAutostartSetting(port(false), settings, vi.fn());
    expect(settings.current().general.autostart).toBe(false);
  });

  it('turns the setting on and refreshes the entry when the login item exists', () => {
    const settings = settingsWith(false);
    const autostart = port(true);
    syncAutostartSetting(autostart, settings, vi.fn());
    expect(settings.current().general.autostart).toBe(true);
    expect(autostart.refresh).toHaveBeenCalledOnce();
    expect(autostart.enable).not.toHaveBeenCalled();
  });

  it('saves nothing when both agree', () => {
    const settings = settingsWith(false);
    syncAutostartSetting(port(false), settings, vi.fn());
    expect(settings.update).not.toHaveBeenCalled();
  });

  it('warns and leaves the setting alone when the system cannot be read', () => {
    const settings = settingsWith(true);
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
  it('changes the login item and reports nothing when it took hold', () => {
    const items = loginItems();
    const apply = applyAutostart(loginItemAutostart(items), vi.fn());
    expect(apply(true)).toBeUndefined();
    expect(items.openAtLogin).toBe(true);
    expect(apply(false)).toBeUndefined();
    expect(items.openAtLogin).toBe(false);
  });

  it('treats anything but true as off', () => {
    const autostart = port(false);
    applyAutostart(autostart, vi.fn())('yes');
    expect(autostart.disable).toHaveBeenCalledOnce();
    expect(autostart.enable).not.toHaveBeenCalled();
  });

  it('says so when the system ignored the change', () => {
    expect(applyAutostart(port(false), vi.fn())(true)).toBe(en.settings.problems.autostartFailed);
  });

  it('says so and warns when the system refused', () => {
    const warn = vi.fn();
    const refusing: AutostartPort = {
      enabled: () => false,
      enable: () => {
        throw new Error('denied');
      },
      disable: vi.fn(),
      refresh: vi.fn(),
    };
    expect(applyAutostart(refusing, warn)(true)).toBe(en.settings.problems.autostartFailed);
    expect(warn).toHaveBeenCalledWith('Could not change autostart: Error: denied');
  });

  it('points to the system settings when the package cannot autostart', () => {
    expect(applyAutostart(UNSUPPORTED_AUTOSTART, vi.fn())(true)).toBe(
      en.settings.problems.autostartUnsupported,
    );
  });
});
