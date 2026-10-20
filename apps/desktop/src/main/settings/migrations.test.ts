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
