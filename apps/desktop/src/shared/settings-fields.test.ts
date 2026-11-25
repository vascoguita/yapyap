import { describe, expect, it } from 'vitest';
import { labelOn, SETTING_FIELDS, SETTINGS_SECTIONS } from './settings-fields.ts';

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
    expect(field?.descriptionMac).toContain('in the menu bar alone,');
    expect(SETTING_FIELDS.filter((each) => each.descriptionMac !== undefined)).toHaveLength(2);
  });

  it('names Close to the tray after the menu bar on macOS, where it leaves the Dock too', () => {
    const field = SETTING_FIELDS.find(({ id }) => id === 'general.closeToTray');
    expect(field?.platforms).toBeUndefined();
    expect(field && labelOn(field, 'linux')).toBe('Close to the tray');
    expect(field && labelOn(field, 'darwin')).toBe('Close to the menu bar');
    expect(field?.descriptionMac).toContain('without its Dock icon');
  });

  it('keeps the one label of a field with no macOS wording', () => {
    const field = SETTING_FIELDS.find(({ id }) => id === 'general.autostart');
    expect(field?.labelMac).toBeUndefined();
    expect(field && labelOn(field, 'darwin')).toBe('Start at login');
  });
});
