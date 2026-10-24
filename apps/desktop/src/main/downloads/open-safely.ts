import { extname } from 'node:path';

/**
 * File types that open in a viewer and never run anything: documents to
 * read, pictures, sound and video. Everything else, executables, scripts,
 * installers, shortcuts and office files with macros among them, is only
 * saved. An allowlist, so a new dangerous type is never opened by default.
 */
const VIEWABLE = new Set([
  '.pdf',
  '.txt',
  '.jpg',
  '.jpeg',
  '.png',
  '.gif',
  '.webp',
  '.heic',
  '.bmp',
  '.mp3',
  '.m4a',
  '.ogg',
  '.opus',
  '.wav',
  '.aac',
  '.flac',
  '.mp4',
  '.mov',
  '.webm',
  '.mkv',
  '.3gp',
]);

/** Whether YapYap may open a finished download by itself. */
export function opensSafely(path: string): boolean {
  return VIEWABLE.has(extname(path).toLowerCase());
}
