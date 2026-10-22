/** A BGRA bitmap with premultiplied alpha, as `nativeImage.createFromBitmap` takes it. */
export interface BadgeDrawing {
  readonly width: number;
  readonly height: number;
  /** Physical pixels per logical one; the overlay is 16 logical pixels wide. */
  readonly scaleFactor: number;
  readonly bitmap: Buffer;
}

const SIZE = 32;
const SCALE_FACTOR = 2;
const RADIUS = SIZE / 2;
/** Samples per pixel side, which smooths the circle's edge. */
const SUBSAMPLES = 4;
const BYTES_PER_PIXEL = 4;
const OPAQUE = 255;
const RED = { blue: 0x25, green: 0x30, red: 0xd9 };
const WHITE = { blue: OPAQUE, green: OPAQUE, red: OPAQUE };

// A 3×5 pixel font: legible at overlay size, and no font file to ship.
const GLYPHS: Readonly<Record<string, readonly string[]>> = {
  '0': ['111', '101', '101', '101', '111'],
  '1': ['010', '110', '010', '010', '111'],
  '2': ['111', '001', '111', '100', '111'],
  '3': ['111', '001', '111', '001', '111'],
  '4': ['101', '101', '111', '001', '001'],
  '5': ['111', '100', '111', '001', '111'],
  '6': ['111', '100', '111', '101', '111'],
  '7': ['111', '001', '001', '001', '001'],
  '8': ['111', '101', '111', '101', '111'],
  '9': ['111', '101', '111', '001', '111'],
  '+': ['000', '010', '111', '010', '000'],
};
const GLYPH_WIDTH = 3;
const GLYPH_HEIGHT = 5;
/** Glyph pixel size and gap for one character, and for two. */
const LAYOUT = [
  { scale: 4, gap: 0 },
  { scale: 3, gap: 3 },
] as const;

/** What the badge says: the count up to 9, then "9+", which still fits. */
export function badgeLabel(count: number): string {
  const most = 9;
  return count > most ? `${String(most)}+` : String(count);
}

/** How much of a pixel the circle covers, from 0 to 1. */
function coverage(x: number, y: number): number {
  let inside = 0;
  for (let sy = 0; sy < SUBSAMPLES; sy += 1) {
    for (let sx = 0; sx < SUBSAMPLES; sx += 1) {
      const dx = x + (sx + 0.5) / SUBSAMPLES - RADIUS;
      const dy = y + (sy + 0.5) / SUBSAMPLES - RADIUS;
      inside += dx * dx + dy * dy <= RADIUS * RADIUS ? 1 : 0;
    }
  }
  return inside / (SUBSAMPLES * SUBSAMPLES);
}

function paint(bitmap: Buffer, x: number, y: number, color: typeof RED, alpha: number): void {
  const offset = (y * SIZE + x) * BYTES_PER_PIXEL;
  const channels = [color.blue, color.green, color.red, OPAQUE];
  bitmap.set(
    channels.map((channel) => Math.round(channel * alpha)),
    offset,
  );
}

/** The pixels of the label that are set, in bitmap coordinates. */
function labelPixels(label: string): [number, number][] {
  const { scale, gap } = label.length === 1 ? LAYOUT[0] : LAYOUT[1];
  const width = label.length * GLYPH_WIDTH * scale + (label.length - 1) * gap;
  const left = Math.floor((SIZE - width) / 2);
  const top = Math.floor((SIZE - GLYPH_HEIGHT * scale) / 2);
  return Array.from(label).flatMap((character, index) =>
    (GLYPHS[character] ?? []).flatMap((row, gy) =>
      Array.from(row).flatMap((bit, gx) => {
        if (bit !== '1') {
          return [];
        }
        const x = left + index * (GLYPH_WIDTH * scale + gap) + gx * scale;
        const y = top + gy * scale;
        return Array.from({ length: scale * scale }, (_, n): [number, number] => [
          x + (n % scale),
          y + Math.floor(n / scale),
        ]);
      }),
    ),
  );
}

/** A red disc with the unread count in white, for the Windows taskbar overlay. */
export function drawBadge(count: number): BadgeDrawing {
  const bitmap = Buffer.alloc(SIZE * SIZE * BYTES_PER_PIXEL);
  for (let y = 0; y < SIZE; y += 1) {
    for (let x = 0; x < SIZE; x += 1) {
      paint(bitmap, x, y, RED, coverage(x, y));
    }
  }
  for (const [x, y] of labelPixels(badgeLabel(count))) {
    paint(bitmap, x, y, WHITE, 1);
  }
  return { width: SIZE, height: SIZE, scaleFactor: SCALE_FACTOR, bitmap };
}
