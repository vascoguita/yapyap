import { SETTINGS_VERSION } from './schema.ts';

type Raw = Record<string, unknown>;

function isSection(value: unknown): value is Raw {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Version 2 adds the Linux display backend choice (#41). */
function addDisplayBackend(settings: Raw): Raw {
  const reliability = settings['reliability'];
  return isSection(reliability)
    ? { ...settings, reliability: { displayBackend: 'auto', ...reliability } }
    : settings;
}

/** Version 4 adds closing to the tray, off as before (#65). */
function addCloseToTray(settings: Raw): Raw {
  const general = settings['general'];
  return isSection(general)
    ? { ...settings, general: { closeToTray: false, ...general } }
    : settings;
}

/** Version 3 keeps chats unread while YapYap is hidden, as before, unless turned off (#66). */
function addUnreadWhileHidden(settings: Raw): Raw {
  const privacy = settings['privacy'];
  return isSection(privacy)
    ? { ...settings, privacy: { unreadWhileHidden: true, ...privacy } }
    : settings;
}

/** Version 5 adds beta updates, off so only testers who ask get them (#184). */
function addBetaUpdates(settings: Raw): Raw {
  const general = settings['general'];
  return isSection(general)
    ? { ...settings, general: { betaUpdates: false, ...general } }
    : settings;
}

/** Version 6 adds the notification privacy options, showing everything as before (#62). */
function addNotificationPrivacy(settings: Raw): Raw {
  const privacy = settings['privacy'];
  return isSection(privacy)
    ? {
        ...settings,
        privacy: { notificationSender: true, notificationText: true, ...privacy },
      }
    : settings;
}

/** Version 7 adds do not disturb, off as before (#61). */
function addDoNotDisturb(settings: Raw): Raw {
  const general = settings['general'];
  return isSection(general)
    ? { ...settings, general: { doNotDisturb: false, ...general } }
    : settings;
}

/** Version 8 adds the compact account sidebar, off so names show (#57). */
function addCompactSidebar(settings: Raw): Raw {
  const appearance = settings['appearance'];
  return isSection(appearance)
    ? { ...settings, appearance: { compactSidebar: false, ...appearance } }
    : settings;
}

/** Version 9 adds the tray icon style, keeping the app icon as before (#63). */
function addTrayIcon(settings: Raw): Raw {
  const appearance = settings['appearance'];
  return isSection(appearance)
    ? { ...settings, appearance: { trayIcon: 'color', ...appearance } }
    : settings;
}

/**
 * Version 10 adds the extensions section, with Developer Mode off (#91). Older
 * files have no such section, so validation gives it its defaults.
 */
function addExtensions(settings: Raw): Raw {
  const extensions = settings['extensions'];
  return isSection(extensions)
    ? { ...settings, extensions: { developerMode: false, ...extensions } }
    : settings;
}

/** Version 11 adds the automatic privacy screen, off as before (#85). */
function addPrivacyScreen(settings: Raw): Raw {
  const privacy = settings['privacy'];
  return isSection(privacy)
    ? { ...settings, privacy: { blurWhenUnfocused: false, blurWhenIdle: false, ...privacy } }
    : settings;
}

/** Version 12 adds the pinch zoom switch, on as before (#81). */
function addPinchZoom(settings: Raw): Raw {
  const appearance = settings['appearance'];
  return isSection(appearance)
    ? { ...settings, appearance: { pinchZoom: true, ...appearance } }
    : settings;
}

/** Version 13 adds the disk cache and memory limits, automatic as before (#83). */
function addResourceLimits(settings: Raw): Raw {
  const reliability = settings['reliability'];
  return isSection(reliability)
    ? { ...settings, reliability: { diskCacheMb: 'auto', jsHeapMb: 'auto', ...reliability } }
    : settings;
}

/** Version 14 adds how many messages extensions may read, 20 by default (#100). */
function addChatMessages(settings: Raw): Raw {
  const extensions = settings['extensions'];
  return isSection(extensions)
    ? { ...settings, extensions: { chatMessages: '20', ...extensions } }
    : settings;
}

/**
 * Version 15 adds the call recordings section (#442). Older files have none,
 * so validation gives it its defaults: recordings stay in the Music folder.
 */
function addRecording(settings: Raw): Raw {
  return settings;
}

/**
 * Version 16 adds the keys the user chose for extension commands (#443).
 * Older files have none, so validation gives them an empty list.
 */
function addExtensionShortcuts(settings: Raw): Raw {
  return settings;
}

/** Version 17 adds the recordings' format, Opus in WebM as before (#442). */
function addRecordingFormat(settings: Raw): Raw {
  const recording = settings['recording'];
  return isSection(recording)
    ? { ...settings, recording: { format: 'webm', ...recording } }
    : settings;
}

/** Version 18 suggests replies automatically as messages arrive, on unless turned off (#468). */
function addAutoSuggest(settings: Raw): Raw {
  const extensions = settings['extensions'];
  return isSection(extensions)
    ? { ...settings, extensions: { autoSuggest: true, ...extensions } }
    : settings;
}

/**
 * `MIGRATIONS[n]` turns a version n+1 file into version n+2. They are pure,
 * forward-only, and each has its own test; a test also checks that there is
 * exactly one migration per version step.
 */
export const MIGRATIONS: readonly ((settings: Raw) => Raw)[] = [
  addDisplayBackend,
  addUnreadWhileHidden,
  addCloseToTray,
  addBetaUpdates,
  addNotificationPrivacy,
  addDoNotDisturb,
  addCompactSidebar,
  addTrayIcon,
  addExtensions,
  addPrivacyScreen,
  addPinchZoom,
  addResourceLimits,
  addChatMessages,
  addRecording,
  addExtensionShortcuts,
  addRecordingFormat,
  addAutoSuggest,
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
