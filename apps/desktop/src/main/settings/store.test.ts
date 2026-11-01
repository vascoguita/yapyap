import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { tempDir } from '../../../../../test/temp-dir.ts';
import { defaultSettings } from './decode.ts';
import { loadSettings, saveSettings, SETTINGS_FILE } from './store.ts';

const fresh = () => tempDir('yapyap-settings-');
const custom = () => ({
  ...defaultSettings(),
  appearance: {
    theme: 'dark' as const,
    zoom: 1.5,
    pinchZoom: true,
    autoHideMenuBar: false,
    compactSidebar: false,
    trayIcon: 'color' as const,
  },
});

describe('loadSettings', () => {
  it('starts with defaults and no notice on first run, and says it is the first', () => {
    expect(loadSettings(fresh(), 1)).toEqual({
      settings: defaultSettings(),
      notice: undefined,
      firstRun: true,
    });
  });

  it('reads saved settings', () => {
    const dir = fresh();
    saveSettings(dir, custom());
    expect(loadSettings(dir, 1)).toEqual({
      settings: custom(),
      notice: undefined,
    });
  });

  it('tells the user when invalid values were reset', () => {
    const dir = fresh();
    writeFileSync(join(dir, SETTINGS_FILE), '{"schemaVersion":1,"appearance":{"zoom":99}}');
    expect(loadSettings(dir, 1).notice).toBe(
      'Some settings were invalid and were reset to their defaults.',
    );
  });

  it.each(['{"schemaVersion":0}', '{"schemaVersion":2}'])(
    'sets aside a file of another version, as if it were damaged: %s',
    (text) => {
      const dir = fresh();
      writeFileSync(join(dir, SETTINGS_FILE), text);
      expect(loadSettings(dir, 3)).toEqual({
        settings: defaultSettings(),
        notice: 'Your settings file was damaged, so YapYap started with default settings.',
      });
      expect(readFileSync(join(dir, 'settings.corrupt-3.json'), 'utf8')).toBe(text);
    },
  );

  it('restores the backup when the file is damaged, keeping the damaged file aside', () => {
    const dir = fresh();
    saveSettings(dir, custom());
    saveSettings(dir, defaultSettings());
    writeFileSync(join(dir, SETTINGS_FILE), '{"schemaVersion":');
    expect(loadSettings(dir, 42)).toEqual({
      settings: custom(),
      notice: 'Your settings file was damaged, so YapYap restored the last good copy.',
    });
    expect(readFileSync(join(dir, 'settings.corrupt-42.json'), 'utf8')).toBe('{"schemaVersion":');
    expect(existsSync(join(dir, SETTINGS_FILE))).toBe(false);
  });

  it.each([
    ['no backup', undefined],
    ['a damaged backup', 'garbage'],
    ['a backup of another version', '{"schemaVersion":2}'],
  ])('falls back to defaults with %s', (_, backup) => {
    const dir = fresh();
    writeFileSync(join(dir, SETTINGS_FILE), 'garbage');
    if (backup !== undefined) {
      writeFileSync(join(dir, 'settings.json.bak'), backup);
    }
    expect(loadSettings(dir, 7)).toEqual({
      settings: defaultSettings(),
      notice: 'Your settings file was damaged, so YapYap started with default settings.',
    });
  });
});

describe('saveSettings', () => {
  it('writes formatted JSON and keeps the previous file as the backup', () => {
    const dir = fresh();
    saveSettings(dir, defaultSettings());
    saveSettings(dir, custom());
    expect(JSON.parse(readFileSync(join(dir, SETTINGS_FILE), 'utf8'))).toEqual(custom());
    expect(JSON.parse(readFileSync(join(dir, 'settings.json.bak'), 'utf8'))).toEqual(
      defaultSettings(),
    );
    expect(readFileSync(join(dir, SETTINGS_FILE), 'utf8')).toMatch(
      /^\{\n {2}"schemaVersion": 1,[\s\S]*\}\n$/,
    );
    expect(readdirSync(dir).sort()).toEqual(['settings.json', 'settings.json.bak']);
  });

  it('makes no backup when there is nothing to replace', () => {
    const dir = fresh();
    saveSettings(dir, defaultSettings());
    expect(readdirSync(dir)).toEqual(['settings.json']);
  });
});
