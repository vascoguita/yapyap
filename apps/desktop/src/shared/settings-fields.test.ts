import { describe, expect, it } from 'vitest';
import { SETTING_FIELDS, SETTINGS_SECTIONS } from './settings-fields.ts';

describe('SETTING_FIELDS', () => {
  it('lists each setting once, in a known section', () => {
    const ids = SETTING_FIELDS.map((field) => field.id);
    expect(new Set(ids).size).toBe(ids.length);
    const sections = new Set<string>(SETTINGS_SECTIONS.map((section) => section.id));
    for (const id of ids) {
      expect(sections.has(id.split('.')[0] ?? '')).toBe(true);
    }
  });
});
