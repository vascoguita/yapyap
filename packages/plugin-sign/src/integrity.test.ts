import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { matchesIntegrity } from './integrity.ts';

const BYTES = new TextEncoder().encode('plugin archive');
const SRI = `sha256-${createHash('sha256').update(BYTES).digest('base64')}`;

describe('matchesIntegrity', () => {
  it('accepts the archive the integrity value describes', () => {
    expect(matchesIntegrity(BYTES, SRI)).toBe(true);
  });

  it('rejects any other archive', () => {
    expect(matchesIntegrity(new TextEncoder().encode('plugin archive!'), SRI)).toBe(false);
  });

  it.each([
    '',
    SRI.replace('sha256-', 'sha512-'),
    SRI.replace('sha256-', ''),
    `${SRI} `,
    `x${SRI}`,
    'sha256-short=',
    `sha256-${'A'.repeat(44)}`,
  ])('rejects the integrity value %j', (integrity) => {
    expect(matchesIntegrity(BYTES, integrity)).toBe(false);
  });
});
