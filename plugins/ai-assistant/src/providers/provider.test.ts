import { describe, expect, it } from 'vitest';
import { ProviderError } from './provider.ts';

describe('ProviderError', () => {
  it('names only the kind of failure', () => {
    expect(new ProviderError('timeout')).toMatchObject({
      name: 'ProviderError',
      kind: 'timeout',
      message: 'The AI provider request failed: timeout.',
    });
  });
});
