import { copyFileSync, existsSync, readFileSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { writeTextAtomically } from '../atomic-write.ts';
import { decodeSettings, defaultSettings } from './decode.ts';
import type { Settings } from './schema.ts';
import { en } from '../../shared/messages/en.ts';

export const SETTINGS_FILE = 'settings.json';
const BACKUP_FILE = 'settings.json.bak';

export interface LoadedSettings {
  readonly settings: Settings;
  /** A file written by a newer YapYap is never overwritten. */
  readonly readOnly: boolean;
  /** What to tell the user about how the settings were loaded, if anything. */
  readonly notice: string | undefined;
  /** No settings file yet: YapYap's first launch in this profile. */
  readonly firstRun?: true;
}

function readText(path: string): string | undefined {
  return existsSync(path) ? readFileSync(path, 'utf8') : undefined;
}

function fromBackup(dir: string): LoadedSettings {
  const backup = readText(join(dir, BACKUP_FILE));
  const decoded = backup === undefined ? undefined : decodeSettings(backup);
  return decoded?.kind === 'ok'
    ? {
        settings: decoded.settings,
        readOnly: false,
        notice: en.settings.loadNotices.restored,
      }
    : {
        settings: defaultSettings(),
        readOnly: false,
        notice: en.settings.loadNotices.defaults,
      };
}

/**
 * Loads settings without ever failing (ADR 0006). A damaged file is kept as
 * `settings.corrupt-<time>.json` for inspection.
 */
export function loadSettings(dir: string, now: number): LoadedSettings {
  const path = join(dir, SETTINGS_FILE);
  const text = readText(path);
  if (text === undefined) {
    return { settings: defaultSettings(), readOnly: false, notice: undefined, firstRun: true };
  }
  const decoded = decodeSettings(text);
  if (decoded.kind === 'newer') {
    return {
      settings: decoded.settings,
      readOnly: true,
      notice: en.settings.loadNotices.newer,
    };
  }
  if (decoded.kind === 'ok') {
    const notice = decoded.reset.length > 0 ? en.settings.loadNotices.reset : undefined;
    return { settings: decoded.settings, readOnly: false, notice };
  }
  renameSync(path, join(dir, `settings.corrupt-${String(now)}.json`));
  return fromBackup(dir);
}

/**
 * Writes atomically: a crash leaves either the old file or the new one, never
 * half of one. The file being replaced becomes the backup.
 */
export function saveSettings(dir: string, settings: Settings): void {
  const path = join(dir, SETTINGS_FILE);
  if (existsSync(path)) {
    copyFileSync(path, join(dir, BACKUP_FILE));
  }
  writeTextAtomically(path, `${JSON.stringify(settings, null, 2)}\n`);
}
