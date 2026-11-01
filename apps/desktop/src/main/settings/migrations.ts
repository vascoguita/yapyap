import { isRecord } from './record.ts';
import { SETTINGS_VERSION } from './schema.ts';

type Raw = Record<string, unknown>;

/**
 * A version that adds keys to a section: a file written before them gets
 * these values, which keep YapYap behaving as it did. A file without the
 * section gets the schema's defaults when it is validated.
 */
const adding =
  (section: string, values: Raw) =>
  (settings: Raw): Raw => {
    const current = settings[section];
    return isRecord(current) ? { ...settings, [section]: { ...values, ...current } } : settings;
  };

/** A version whose new values validation fills in from the schema's defaults. */
const unchanged = (settings: Raw): Raw => settings;

/**
 * Version 19 makes the AI assistant part of YapYap (ADR 0017): its section
 * takes over suggesting replies automatically, as the user had it.
 */
function addAssistant(settings: Raw): Raw {
  const extensions = settings['extensions'];
  if (!isRecord(extensions)) {
    return settings;
  }
  const { autoSuggest, ...rest } = extensions;
  const assistant = autoSuggest === undefined ? {} : { autoSuggest };
  return { ...settings, extensions: rest, assistant };
}

/**
 * `MIGRATIONS[n]` turns a version n+1 file into version n+2. They are pure,
 * forward-only, and each has its own test; a test also checks that there is
 * exactly one migration per version step.
 */
export const MIGRATIONS: readonly ((settings: Raw) => Raw)[] = [
  // 2: the Linux display backend choice (#41).
  adding('reliability', { displayBackend: 'auto' }),
  // 3: chats stay unread while YapYap is hidden, as before, unless turned off (#66).
  adding('privacy', { unreadWhileHidden: true }),
  // 4: closing to the tray, off as before (#65).
  adding('general', { closeToTray: false }),
  // 5: beta updates, off so only testers who ask get them (#184).
  adding('general', { betaUpdates: false }),
  // 6: the notification privacy options, showing everything as before (#62).
  adding('privacy', { notificationSender: true, notificationText: true }),
  // 7: do not disturb, off as before (#61).
  adding('general', { doNotDisturb: false }),
  // 8: the compact account sidebar, off so names show (#57).
  adding('appearance', { compactSidebar: false }),
  // 9: the tray icon style, keeping the app icon as before (#63).
  adding('appearance', { trayIcon: 'color' }),
  // 10: the extensions section, with Developer Mode off (#91).
  adding('extensions', { developerMode: false }),
  // 11: the automatic privacy screen, off as before (#85).
  adding('privacy', { blurWhenUnfocused: false, blurWhenIdle: false }),
  // 12: the pinch zoom switch, on as before (#81).
  adding('appearance', { pinchZoom: true }),
  // 13: the disk cache and memory limits, automatic as before (#83).
  adding('reliability', { diskCacheMb: 'auto', jsHeapMb: 'auto' }),
  // 14: how many messages extensions may read, 20 by default (#100).
  adding('extensions', { chatMessages: '20' }),
  // 15: the call recordings section, kept in the Music folder (#442).
  unchanged,
  // 16: the keys chosen for extension commands, none at first (#443).
  unchanged,
  // 17: the recordings' format, Opus in WebM as before (#442).
  adding('recording', { format: 'webm' }),
  // 18: suggesting replies automatically as messages arrive, on unless turned off (#468).
  adding('extensions', { autoSuggest: true }),
  addAssistant,
];

export type MigrationResult =
  | { readonly kind: 'migrated'; readonly settings: Raw }
  | { readonly kind: 'newer'; readonly version: number }
  | { readonly kind: 'invalid' };

/** Brings a parsed file of any older version up to the current one. */
export function migrate(
  settings: Raw,
  migrations: readonly ((settings: Raw) => Raw)[] = MIGRATIONS,
  current = SETTINGS_VERSION,
): MigrationResult {
  const version = settings['schemaVersion'];
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
    return { kind: 'invalid' };
  }
  if (version > current) {
    return { kind: 'newer', version };
  }
  const migrated = migrations.slice(version - 1).reduce((result, step) => step(result), settings);
  return { kind: 'migrated', settings: { ...migrated, schemaVersion: current } };
}
