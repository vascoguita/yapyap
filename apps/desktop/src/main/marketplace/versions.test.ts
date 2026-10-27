import { describe, expect, it } from 'vitest';
import { compareVersions } from './versions.ts';

describe('compareVersions', () => {
  it.each([
    ['1.0.0', '1.0.0', 0],
    ['1.0.0-beta.1', '1.0.0-beta.1', 0],
    ['nightly', '0.0.0', 0],
    ['0.0.1', 'nightly', 1],
    ['1.0.1', '1.0.0', 1],
    ['1.1.0', '1.0.9', 1],
    ['2.0.0', '1.9.9', 1],
    ['0.1.10', '0.1.9', 1],
    ['1.0.0', '1.0.0-beta.1', 1],
    ['1.0.0-beta.2', '1.0.0-beta.1', 1],
    ['1.0.0-beta.10', '1.0.0-beta.9', 1],
    ['1.0.0-beta', '1.0.0-alpha', 1],
    ['1.0.0-beta.1', '1.0.0-beta', 1],
    ['1.0.0-rc', '1.0.0-1', 1],
    ['1.0.0-x-y.2', '1.0.0-x-y.1', 1],
  ])('orders %s against %s as %i', (a, b, sign) => {
    // `|| 0` folds -0 into 0, which `toBe` tells apart.
    expect(Math.sign(compareVersions(a, b)) || 0).toBe(sign);
    expect(Math.sign(compareVersions(b, a)) || 0).toBe(-sign || 0);
  });
});
