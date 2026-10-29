import { en } from '../../shared/messages/en.ts';
import type { SettingsService } from '../settings/service.ts';

/** Whether YapYap starts when the user logs in, as the operating system sees it. */
export interface AutostartPort {
  readonly enabled: () => boolean;
  /** Throws or rejects when the system refuses; so can `disable`. */
  readonly enable: () => void | Promise<void>;
  readonly disable: () => void | Promise<void>;
  /**
   * Keeps an existing entry starting this YapYap where it would otherwise
   * start nothing, such as after an AppImage moved (#362).
   */
  readonly refresh: () => void;
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
    refresh: () => {
      items.setLoginItemSettings({ openAtLogin: true });
    },
  };
}

/**
 * Flatpak apps cannot write the autostart folder; the Background portal
 * does it for them, after asking the user (#234). Nothing in the sandbox can
 * read the entry back, so the port remembers what the portal last granted,
 * starting from the setting.
 */
export function portalAutostart(
  ask: (autostart: boolean) => Promise<boolean>,
  remembered: boolean,
): AutostartPort {
  let granted = remembered;
  return {
    enabled: () => granted,
    enable: async () => {
      granted = await ask(true);
    },
    disable: async () => {
      granted = await ask(false);
    },
    refresh: () => undefined,
  };
}

export interface AutostartSources {
  readonly platform: string;
  readonly flatpak: boolean;
  readonly loginItems: LoginItems;
  readonly xdg: () => AutostartPort;
  /** The Background portal, for the Flatpak. */
  readonly portal: () => AutostartPort;
}

/** How autostart works for this platform and package. */
export function chooseAutostart(sources: AutostartSources): AutostartPort {
  if (sources.platform !== 'linux') {
    return loginItemAutostart(sources.loginItems);
  }
  return sources.flatpak ? sources.portal() : sources.xdg();
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
      port.refresh();
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
): (value: unknown) => Promise<string | undefined> {
  return async (value) => {
    const enabled = value === true;
    try {
      await (enabled ? port.enable() : port.disable());
    } catch (error) {
      warn(`Could not change autostart: ${String(error)}`);
      return en.settings.problems.autostartFailed;
    }
    return port.enabled() === enabled ? undefined : en.settings.problems.autostartFailed;
  };
}
