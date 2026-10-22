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
