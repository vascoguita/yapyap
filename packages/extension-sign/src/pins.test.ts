import { describe, expect, it } from 'vitest';
import { readPins, writePins } from './pins.ts';

const KEY = Array.from({ length: 32 }, () => 'ab').join(':');
const OTHER = Array.from({ length: 32 }, () => '0f').join(':');

describe('pins', () => {
  it('round-trips, sorted by extension ID', () => {
    const text = writePins(
      new Map([
        ['org.example.zeta', KEY],
        ['org.example.alpha', OTHER],
      ]),
    );
    expect(text).toBe(
      `{\n  "version": 1,\n  "pins": {\n    "org.example.alpha": "${OTHER}",\n    "org.example.zeta": "${KEY}"\n  }\n}\n`,
    );
    expect(readPins(text)).toEqual(
      new Map([
        ['org.example.alpha', OTHER],
        ['org.example.zeta', KEY],
      ]),
    );
  });

  it.each(['', 'not json', 'null', '[]', '{"pins":"x"}', '{}'])('reads %j as no pins', (text) => {
    expect(readPins(text).size).toBe(0);
  });

  it('drops malformed entries and keeps the rest', () => {
    const text = JSON.stringify({
      pins: {
        'org.example.good': KEY,
        'Bad.ID': KEY,
        'org.example.short': 'ab:cd',
        'org.example.number': 1,
        'Xorg.example.prefixed': KEY,
        'org.example.suffixed!': KEY,
        'org.example.before': `x${KEY}`,
        'org.example.after': `${KEY}:ff`,
      },
    });
    expect(readPins(text)).toEqual(new Map([['org.example.good', KEY]]));
  });
});
