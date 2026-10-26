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
    expect(en.about.versionValue({ version: '1.2.3', channel: 'beta' })).toBe('1.2.3 (beta)');
    expect(en.menu.about({ product: 'YapYap' })).toBe('About YapYap');
    expect(en.windows.settings({ product: 'YapYap' })).toBe('YapYap Settings');
    expect(en.windows.offline({ pageTitle: 'WhatsApp' })).toBe('WhatsApp (offline)');
    expect(en.notices.newRelease({ version: '2.0.0' })).toBe(
      'YapYap 2.0.0 is available. Click to open its download page.',
    );
    expect(en.dialogs.crashReview.detail({ report: 'report' })).toMatch(/submit\.\n\nreport$/);
  });

  it('counts in English plurals', () => {
    expect(en.tray.unread({ count: 1 })).toBe('YapYap: 1 unread chat');
    expect(en.tray.unread({ count: 2 })).toBe('YapYap: 2 unread chats');
    expect(en.settings.backup.invalidValues({ count: 1 })).toMatch(/^1 invalid value in /);
    expect(en.settings.backup.invalidValues({ count: 1200 })).toMatch(/^1,200 invalid values in /);
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
