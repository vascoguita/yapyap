import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { defaultSettings } from './decode.ts';
import { openSettings } from './service.ts';

const fresh = () => mkdtempSync(join(tmpdir(), 'yapyap-settings-'));

describe('openSettings', () => {
  it('serves the loaded settings and saves changes', () => {
    const dir = fresh();
    const settings = openSettings(dir, 1, vi.fn());
    const listener = vi.fn();
    settings.onChange(listener);
    expect(settings.current()).toEqual(defaultSettings());
    expect(settings.notice).toBeUndefined();
    expect(settings.readOnly).toBe(false);
    settings.update((current) => ({
      ...current,
      general: { ...current.general, autostart: true },
    }));
    expect(settings.current().general.autostart).toBe(true);
    expect(listener).toHaveBeenCalledExactlyOnceWith(settings.current());
    const saved = JSON.parse(readFileSync(join(dir, 'settings.json'), 'utf8')) as {
      general: object;
    };
    expect(saved.general).toEqual({ language: 'system', startMinimized: false, autostart: true });
  });

  it('never overwrites settings from a newer version', () => {
    const dir = fresh();
    writeFileSync(join(dir, 'settings.json'), '{"schemaVersion":9}');
    const warn = vi.fn();
    const settings = openSettings(dir, 1, warn);
    expect(settings.readOnly).toBe(true);
    const listener = vi.fn();
    settings.onChange(listener);
    settings.update((current) => ({
      ...current,
      general: { ...current.general, autostart: true },
    }));
    expect(readFileSync(join(dir, 'settings.json'), 'utf8')).toBe('{"schemaVersion":9}');
    expect(settings.current().general.autostart).toBe(false);
    expect(listener).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledExactlyOnceWith(
      'Not saving settings: they belong to a newer version of YapYap.',
    );
  });
});
