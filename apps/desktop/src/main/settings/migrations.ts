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
