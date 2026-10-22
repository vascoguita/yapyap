import { describe, expect, it } from 'vitest';
import { checkTrustAnchor } from './check.ts';

const PEM = '-----BEGIN PUBLIC KEY-----\nMCowBQYDK2VwAyEA\n-----END PUBLIC KEY-----';

describe('checkTrustAnchor', () => {
  it('matches the first anchor, whatever the line endings', () => {
    expect(checkTrustAnchor(PEM, [PEM])).toBe('match');
    expect(checkTrustAnchor(`${PEM.replaceAll('\n', '\r\n')}\n`, [PEM, 'old'])).toBe('match');
  });

  it('reports a variable that is not the first anchor', () => {
    expect(checkTrustAnchor(PEM, ['old', PEM])).toBe('mismatch');
    expect(checkTrustAnchor(PEM, [])).toBe('mismatch');
  });

  it('has nothing to check without the variable', () => {
    expect(checkTrustAnchor('', [PEM])).toBe('no-variable');
    expect(checkTrustAnchor('  \n', [PEM])).toBe('no-variable');
  });
});
