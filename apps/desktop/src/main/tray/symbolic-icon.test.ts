import { describe, expect, it } from 'vitest';
import { drawSymbolicIcon } from './symbolic-icon.ts';

/** The BGRA bytes at a pixel of the 32-pixel-wide drawing. */
function pixel(bitmap: Buffer, x: number, y: number): number[] {
  const offset = (y * 32 + x) * 4;
  return [...bitmap.subarray(offset, offset + 4)];
}

const CLEAR = [0, 0, 0, 0];

describe('drawSymbolicIcon', () => {
  it('draws a 16-point icon at twice the resolution', () => {
    const { width, height, scaleFactor, bitmap } = drawSymbolicIcon('light');
    expect({ width, height, scaleFactor, bytes: bitmap.length }).toEqual({
      width: 32,
      height: 32,
      scaleFactor: 2,
      bytes: 32 * 32 * 4,
    });
  });

  it('paints both bubbles in one shade, with the lines and the gap between them clear', () => {
    const { bitmap } = drawSymbolicIcon('light');
    expect(pixel(bitmap, 0, 0)).toEqual(CLEAR);
    // The front bubble, the back one, a line of text, and the gap between bubbles.
    expect(pixel(bitmap, 5, 13)).toEqual([255, 255, 255, 255]);
    expect(pixel(bitmap, 15, 4)).toEqual([255, 255, 255, 255]);
    expect(pixel(bitmap, 10, 16)).toEqual(CLEAR);
    expect(pixel(bitmap, 10, 8)).toEqual(CLEAR);
    // The tails reach below and to the right of the bubbles.
    expect(pixel(bitmap, 7, 27)[3]).toBeGreaterThan(200);
    expect(pixel(bitmap, 28, 15)[3]).toBeGreaterThan(0);
  });

  it('smooths its edges, premultiplying the shade', () => {
    const { bitmap } = drawSymbolicIcon('light');
    const [blue = 0, , , alpha = 0] = pixel(bitmap, 6, 7);
    expect(alpha).toBeGreaterThan(0);
    expect(alpha).toBeLessThan(255);
    expect(blue).toBe(alpha);
  });

  it('draws a dark glyph for light panels and macOS templates', () => {
    const { bitmap } = drawSymbolicIcon('dark');
    expect(pixel(bitmap, 5, 13)).toEqual([0, 0, 0, 255]);
  });
});
