import { describe, expect, it } from 'vitest';
import { badgeLabel, drawBadge } from './badge-image.ts';

/** The BGRA bytes at a pixel of a 32-pixel-wide drawing. */
function pixel(bitmap: Buffer, x: number, y: number): number[] {
  const offset = (y * 32 + x) * 4;
  return [...bitmap.subarray(offset, offset + 4)];
}

const RED = [0x25, 0x30, 0xd9, 255];
const WHITE = [255, 255, 255, 255];
const CLEAR = [0, 0, 0, 0];

describe('badgeLabel', () => {
  it('counts up to 9, then says 9+', () => {
    expect([1, 9, 10, 250].map(badgeLabel)).toEqual(['1', '9', '9+', '9+']);
  });
});

describe('drawBadge', () => {
  it('draws a 16-point overlay at twice the resolution', () => {
    const { width, height, scaleFactor, bitmap } = drawBadge(3);
    expect({ width, height, scaleFactor, bytes: bitmap.length }).toEqual({
      width: 32,
      height: 32,
      scaleFactor: 2,
      bytes: 32 * 32 * 4,
    });
  });

  it('paints a red disc on a clear background, with a smoothed edge', () => {
    const { bitmap } = drawBadge(1);
    expect(pixel(bitmap, 0, 0)).toEqual(CLEAR);
    expect(pixel(bitmap, 16, 2)).toEqual(RED);
    const edge = pixel(bitmap, 4, 4)[3] ?? 0;
    expect(edge).toBeGreaterThan(0);
    expect(edge).toBeLessThan(255);
  });

  it('writes one character large and centered', () => {
    // "1" at 4 pixels per dot: its stem is the glyph's middle column.
    const { bitmap } = drawBadge(1);
    expect(pixel(bitmap, 15, 15)).toEqual(WHITE);
    expect(pixel(bitmap, 10, 6)).toEqual(RED);
    expect(pixel(bitmap, 10, 22)).toEqual(WHITE);
  });

  it('writes two characters smaller, side by side', () => {
    // "9+" at 3 pixels per dot, with the plus's crossbar on the right.
    const { bitmap } = drawBadge(42);
    expect(pixel(bitmap, 5, 8)).toEqual(WHITE);
    expect(pixel(bitmap, 17, 14)).toEqual(WHITE);
    expect(pixel(bitmap, 17, 8)).toEqual(RED);
  });

  it('draws only the characters it has glyphs for', () => {
    // A negative count cannot happen; the minus sign is simply left out.
    const { bitmap } = drawBadge(-1);
    expect(pixel(bitmap, 5, 8)).toEqual(RED);
  });
});
