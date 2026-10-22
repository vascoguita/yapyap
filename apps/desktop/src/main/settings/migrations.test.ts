import { describe, expect, it } from 'vitest';
import { migrate, MIGRATIONS } from './migrations.ts';
import { SETTINGS_VERSION } from './schema.ts';

describe('MIGRATIONS', () => {
  it('has exactly one migration per version step', () => {
    expect(MIGRATIONS).toHaveLength(SETTINGS_VERSION - 1);
  });
});

describe('migrate', () => {
  const steps = [
    (settings: Record<string, unknown>) => ({ ...settings, two: true }),
    (settings: Record<string, unknown>) => ({ ...settings, three: true }),
  ];

  it('applies every step from the file version up to the current one, in order', () => {
    expect(migrate({ schemaVersion: 1, one: true }, steps, 3)).toEqual({
      kind: 'migrated',
      settings: { schemaVersion: 3, one: true, two: true, three: true },
    });
    expect(migrate({ schemaVersion: 2 }, steps, 3)).toEqual({
      kind: 'migrated',
      settings: { schemaVersion: 3, three: true },
    });
  });

  it('leaves a current file as it is', () => {
    expect(migrate({ schemaVersion: 3, x: 1 }, steps, 3)).toEqual({
      kind: 'migrated',
      settings: { schemaVersion: 3, x: 1 },
    });
  });

  it('reports a file from a newer version', () => {
    expect(migrate({ schemaVersion: 4 }, steps, 3)).toEqual({ kind: 'newer', version: 4 });
  });

  it.each([{}, { schemaVersion: '1' }, { schemaVersion: 0 }, { schemaVersion: 1.5 }])(
    'rejects %j',
    (settings) => {
      expect(migrate(settings, steps, 3)).toEqual({ kind: 'invalid' });
    },
  );

  it('uses the real migrations and version by default', () => {
    expect(migrate({ schemaVersion: 1 })).toEqual({
      kind: 'migrated',
      settings: { schemaVersion: SETTINGS_VERSION },
    });
  });
});

describe('version 1 to 2', () => {
  const [toVersion2] = MIGRATIONS;

  it('adds the automatic display backend and keeps the other reliability settings', () => {
    expect(
      toVersion2?.({ schemaVersion: 1, reliability: { hardwareAcceleration: false } }),
    ).toEqual({
      schemaVersion: 1,
      reliability: { displayBackend: 'auto', hardwareAcceleration: false },
    });
  });

  it('keeps a display backend that is already there', () => {
    expect(toVersion2?.({ reliability: { displayBackend: 'x11' } })).toEqual({
      reliability: { displayBackend: 'x11' },
    });
  });

  it.each([undefined, null, 'fast', ['x11']])(
    'leaves a reliability section of %j for validation to reset',
    (reliability) => {
      const settings = { schemaVersion: 1, reliability };
      expect(toVersion2?.(settings)).toBe(settings);
    },
  );
});
