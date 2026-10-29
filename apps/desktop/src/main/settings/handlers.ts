import { Pointer, Value } from 'typebox/value';
import { CHROME_CHANNELS, type SettingsSnapshot } from '../../shared/chrome-api.ts';
import {
  SETTING_FIELDS,
  type SettingField,
  type SettingValue,
} from '../../shared/settings-fields.ts';
import { noArguments, type ChromeHandler } from '../chrome/ipc.ts';
import { SettingsSchema, type Settings } from './schema.ts';
import type { SettingsService } from './service.ts';

/** A field ID such as `reliability.zoom` as a JSON Pointer into the settings. */
const pointer = (id: string): string => `/${id.replace('.', '/')}`;

function readValue(settings: Settings, id: string): unknown {
  return Pointer.Get(settings, pointer(id));
}

export function withValue(settings: Settings, id: string, value: unknown): unknown {
  const next = Value.Clone(settings);
  Pointer.Set(next, pointer(id), value);
  return next;
}

/** The fields that do something on `platform` and in this build. */
function fieldsFor(platform: string, hidden: readonly string[]): readonly SettingField[] {
  return SETTING_FIELDS.filter(
    (field) => (field.platforms?.includes(platform) ?? true) && !hidden.includes(field.id),
  );
}

/**
 * Carries a change out in the system before it is saved, such as
 * registering a login item; returns what to tell the user when it fails.
 */
export type SettingEffect = (value: unknown) => string | undefined;

/** What the settings window shows, and whether a change awaits a restart. */
function snapshotOf(
  service: SettingsService,
  fields: readonly SettingField[],
  launched: Settings,
  problems: Readonly<Record<string, string>>,
  unavailable: Readonly<Record<string, string>>,
): SettingsSnapshot {
  const current = service.current();
  const values: Record<string, SettingValue> = {};
  for (const { id } of fields) {
    values[id] = readValue(current, id) as SettingValue;
  }
  return {
    values,
    problems,
    unavailable,
    restartPending: fields.some(
      ({ id, restart: needsRestart }) =>
        needsRestart && readValue(current, id) !== readValue(launched, id),
    ),
    readOnly: service.readOnly,
  };
}

/**
 * Runs the field's effect, if it has one, and saves the change only when the
 * system took it; otherwise `problems` says why under the field.
 */
function saveUnlessRefused(
  service: SettingsService,
  effects: Readonly<Record<string, SettingEffect>>,
  problems: Map<string, string>,
  id: string,
  value: unknown,
  next: Settings,
): void {
  // A newer YapYap owns the file, so the system must not change either.
  const problem = service.readOnly ? undefined : effects[id]?.(value);
  if (problem === undefined) {
    problems.delete(id);
    service.update(() => next);
  } else {
    problems.set(id, problem);
  }
}

/**
 * The settings window's operations. A change is accepted only for a listed
 * field and only when the whole result still matches the schema. `hidden`
 * lists fields this build ignores, such as beta updates where the system
 * updates YapYap. `unavailable` fields show, but cannot change here, such
 * as window positions on Wayland.
 */
export function settingsHandlers(
  service: SettingsService,
  restart: () => void,
  platform: string,
  effects: Readonly<Record<string, SettingEffect>> = {},
  hidden: readonly string[] = [],
  unavailable: Readonly<Record<string, string>> = {},
): ChromeHandler[] {
  const fields = fieldsFor(platform, hidden);
  const launched = service.current();
  const problems = new Map<string, string>();
  const snapshot = (): SettingsSnapshot =>
    snapshotOf(service, fields, launched, Object.fromEntries(problems), unavailable);
  const change = ([id, value]: readonly unknown[]): unknown =>
    withValue(service.current(), String(id), value);
  return [
    { channel: CHROME_CHANNELS.settingsGet, accepts: noArguments, handle: snapshot },
    {
      channel: CHROME_CHANNELS.settingsSet,
      accepts: (args) =>
        args.length === 2 &&
        !(String(args[0]) in unavailable) &&
        fields.some(
          (field) => field.id === args[0] && (field.folder === undefined || args[1] === ''),
        ) &&
        Value.Check(SettingsSchema, change(args)),
      handle: (_call, ...args) => {
        const next = change(args);
        // `accepts` already checked this; checking again narrows the type.
        if (!Value.Check(SettingsSchema, next)) {
          throw new Error('Invalid setting.');
        }
        saveUnlessRefused(service, effects, problems, String(args[0]), args[1], next);
        return snapshot();
      },
    },
    { channel: CHROME_CHANNELS.settingsRestart, accepts: noArguments, handle: restart },
  ];
}
