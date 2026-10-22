import { describe, expect, it, vi } from 'vitest';
import { defaultSettings } from '../settings/decode.ts';
import type { Settings } from '../settings/schema.ts';
import { followHiddenReadsSetting } from './hidden-reads.ts';

describe('followHiddenReadsSetting', () => {
  it('keeps background throttling on by default and follows changes', () => {
    const contents = { setBackgroundThrottling: vi.fn() };
    let changed: ((settings: Settings) => void) | undefined;
    followHiddenReadsSetting(contents, {
      current: defaultSettings,
      onChange: (listener) => {
        changed = listener;
      },
    });
    expect(contents.setBackgroundThrottling).toHaveBeenLastCalledWith(true);
    const settings = defaultSettings();
    changed?.({ ...settings, privacy: { ...settings.privacy, unreadWhileHidden: false } });
    expect(contents.setBackgroundThrottling).toHaveBeenLastCalledWith(false);
  });
});
