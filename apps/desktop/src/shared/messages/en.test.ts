import { describe, expect, it } from 'vitest';
import { SETTING_FIELDS } from '../settings-fields.ts';
import { en } from './en.ts';

function strings(value: unknown, path: string): [string, string][] {
  if (typeof value === 'string') {
    return [[path, value]];
  }
  if (typeof value === 'object' && value !== null) {
    return Object.entries(value).flatMap(([key, child]) => strings(child, `${path}.${key}`));
  }
  return [];
}

describe('the English catalog', () => {
  it('has no empty or blank text', () => {
    const blank = strings(en, 'en').filter(([, text]) => text.trim() === '');
    expect(blank).toEqual([]);
    expect(strings(en, 'en').length).toBeGreaterThan(50);
  });

  it('formats values into its text', () => {
    expect(en.about.versionValue('1.2.3', 'beta')).toBe('1.2.3 (beta)');
    expect(en.menu.about('YapYap')).toBe('About YapYap');
    expect(en.windows.settings('YapYap')).toBe('YapYap Settings');
    expect(en.windows.offline('WhatsApp')).toBe('WhatsApp (offline)');
    expect(en.notices.newRelease('2.0.0')).toBe(
      'YapYap 2.0.0 is available. Click to open its download page.',
    );
    expect(en.dialogs.media.request('WhatsApp', ['microphone', 'camera'])).toBe(
      'WhatsApp wants to use your microphone and camera.',
    );
    expect(en.dialogs.crashReview.detail('report')).toMatch(/submit\.\n\nreport$/);
  });

  it('counts the invalid values an import replaces', () => {
    expect(en.settings.backup.replaces(0)).toBe('Your current settings will be replaced.');
    expect(en.settings.backup.replaces(1)).toMatch(/ 1 invalid value in /);
    expect(en.settings.backup.replaces(2)).toMatch(/ 2 invalid values in /);
  });

  it('describes exactly the settings the window lists', () => {
    expect(Object.keys(en.settings.fields).sort()).toEqual(
      SETTING_FIELDS.map((field) => field.id).sort(),
    );
    for (const field of SETTING_FIELDS) {
      expect(field.label).not.toBe('');
      expect(field.description).not.toBe('');
      for (const option of field.options ?? []) {
        expect(option.label).not.toBe('');
      }
    }
  });
});
