import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { decodeSettings, defaultSettings } from './decode.ts';

const DEFAULTS = {
  schemaVersion: 12,
  general: {
    language: 'system',
    startMinimized: false,
    autostart: false,
    closeToTray: false,
    betaUpdates: false,
    doNotDisturb: false,
  },
  appearance: {
    theme: 'system',
    zoom: 1,
    pinchZoom: true,
    autoHideMenuBar: false,
    compactSidebar: false,
    trayIcon: 'color',
  },
  reliability: {
    hardwareAcceleration: true,
    hardwareVideoDecoding: true,
    memoryWatchdogMb: 2048,
    displayBackend: 'auto',
  },
  privacy: {
    crashReports: 'off',
    unreadWhileHidden: true,
    notificationSender: true,
    notificationText: true,
    blurWhenUnfocused: false,
    blurWhenIdle: false,
  },
  plugins: { developerMode: false },
};

describe('defaultSettings', () => {
  it('gives every setting its default', () => {
    expect(defaultSettings()).toEqual(DEFAULTS);
  });
});

describe('decodeSettings', () => {
  it('reads a valid file unchanged', () => {
    const settings = {
      ...DEFAULTS,
      appearance: {
        theme: 'dark',
        zoom: 1.25,
        pinchZoom: true,
        autoHideMenuBar: true,
        compactSidebar: true,
        trayIcon: 'auto',
      },
    };
    expect(decodeSettings(JSON.stringify(settings))).toEqual({ kind: 'ok', settings, reset: [] });
  });

  it('fills in missing sections and values with defaults', () => {
    expect(decodeSettings('{"schemaVersion":1,"general":{"language":"pt"}}')).toEqual({
      kind: 'ok',
      settings: { ...DEFAULTS, general: { ...DEFAULTS.general, language: 'pt' } },
      reset: [],
    });
  });

  it('resets only the invalid values and reports which', () => {
    const decoded = decodeSettings(
      JSON.stringify({
        ...DEFAULTS,
        general: { ...DEFAULTS.general, language: 'pt', startMinimized: 'yes' },
        appearance: { theme: 'neon', zoom: 9 },
      }),
    );
    expect(decoded).toEqual({
      kind: 'ok',
      settings: { ...DEFAULTS, general: { ...DEFAULTS.general, language: 'pt' } },
      reset: ['/general/startMinimized', '/appearance/theme', '/appearance/zoom'],
    });
  });

  it('drops unknown keys', () => {
    const decoded = decodeSettings(JSON.stringify({ ...DEFAULTS, secrets: { token: 'x' } }));
    expect(decoded.kind === 'ok' && 'secrets' in decoded.settings).toBe(false);
  });

  it('reads what it understands of a newer file and marks it', () => {
    const appearance = {
      theme: 'light',
      zoom: 2,
      pinchZoom: true,
      autoHideMenuBar: false,
      compactSidebar: false,
      trayIcon: 'color',
    };
    const decoded = decodeSettings(
      JSON.stringify({ ...DEFAULTS, appearance, schemaVersion: 13, future: true }),
    );
    expect(decoded).toEqual({ kind: 'newer', settings: { ...DEFAULTS, appearance }, version: 13 });
  });

  it('accepts every option of each choice', () => {
    for (const theme of ['system', 'light', 'dark']) {
      for (const crashReports of ['off', 'local', 'ask']) {
        const settings = {
          ...DEFAULTS,
          appearance: {
            theme,
            zoom: 1,
            pinchZoom: true,
            autoHideMenuBar: false,
            compactSidebar: false,
            trayIcon: 'color',
          },
          privacy: {
            crashReports,
            unreadWhileHidden: true,
            notificationSender: true,
            notificationText: true,
            blurWhenUnfocused: false,
            blurWhenIdle: false,
          },
        };
        expect(decodeSettings(JSON.stringify(settings))).toEqual({
          kind: 'ok',
          settings,
          reset: [],
        });
      }
    }
  });

  it('drops unknown keys inside every section', () => {
    const decoded = decodeSettings(
      JSON.stringify({
        ...DEFAULTS,
        general: { ...DEFAULTS.general, extra: 1 },
        appearance: { ...DEFAULTS.appearance, extra: 1 },
        reliability: { ...DEFAULTS.reliability, extra: 1 },
        privacy: { ...DEFAULTS.privacy, extra: 1 },
      }),
    );
    expect(decoded.kind === 'ok' && decoded.settings).toEqual(DEFAULTS);
  });

  it.each([
    '',
    'not json',
    '[]',
    'null',
    '"text"',
    '{}',
    '{"schemaVersion":0}',
    '{"schemaVersion":"1"}',
  ])('treats %j as corrupt', (text) => {
    expect(decodeSettings(text)).toEqual({ kind: 'corrupt' });
  });

  it('never throws and always yields complete settings for any JSON', () => {
    fc.assert(
      fc.property(fc.jsonValue(), fc.boolean(), (value, versioned) => {
        const input =
          versioned && typeof value === 'object' && value !== null && !Array.isArray(value)
            ? { ...value, schemaVersion: 1 }
            : value;
        const decoded = decodeSettings(JSON.stringify(input));
        if (decoded.kind !== 'corrupt') {
          expect(Object.keys(decoded.settings).sort()).toEqual(Object.keys(DEFAULTS).sort());
        }
      }),
    );
  });
});
