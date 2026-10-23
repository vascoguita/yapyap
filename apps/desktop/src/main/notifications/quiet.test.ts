import { describe, expect, it, vi } from 'vitest';
import { defaultSettings } from '../settings/decode.ts';
import { isSilenced, quietAudio, setDoNotDisturb } from './quiet.ts';

describe('isSilenced', () => {
  it('silences every account under do not disturb, and muted accounts always', () => {
    expect(isSilenced(true, { id: 'a' })).toBe(true);
    expect(isSilenced(false, { id: 'a', muted: true })).toBe(true);
    expect(isSilenced(false, { id: 'a', muted: false })).toBe(false);
    expect(isSilenced(false, { id: 'a' })).toBe(false);
  });
});

describe('quietAudio', () => {
  const pages = () => [
    { account: { id: 'a' }, page: { setAudioMuted: vi.fn() } },
    { account: { id: 'b', muted: true }, page: { setAudioMuted: vi.fn() } },
  ];
  const muted = (entries: ReturnType<typeof pages>) =>
    entries.map(({ page }) => page.setAudioMuted.mock.calls.at(-1)?.[0] as boolean);

  it('mutes silenced accounts that are out of sight', () => {
    const entries = pages();
    quietAudio(entries, false, 'a');
    expect(muted(entries)).toEqual([false, true]);
    quietAudio(entries, true, 'a');
    expect(muted(entries)).toEqual([false, true]);
    quietAudio(entries, true, undefined);
    expect(muted(entries)).toEqual([true, true]);
  });

  it('keeps the sound of the account on screen, even when it is muted', () => {
    const entries = pages();
    quietAudio(entries, true, 'b');
    expect(muted(entries)).toEqual([true, false]);
  });
});

describe('setDoNotDisturb', () => {
  it('changes only do not disturb', () => {
    const settings = defaultSettings();
    const update = vi.fn();
    setDoNotDisturb({ update }, true);
    const change = update.mock.calls[0]?.[0] as (current: typeof settings) => typeof settings;
    expect(change(settings)).toEqual({
      ...settings,
      general: { ...settings.general, doNotDisturb: true },
    });
  });
});
