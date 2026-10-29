import { describe, expect, it } from 'vitest';
import type { Entry } from './entries.ts';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MAX_SCREENSHOT_BYTES, screenshotReader, screenshotsOf } from './screenshots.ts';

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]);
const WEBP = new TextEncoder().encode('RIFF\0\0\0\0WEBPVP8 ');

const entry = (screenshots?: Entry['screenshots']): Entry =>
  ({ id: 'org.example.hello', ...(screenshots === undefined ? {} : { screenshots }) }) as Entry;

describe('screenshotsOf', () => {
  it('lists each screenshot beside the index, with its caption', () => {
    const files = new Map([
      ['main.png', PNG],
      ['panel.webp', WEBP],
    ]);
    const listed = screenshotsOf(
      entry([
        { file: 'main.png', caption: 'The main window' },
        { file: 'panel.webp', caption: 'The panel' },
      ]),
      (id, file) => (id === 'org.example.hello' ? files.get(file) : undefined),
    );
    expect(listed).toEqual([
      {
        url: 'https://packages.guita.org/extensions/org.example.hello/screenshots/main.png',
        caption: 'The main window',
      },
      {
        url: 'https://packages.guita.org/extensions/org.example.hello/screenshots/panel.webp',
        caption: 'The panel',
      },
    ]);
    expect(screenshotsOf(entry(), () => PNG)).toEqual([]);
  });

  it('refuses a missing file, a file that is not the image it says, and a large one', () => {
    const shot = (file: string) => entry([{ file, caption: 'A' }]);
    expect(() => screenshotsOf(shot('main.png'), () => undefined)).toThrow(
      'org.example.hello: screenshot main.png is not in marketplace/screenshots/org.example.hello/.',
    );
    for (const [file, bytes] of [
      ['main.png', WEBP],
      ['main.webp', PNG],
      ['main.webp', new TextEncoder().encode('RIFF\0\0\0\0WAVEfmt ')],
      ['main.png', new Uint8Array([...PNG, ...new Uint8Array(MAX_SCREENSHOT_BYTES)])],
    ] as const) {
      expect(() => screenshotsOf(shot(file), () => bytes)).toThrow(
        `org.example.hello: screenshot ${file} is not a PNG or WebP image of at most 1 MiB.`,
      );
    }
  });
});

describe('screenshotReader', () => {
  it('reads a screenshot from marketplace/screenshots/<id>/, and nothing that is not there', () => {
    const folder = mkdtempSync(join(tmpdir(), 'yapyap-marketplace-'));
    try {
      mkdirSync(join(folder, 'screenshots', 'org.example.hello'), { recursive: true });
      writeFileSync(join(folder, 'screenshots', 'org.example.hello', 'main.png'), PNG);
      const read = screenshotReader(folder);
      expect(read('org.example.hello', 'main.png')).toEqual(Buffer.from(PNG));
      expect(read('org.example.hello', 'other.png')).toBeUndefined();
    } finally {
      rmSync(folder, { recursive: true, force: true });
    }
  });
});
