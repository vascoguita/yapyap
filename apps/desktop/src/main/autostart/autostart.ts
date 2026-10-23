import { en } from '../../shared/messages/en.ts';
import type { SettingsService } from '../settings/service.ts';

/** Whether YapYap starts when the user logs in, as the operating system sees it. */
export interface AutostartPort {
  readonly enabled: () => boolean;
  /** Throws when the system refuses; so can `disable`. */
  readonly enable: () => void;
  readonly disable: () => void;
}

/** Electron's login items, which exist on Windows and macOS only. */
export interface LoginItems {
  readonly getLoginItemSettings: () => { readonly openAtLogin: boolean };
  readonly setLoginItemSettings: (settings: { readonly openAtLogin: boolean }) => void;
}

export function loginItemAutostart(items: LoginItems): AutostartPort {
  return {
    enabled: () => items.getLoginItemSettings().openAtLogin,
    enable: () => {
      items.setLoginItemSettings({ openAtLogin: true });
    },
    disable: () => {
      items.setLoginItemSettings({ openAtLogin: false });
    },
  };
}

/** Flatpak apps cannot write the autostart folder; only the Background portal can (#234). */
export const UNSUPPORTED_AUTOSTART: AutostartPort = {
  enabled: () => false,
  enable: () => {
    throw new Error('Autostart is not available in this package.');
  },
  disable: () => undefined,
};

export interface AutostartSources {
  readonly platform: string;
  readonly flatpak: boolean;
  readonly loginItems: LoginItems;
  readonly xdg: () => AutostartPort;
}

/** How autostart works for this platform and package. */
export function chooseAutostart(sources: AutostartSources): AutostartPort {
  if (sources.platform !== 'linux') {
    return loginItemAutostart(sources.loginItems);
  }
  return sources.flatpak ? UNSUPPORTED_AUTOSTART : sources.xdg();
}

/**
 * The operating system has the last word: the user can remove YapYap from
 * the login items in the system settings, and the setting follows.
 */
export function syncAutostartSetting(
  port: AutostartPort,
  settings: SettingsService,
  warn: (message: string) => void,
): void {
  try {
    const enabled = port.enabled();
    if (enabled) {
      // Rewrites the entry, so it follows an AppImage that moved.
      port.enable();
    }
    if (enabled !== settings.current().general.autostart) {
      settings.update((current) => ({
        ...current,
        general: { ...current.general, autostart: enabled },
      }));
    }
  } catch (error) {
    warn(`Could not check autostart: ${String(error)}`);
  }
}

/**
 * Applies a change of the setting before it is saved. Returns what to tell
 * the user when the system refused or ignored it, as macOS does until the
 * user approves YapYap in its login items.
 */
export function applyAutostart(
  port: AutostartPort,
  warn: (message: string) => void,
): (value: unknown) => string | undefined {
  return (value) => {
    const enabled = value === true;
    try {
      if (enabled) {
        port.enable();
      } else {
        port.disable();
      }
    } catch (error) {
      warn(`Could not change autostart: ${String(error)}`);
      return port === UNSUPPORTED_AUTOSTART
        ? en.settings.problems.autostartUnsupported
        : en.settings.problems.autostartFailed;
    }
    return port.enabled() === enabled ? undefined : en.settings.problems.autostartFailed;
  };
}
