import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { canonicalJson, compareCodeUnits } from './canonical.ts';

describe('compareCodeUnits', () => {
  it('orders by code unit and finds equal strings equal', () => {
    expect(['b', 'é', 'B', 'a'].sort(compareCodeUnits)).toEqual(['B', 'a', 'b', 'é']);
    expect(compareCodeUnits('a', 'a')).toBe(0);
    expect(compareCodeUnits('a', 'b')).toBeLessThan(0);
    expect(compareCodeUnits('b', 'a')).toBeGreaterThan(0);
    expect(compareCodeUnits('ab', 'a')).toBeGreaterThan(0);
    expect(compareCodeUnits('a', 'ab')).toBeLessThan(0);
  });
});

describe('canonicalJson', () => {
  it('sorts keys at every level and drops whitespace', () => {
    expect(canonicalJson({ b: 1, a: { d: [true, null, 'x'], c: 2.5 } })).toBe(
      '{"a":{"c":2.5,"d":[true,null,"x"]},"b":1}',
    );
  });

  it('sorts keys by code unit, so the order never depends on the locale', () => {
    expect(canonicalJson({ b: 0, B: 0, a: 0, é: 0 })).toBe('{"B":0,"a":0,"b":0,"é":0}');
  });

  it('escapes strings and keys as JSON does', () => {
    expect(canonicalJson({ 'q"': 'line\nbreak' })).toBe('{"q\\"":"line\\nbreak"}');
  });

  it.each([undefined, Number.NaN, Number.POSITIVE_INFINITY, () => 1, 10n, Symbol('s')])(
    'refuses %s, which has no JSON form',
    (value) => {
      expect(() => canonicalJson({ value })).toThrow('Only JSON values can be signed.');
    },
  );

  it('reads back as the same value, and is the same for any key order', () => {
    fc.assert(
      fc.property(fc.jsonValue(), (value) => {
        const text = canonicalJson(value);
        expect(canonicalJson(JSON.parse(text))).toBe(text);
        expect(JSON.parse(text)).toEqual(JSON.parse(JSON.stringify(value)));
      }),
    );
  });
});
