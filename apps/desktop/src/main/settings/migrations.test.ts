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

describe('version 13 to 14', () => {
  const toVersion14 = MIGRATIONS[12];

  it('lets plugins read 20 messages, keeping the other plugin settings', () => {
    expect(toVersion14?.({ schemaVersion: 13, plugins: { developerMode: true } })).toEqual({
      schemaVersion: 13,
      plugins: { chatMessages: '20', developerMode: true },
    });
  });

  it('keeps a choice that is already there, and leaves a broken section to validation', () => {
    expect(toVersion14?.({ plugins: { chatMessages: '5' } })).toEqual({
      plugins: { chatMessages: '5' },
    });
    const settings = { schemaVersion: 13, plugins: 7 };
    expect(toVersion14?.(settings)).toBe(settings);
  });
});

describe('version 12 to 13', () => {
  const toVersion13 = MIGRATIONS[11];

  it('adds automatic disk cache and memory limits, keeping the other reliability settings', () => {
    expect(toVersion13?.({ schemaVersion: 12, reliability: { memoryWatchdogMb: 4096 } })).toEqual({
      schemaVersion: 12,
      reliability: { diskCacheMb: 'auto', jsHeapMb: 'auto', memoryWatchdogMb: 4096 },
    });
  });

  it('keeps choices that are already there, and leaves a broken section to validation', () => {
    expect(toVersion13?.({ reliability: { jsHeapMb: '4096' } })).toEqual({
      reliability: { diskCacheMb: 'auto', jsHeapMb: '4096' },
    });
    const settings = { schemaVersion: 12, reliability: 7 };
    expect(toVersion13?.(settings)).toBe(settings);
  });
});

describe('version 11 to 12', () => {
  const toVersion12 = MIGRATIONS[10];

  it('keeps pinch zoom on, as before, and the other appearance settings', () => {
    expect(toVersion12?.({ schemaVersion: 11, appearance: { zoom: 1.5 } })).toEqual({
      schemaVersion: 11,
      appearance: { pinchZoom: true, zoom: 1.5 },
    });
  });

  it('keeps a choice that is already there, and leaves a broken section to validation', () => {
    expect(toVersion12?.({ appearance: { pinchZoom: false } })).toEqual({
      appearance: { pinchZoom: false },
    });
    const settings = { schemaVersion: 11, appearance: [] };
    expect(toVersion12?.(settings)).toBe(settings);
  });
});

describe('version 10 to 11', () => {
  const toVersion11 = MIGRATIONS[9];

  it('adds the automatic privacy screen, off, and keeps the other privacy settings', () => {
    expect(toVersion11?.({ schemaVersion: 10, privacy: { crashReports: 'ask' } })).toEqual({
      schemaVersion: 10,
      privacy: { blurWhenUnfocused: false, blurWhenIdle: false, crashReports: 'ask' },
    });
  });

  it('keeps choices that are already there, and leaves a broken section to validation', () => {
    expect(toVersion11?.({ privacy: { blurWhenIdle: true } })).toEqual({
      privacy: { blurWhenUnfocused: false, blurWhenIdle: true },
    });
    const settings = { schemaVersion: 10, privacy: 'on' };
    expect(toVersion11?.(settings)).toBe(settings);
  });
});

describe('version 9 to 10', () => {
  const toVersion10 = MIGRATIONS[8];

  it('turns Developer Mode off in a plugins section, and leaves a missing one to validation', () => {
    expect(toVersion10?.({ schemaVersion: 9, plugins: {} })).toEqual({
      schemaVersion: 9,
      plugins: { developerMode: false },
    });
    const settings = { schemaVersion: 9 };
    expect(toVersion10?.(settings)).toBe(settings);
  });

  it('keeps a choice that is already there', () => {
    expect(toVersion10?.({ plugins: { developerMode: true } })).toEqual({
      plugins: { developerMode: true },
    });
  });
});

describe('version 8 to 9', () => {
  const toVersion9 = MIGRATIONS[7];

  it('keeps the app icon in the tray, and the other appearance settings', () => {
    expect(toVersion9?.({ schemaVersion: 8, appearance: { theme: 'dark' } })).toEqual({
      schemaVersion: 8,
      appearance: { trayIcon: 'color', theme: 'dark' },
    });
  });

  it('keeps a choice that is already there', () => {
    expect(toVersion9?.({ appearance: { trayIcon: 'auto' } })).toEqual({
      appearance: { trayIcon: 'auto' },
    });
  });

  it.each([undefined, null, 'on', [true]])(
    'leaves an appearance section of %j for validation to reset',
    (appearance) => {
      const settings = { schemaVersion: 8, appearance };
      expect(toVersion9?.(settings)).toBe(settings);
    },
  );
});

describe('version 7 to 8', () => {
  const toVersion8 = MIGRATIONS[6];

  it('adds the compact sidebar, off, and keeps the other appearance settings', () => {
    expect(toVersion8?.({ schemaVersion: 7, appearance: { theme: 'dark' } })).toEqual({
      schemaVersion: 7,
      appearance: { compactSidebar: false, theme: 'dark' },
    });
  });

  it('keeps a choice that is already there', () => {
    expect(toVersion8?.({ appearance: { compactSidebar: true } })).toEqual({
      appearance: { compactSidebar: true },
    });
  });

  it.each([undefined, null, 'on', [true]])(
    'leaves an appearance section of %j for validation to reset',
    (appearance) => {
      const settings = { schemaVersion: 7, appearance };
      expect(toVersion8?.(settings)).toBe(settings);
    },
  );
});

describe('version 6 to 7', () => {
  const toVersion7 = MIGRATIONS[5];

  it('adds do not disturb, off, and keeps the other general settings', () => {
    expect(toVersion7?.({ schemaVersion: 6, general: { autostart: true } })).toEqual({
      schemaVersion: 6,
      general: { doNotDisturb: false, autostart: true },
    });
  });

  it('keeps a choice that is already there', () => {
    expect(toVersion7?.({ general: { doNotDisturb: true } })).toEqual({
      general: { doNotDisturb: true },
    });
  });

  it.each([undefined, null, 'on', [true]])(
    'leaves a general section of %j for validation to reset',
    (general) => {
      const settings = { schemaVersion: 6, general };
      expect(toVersion7?.(settings)).toBe(settings);
    },
  );
});

describe('version 5 to 6', () => {
  const toVersion6 = MIGRATIONS[4];

  it('shows the sender and text in notifications, as before, and keeps the rest', () => {
    expect(toVersion6?.({ schemaVersion: 5, privacy: { crashReports: 'ask' } })).toEqual({
      schemaVersion: 5,
      privacy: { notificationSender: true, notificationText: true, crashReports: 'ask' },
    });
  });

  it('keeps choices that are already there', () => {
    expect(toVersion6?.({ privacy: { notificationText: false } })).toEqual({
      privacy: { notificationSender: true, notificationText: false },
    });
  });

  it.each([undefined, null, 'on', [true]])(
    'leaves a privacy section of %j for validation to reset',
    (privacy) => {
      const settings = { schemaVersion: 5, privacy };
      expect(toVersion6?.(settings)).toBe(settings);
    },
  );
});

describe('version 4 to 5', () => {
  const toVersion5 = MIGRATIONS[3];

  it('adds beta updates, off, and keeps the other general settings', () => {
    expect(toVersion5?.({ schemaVersion: 4, general: { closeToTray: true } })).toEqual({
      schemaVersion: 4,
      general: { betaUpdates: false, closeToTray: true },
    });
  });

  it('keeps a choice that is already there', () => {
    expect(toVersion5?.({ general: { betaUpdates: true } })).toEqual({
      general: { betaUpdates: true },
    });
  });

  it.each([undefined, null, 'on', [true]])(
    'leaves a general section of %j for validation to reset',
    (general) => {
      const settings = { schemaVersion: 4, general };
      expect(toVersion5?.(settings)).toBe(settings);
    },
  );
});

describe('version 3 to 4', () => {
  const toVersion4 = MIGRATIONS[2];

  it('adds closing to the tray, off, and keeps the other general settings', () => {
    expect(toVersion4?.({ schemaVersion: 3, general: { startMinimized: true } })).toEqual({
      schemaVersion: 3,
      general: { closeToTray: false, startMinimized: true },
    });
  });

  it('keeps a choice that is already there', () => {
    expect(toVersion4?.({ general: { closeToTray: true } })).toEqual({
      general: { closeToTray: true },
    });
  });

  it.each([undefined, null, 'on', [true]])(
    'leaves a general section of %j for validation to reset',
    (general) => {
      const settings = { schemaVersion: 3, general };
      expect(toVersion4?.(settings)).toBe(settings);
    },
  );
});

describe('version 2 to 3', () => {
  const toVersion3 = MIGRATIONS[1];

  it('keeps chats unread while hidden and keeps the other privacy settings', () => {
    expect(toVersion3?.({ schemaVersion: 2, privacy: { crashReports: 'ask' } })).toEqual({
      schemaVersion: 2,
      privacy: { unreadWhileHidden: true, crashReports: 'ask' },
    });
  });

  it('keeps a choice that is already there', () => {
    expect(toVersion3?.({ privacy: { unreadWhileHidden: false } })).toEqual({
      privacy: { unreadWhileHidden: false },
    });
  });

  it.each([undefined, null, 'on', [true]])(
    'leaves a privacy section of %j for validation to reset',
    (privacy) => {
      const settings = { schemaVersion: 2, privacy };
      expect(toVersion3?.(settings)).toBe(settings);
    },
  );
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
