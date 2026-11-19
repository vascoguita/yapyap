import { describe, expect, it } from 'vitest';
import { SETTING_FIELDS, SETTINGS_SECTIONS } from './settings-fields.ts';

describe('SETTING_FIELDS', () => {
  it('lists each setting once, in a known section', () => {
    const ids = SETTING_FIELDS.map((field) => field.id);
    expect(new Set(ids).size).toBe(ids.length);
    const sections = new Set<string>(SETTINGS_SECTIONS);
    for (const id of ids) {
      expect(sections.has(id.split('.')[0] ?? '')).toBe(true);
    }
  });

  it('says tray on Windows and Linux and menu bar on macOS for Start in the background', () => {
    const field = SETTING_FIELDS.find(({ id }) => id === 'general.startMinimized');
    expect(field?.description).toContain('in the tray,');
    expect(field?.descriptionMac).toContain('in the menu bar,');
    expect(SETTING_FIELDS.filter((each) => each.descriptionMac !== undefined)).toHaveLength(1);
  });
});
