/** A BGRA bitmap with premultiplied alpha, as `nativeImage.createFromBitmap` takes it. */
export interface IconDrawing {
  readonly width: number;
  readonly height: number;
  /** Physical pixels per logical one; tray icons are 16 logical pixels. */
  readonly scaleFactor: number;
  readonly bitmap: Buffer;
}

/** The glyph's color: light for dark panels, dark for light ones and for macOS templates. */
export type GlyphShade = 'light' | 'dark';

const SIZE = 32;
const SCALE_FACTOR = 2;
const SUBSAMPLES = 4;
const BYTES_PER_PIXEL = 4;
const OPAQUE = 255;

interface RoundRect {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly radius: number;
}

interface Point {
  readonly x: number;
  readonly y: number;
}

type Triangle = readonly [Point, Point, Point];

// The two speech bubbles of the app icon (`build/icon.svg`), in its 512-unit grid.
const FRONT: RoundRect = { left: 82, top: 208, right: 362, bottom: 400, radius: 56 };
const FRONT_TAIL: Triangle = [
  { x: 200, y: 400 },
  { x: 138, y: 444 },
  { x: 158, y: 400 },
];
const BACK: RoundRect = { left: 150, top: 112, right: 430, bottom: 304, radius: 56 };
const BACK_TAIL: Triangle = [
  { x: 366, y: 304 },
  { x: 386, y: 348 },
  { x: 324, y: 304 },
];
const LINES: readonly RoundRect[] = [
  { left: 122, top: 268, right: 282, bottom: 292, radius: 12 },
  { left: 122, top: 316, right: 226, bottom: 340, radius: 12 },
];
/** The clear band that keeps the front bubble apart from the back one, one color only. */
const GAP = 24;
const EXTENT = { left: 82, top: 112, right: 430, bottom: 444 };
/** One pixel of margin on each side. */
const UNITS_PER_PIXEL = (EXTENT.right - EXTENT.left) / (SIZE - 2);

function inRoundRect(shape: RoundRect, x: number, y: number, grow = 0): boolean {
  const radius = shape.radius + grow;
  const dx = Math.max(shape.left - grow + radius - x, 0, x - (shape.right + grow - radius));
  const dy = Math.max(shape.top - grow + radius - y, 0, y - (shape.bottom + grow - radius));
  return dx * dx + dy * dy <= radius * radius;
}

function inTriangle([a, b, c]: Triangle, x: number, y: number): boolean {
  const side = (p: Point, q: Point): number => (q.x - p.x) * (y - p.y) - (q.y - p.y) * (x - p.x);
  const signs = [side(a, b), side(b, c), side(c, a)];
  return signs.every((value) => value >= 0) || signs.every((value) => value <= 0);
}

/** Whether a point of the 512-unit grid is part of the glyph. */
function inGlyph(x: number, y: number): boolean {
  const front = inRoundRect(FRONT, x, y) || inTriangle(FRONT_TAIL, x, y);
  if (front) {
    return !LINES.some((line) => inRoundRect(line, x, y));
  }
  const back = inRoundRect(BACK, x, y) || inTriangle(BACK_TAIL, x, y);
  return back && !inRoundRect(FRONT, x, y, GAP);
}

/** How much of a pixel the glyph covers, from 0 to 1. */
function coverage(px: number, py: number): number {
  const offsetX = EXTENT.left - (SIZE * UNITS_PER_PIXEL - (EXTENT.right - EXTENT.left)) / 2;
  const offsetY = EXTENT.top - (SIZE * UNITS_PER_PIXEL - (EXTENT.bottom - EXTENT.top)) / 2;
  let inside = 0;
  for (let sy = 0; sy < SUBSAMPLES; sy += 1) {
    for (let sx = 0; sx < SUBSAMPLES; sx += 1) {
      const x = offsetX + (px + (sx + 0.5) / SUBSAMPLES) * UNITS_PER_PIXEL;
      const y = offsetY + (py + (sy + 0.5) / SUBSAMPLES) * UNITS_PER_PIXEL;
      inside += inGlyph(x, y) ? 1 : 0;
    }
  }
  return inside / (SUBSAMPLES * SUBSAMPLES);
}

/**
 * The app icon as a one-color silhouette, as symbolic tray icons are drawn,
 * so it sits with the other icons of a panel or the macOS menu bar. Drawn
 * here rather than shipped as images, since only the shade varies.
 */
export function drawSymbolicIcon(shade: GlyphShade): IconDrawing {
  const level = shade === 'light' ? OPAQUE : 0;
  const bitmap = Buffer.alloc(SIZE * SIZE * BYTES_PER_PIXEL);
  for (let y = 0; y < SIZE; y += 1) {
    for (let x = 0; x < SIZE; x += 1) {
      const alpha = coverage(x, y);
      const value = Math.round(level * alpha);
      bitmap.set(
        [value, value, value, Math.round(OPAQUE * alpha)],
        (y * SIZE + x) * BYTES_PER_PIXEL,
      );
    }
  }
  return { width: SIZE, height: SIZE, scaleFactor: SCALE_FACTOR, bitmap };
}
