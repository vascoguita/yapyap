import { describe, expect, it, vi } from 'vitest';
import { defaultSettings } from '../settings/decode.ts';
import { applyResourceLimits } from './resource-limits.ts';

describe('applyResourceLimits', () => {
  it('leaves Chromium its own choices when both are automatic', () => {
    const commandLine = { appendSwitch: vi.fn() };
    applyResourceLimits(commandLine, defaultSettings().reliability);
    expect(commandLine.appendSwitch).not.toHaveBeenCalled();
  });

  it('sets the disk cache size in bytes and the JavaScript memory limit in MB', () => {
    const commandLine = { appendSwitch: vi.fn() };
    applyResourceLimits(commandLine, {
      ...defaultSettings().reliability,
      diskCacheMb: '256',
      jsHeapMb: '4096',
    });
    expect(commandLine.appendSwitch.mock.calls).toEqual([
      ['disk-cache-size', String(256 * 1024 * 1024)],
      ['js-flags', '--max-old-space-size=4096'],
    ]);
  });
});
