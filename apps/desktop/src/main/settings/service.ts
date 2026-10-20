import type { Settings } from './schema.ts';
import { loadSettings, saveSettings } from './store.ts';

export interface SettingsService {
  readonly current: () => Settings;
  readonly notice: string | undefined;
  /** The settings belong to a newer YapYap, so `update` changes nothing. */
  readonly readOnly: boolean;
  /** Applies a change and saves it, unless the file belongs to a newer YapYap. */
  readonly update: (change: (settings: Settings) => Settings) => void;
}

export function openSettings(
  dir: string,
  now: number,
  warn: (message: string) => void,
): SettingsService {
  const loaded = loadSettings(dir, now);
  let settings = loaded.settings;
  return {
    current: () => settings,
    notice: loaded.notice,
    readOnly: loaded.readOnly,
    update: (change) => {
      if (loaded.readOnly) {
        warn('Not saving settings: they belong to a newer version of YapYap.');
        return;
      }
      settings = change(settings);
      saveSettings(dir, settings);
    },
  };
}
