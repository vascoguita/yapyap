import { Pointer, Value } from 'typebox/value';
import { CHROME_CHANNELS, type SettingsSnapshot } from '../../shared/chrome-api.ts';
import {
  SETTING_FIELDS,
  type SettingField,
  type SettingValue,
} from '../../shared/settings-fields.ts';
import { NO_ARGUMENTS, type ChromeHandler } from '../chrome/ipc.ts';
import { SettingsSchema, type Settings } from './schema.ts';
import type { SettingsService } from './service.ts';

/** A field ID such as `reliability.zoom` as a JSON Pointer into the settings. */
const pointer = (id: string): string => `/${id.replace('.', '/')}`;

function valueOf(settings: Settings, id: string): unknown {
  return Pointer.Get(settings, pointer(id));
}

function withValue(settings: Settings, id: string, value: unknown): unknown {
  const next = Value.Clone(settings);
  Pointer.Set(next, pointer(id), value);
  return next;
}

/** The fields that do something on `platform`. */
function fieldsFor(platform: string): readonly SettingField[] {
  return SETTING_FIELDS.filter((field) => field.platforms?.includes(platform) ?? true);
}

/** What the settings window shows, and whether a change awaits a restart. */
function snapshotOf(
  service: SettingsService,
  fields: readonly SettingField[],
  launched: Settings,
): SettingsSnapshot {
  const current = service.current();
  const values: Record<string, SettingValue> = {};
  for (const { id } of fields) {
    values[id] = valueOf(current, id) as SettingValue;
  }
  return {
    values,
    restartPending: fields.some(
      ({ id, restart: needsRestart }) =>
        needsRestart && valueOf(current, id) !== valueOf(launched, id),
    ),
    readOnly: service.readOnly,
  };
}

/**
 * The settings window's operations. A change is accepted only for a listed
 * field and only when the whole result still matches the schema.
 */
export function settingsHandlers(
  service: SettingsService,
  restart: () => void,
  platform: string,
): ChromeHandler[] {
  const fields = fieldsFor(platform);
  const launched = service.current();
  const snapshot = (): SettingsSnapshot => snapshotOf(service, fields, launched);
  const change = ([id, value]: readonly unknown[]): unknown =>
    withValue(service.current(), String(id), value);
  return [
    { channel: CHROME_CHANNELS.settingsGet, accepts: NO_ARGUMENTS, handle: snapshot },
    {
      channel: CHROME_CHANNELS.settingsSet,
      accepts: (args) =>
        args.length === 2 &&
        fields.some((field) => field.id === args[0]) &&
        Value.Check(SettingsSchema, change(args)),
      handle: (_call, ...args) => {
        const next = change(args);
        // `accepts` already checked this; checking again narrows the type.
        if (!Value.Check(SettingsSchema, next)) {
          throw new Error('Invalid setting.');
        }
        service.update(() => next);
        return snapshot();
      },
    },
    { channel: CHROME_CHANNELS.settingsRestart, accepts: NO_ARGUMENTS, handle: restart },
  ];
}
