import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Entry } from './entries.ts';

/** The largest screenshot the marketplace publishes. */
export const MAX_SCREENSHOT_BYTES = 1_048_576;

/** A screenshot as the index lists it: beside the index, never on an author's server (ADR 0014). */
export interface ListedScreenshot {
  readonly url: string;
  readonly caption: string;
}

const screenshotUrl = (id: string, file: string): string =>
  `https://packages.guita.org/extensions/${id}/screenshots/${file}`;

/** The eight bytes every PNG file starts with. */
const PNG = Array.from(Buffer.from('89504e470d0a1a0a', 'hex'));

const startsWith = (bytes: Uint8Array, prefix: readonly number[], at = 0): boolean =>
  prefix.every((byte, index) => bytes[at + index] === byte);

const ascii = (text: string): number[] => Array.from(new TextEncoder().encode(text));

/** Whether the bytes are what the file's name says: a PNG or a WebP image. */
function isImage(file: string, bytes: Uint8Array): boolean {
  return file.endsWith('.png')
    ? startsWith(bytes, PNG)
    : startsWith(bytes, ascii('RIFF')) && startsWith(bytes, ascii('WEBP'), 8);
}

/** Where an extension's screenshot lives in the marketplace folder. */
export const screenshotPath = (folder: string, id: string, file: string): string =>
  join(folder, 'screenshots', id, file);

/** Reads screenshots from the marketplace folder; a missing one reads as undefined. */
export function screenshotReader(
  folder: string,
): (id: string, file: string) => Uint8Array | undefined {
  return (id, file) => {
    const path = screenshotPath(folder, id, file);
    return existsSync(path) ? readFileSync(path) : undefined;
  };
}

/**
 * An entry's screenshots for the index (#434), after checking that each file
 * is in the repository, is the image its name says, and is small enough.
 */
export function screenshotsOf(
  entry: Entry,
  read: (id: string, file: string) => Uint8Array | undefined,
): ListedScreenshot[] {
  return (entry.screenshots ?? []).map(({ file, caption }) => {
    const bytes = read(entry.id, file);
    if (bytes === undefined) {
      throw new Error(
        `${entry.id}: screenshot ${file} is not in marketplace/screenshots/${entry.id}/.`,
      );
    }
    if (bytes.length > MAX_SCREENSHOT_BYTES || !isImage(file, bytes)) {
      throw new Error(
        `${entry.id}: screenshot ${file} is not a PNG or WebP image of at most 1 MiB.`,
      );
    }
    return { url: screenshotUrl(entry.id, file), caption };
  });
}
