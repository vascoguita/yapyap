import { describe, expect, it, vi } from 'vitest';
import { assistantKeys, MAX_KEY, pastedKey } from './keys.ts';

describe('assistantKeys', () => {
  it('keeps each provider’s key under its own name among YapYap’s secrets', async () => {
    const kept = new Map<string, string>();
    const secrets = {
      canKeep: vi.fn(() => Promise.resolve(true)),
      get: (name: string) => Promise.resolve(kept.get(name)),
      set: (name: string, value: string | undefined) => {
        if (value === undefined) {
          kept.delete(name);
        } else {
          kept.set(name, value);
        }
        return Promise.resolve(true);
      },
    };
    const keys = assistantKeys(secrets);
    expect(await keys.save('anthropic', 'sk-ant')).toBe(true);
    expect(kept.get('assistant/key/anthropic')).toBe('sk-ant');
    expect(await keys.get('anthropic')).toBe('sk-ant');
    expect(await keys.get('openai')).toBeUndefined();
    await keys.forget('anthropic');
    expect(kept.size).toBe(0);
    expect(await keys.canKeep()).toBe(true);
  });
});

describe('pastedKey', () => {
  it('trims what was pasted, and refuses blank or overlong keys', () => {
    expect(pastedKey('  sk-1 \n')).toBe('sk-1');
    expect(pastedKey('   ')).toBeUndefined();
    expect(pastedKey(1)).toBeUndefined();
    expect(pastedKey('x'.repeat(MAX_KEY + 1))).toBeUndefined();
  });
});
