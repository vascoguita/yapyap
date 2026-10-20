import { describe, expect, it, vi } from 'vitest';
import { SETTING_FIELDS } from '../../shared/settings-fields.ts';
import { defaultSettings } from './decode.ts';
import { settingsHandlers } from './handlers.ts';
import type { Settings } from './schema.ts';

const HARDWARE = 'reliability.hardwareAcceleration';

function setup(readOnly = false) {
  let settings: Settings = defaultSettings();
  const service = {
    current: () => settings,
    notice: undefined,
    readOnly,
    update: vi.fn((change: (current: Settings) => Settings) => {
      settings = change(settings);
    }),
  };
  const restart = vi.fn();
  const handlers = new Map(
    settingsHandlers(service, restart).map((handler) => [handler.channel, handler]),
  );
  const handler = (channel: string) => {
    const found = handlers.get(channel);
    if (found === undefined) throw new Error(`No handler for ${channel}`);
    return found;
  };
  const call = { sender: {} };
  return { service, restart, handler, call, settings: () => settings };
}

describe('settingsHandlers', () => {
  it('registers get, set and restart', () => {
    const t = setup();
    expect(['settings:get', 'settings:set', 'settings:restart'].map(t.handler)).toHaveLength(3);
  });

  it('finds every listed setting in the schema, as a switch', () => {
    const t = setup();
    const snapshot = t.handler('settings:get').handle(t.call) as { values: object };
    const values = Object.entries(snapshot.values);
    expect(values.map(([id]) => id)).toEqual(SETTING_FIELDS.map((field) => field.id));
    for (const [, value] of values) expect(typeof value).toBe('boolean');
  });

  it('shows the listed settings as they are', () => {
    const t = setup(true);
    const get = t.handler('settings:get');
    expect(get.accepts([])).toBe(true);
    expect(get.accepts([1])).toBe(false);
    expect(get.handle(t.call)).toEqual({
      values: { [HARDWARE]: true },
      restartPending: false,
      readOnly: true,
    });
  });

  it('saves a change and asks for a restart until the launch value is back', () => {
    const t = setup();
    const set = t.handler('settings:set');
    expect(set.handle(t.call, HARDWARE, false)).toEqual({
      values: { [HARDWARE]: false },
      restartPending: true,
      readOnly: false,
    });
    expect(t.settings().reliability.hardwareAcceleration).toBe(false);
    expect(t.settings().reliability.memoryWatchdogMb).toBe(2048);
    expect(t.settings().general).toEqual(defaultSettings().general);
    expect(set.handle(t.call, HARDWARE, true)).toEqual(
      expect.objectContaining({ restartPending: false }),
    );
  });

  it('accepts only a listed setting with a value its schema allows', () => {
    const set = setup().handler('settings:set');
    expect(set.accepts([HARDWARE, false])).toBe(true);
    expect(set.accepts([HARDWARE, 'no'])).toBe(false);
    expect(set.accepts([HARDWARE])).toBe(false);
    expect(set.accepts([HARDWARE, false, 1])).toBe(false);
    expect(set.accepts(['reliability.memoryWatchdogMb', 4096])).toBe(false);
    expect(set.accepts(['reliability.unknown', true])).toBe(false);
    expect(set.accepts([42, true])).toBe(false);
    expect(set.accepts(['__proto__.polluted', true])).toBe(false);
  });

  it('refuses to save an invalid value that reaches it directly', () => {
    const t = setup();
    expect(() => t.handler('settings:set').handle(t.call, HARDWARE, 'no')).toThrow(
      'Invalid setting.',
    );
    expect(t.service.update).not.toHaveBeenCalled();
  });

  it('restarts the app on request', () => {
    const t = setup();
    const restart = t.handler('settings:restart');
    expect(restart.accepts([])).toBe(true);
    expect(restart.accepts(['now'])).toBe(false);
    restart.handle(t.call);
    expect(t.restart).toHaveBeenCalledOnce();
  });
});
