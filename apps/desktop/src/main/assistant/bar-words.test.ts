import { describe, expect, it } from 'vitest';
import { providerTitle } from './bar-words.ts';

describe('providerTitle', () => {
  it('names each provider as a sentence starts, and none before one is set up', () => {
    expect(providerTitle('built-in')).toBe('The private model on this computer');
    expect(providerTitle('local')).toBe('The model server on this computer');
    expect(providerTitle(undefined)).toBe('');
  });
});
