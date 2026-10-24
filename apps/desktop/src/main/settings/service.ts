import type { Settings } from './schema.ts';
import { loadSettings, saveSettings } from './store.ts';

export interface SettingsService {
  readonly current: () => Settings;
  readonly notice: string | undefined;
  /** The settings belong to a newer YapYap, so `update` changes nothing. */
  readonly readOnly: boolean;
  /** No settings were saved before this launch, so it is the first (#84). */
  readonly firstRun: boolean;
  /** Applies a change and saves it, unless the file belongs to a newer YapYap. */
  readonly update: (change: (settings: Settings) => Settings) => void;
  /** Calls `listener` after every saved change, so live settings apply at once. */
  readonly onChange: (listener: (settings: Settings) => void) => void;
}

export function openSettings(
  dir: string,
  now: number,
  warn: (message: string) => void,
): SettingsService {
  const loaded = loadSettings(dir, now);
  let settings = loaded.settings;
  const listeners: ((settings: Settings) => void)[] = [];
  return {
    current: () => settings,
    notice: loaded.notice,
    readOnly: loaded.readOnly,
    firstRun: loaded.firstRun === true,
    update: (change) => {
      if (loaded.readOnly) {
        warn('Not saving settings: they belong to a newer version of YapYap.');
        return;
      }
      settings = change(settings);
      saveSettings(dir, settings);
      for (const listener of listeners) {
        listener(settings);
      }
    },
    onChange: (listener) => {
      listeners.push(listener);
    },
  };
}
