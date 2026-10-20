import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { compareVersions, latestNodeLts } from './versions.ts';

const version = fc
  .tuple(fc.boolean(), fc.array(fc.nat({ max: 999 }), { minLength: 1, maxLength: 4 }))
  .map(([prefixed, parts]) => `${prefixed ? 'v' : ''}${parts.join('.')}`);

describe('compareVersions properties', () => {
  it('is reflexive and antisymmetric', () => {
    fc.assert(
      fc.property(version, version, (a, b) => {
        expect(compareVersions(a, a)).toBe(0);
        // Summing the signs avoids comparing 0 with -0, which toBe treats as different.
        expect(Math.sign(compareVersions(a, b)) + Math.sign(compareVersions(b, a))).toBe(0);
      }),
    );
  });

  it('ignores trailing zero components and the v prefix', () => {
    fc.assert(
      fc.property(version, fc.nat({ max: 3 }), (a, zeros) => {
        const padded = `${a.replace(/^v/, '')}${'.0'.repeat(zeros)}`;
        expect(compareVersions(a, padded)).toBe(0);
      }),
    );
  });
});

describe('latestNodeLts properties', () => {
  it('picks an LTS release that no other LTS release is newer than', () => {
    const release = fc.record({ version, lts: fc.oneof(fc.constant(false as const), fc.string()) });
    fc.assert(
      fc.property(fc.array(release, { minLength: 1 }), (index) => {
        const lts = index
          .filter((entry) => entry.lts !== false)
          .map((entry) => entry.version.replace(/^v/, ''));
        const picked = latestNodeLts(index);
        expect(picked === undefined).toBe(lts.length === 0);
        expect(lts.filter((v) => picked !== undefined && compareVersions(v, picked) > 0)).toEqual(
          [],
        );
        if (picked !== undefined) expect(lts).toContain(picked);
      }),
    );
  });
});
