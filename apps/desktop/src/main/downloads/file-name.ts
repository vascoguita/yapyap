/** Windows refuses these as file names, with or without an extension. */
const RESERVED = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i;
/** Characters Windows forbids in names, which include both path separators. */
const FORBIDDEN = new Set('<>:"/\\|?*');

const isForbidden = (character: string): boolean => {
  const code = character.charCodeAt(0);
  return FORBIDDEN.has(character) || code < 0x20 || code === 0x7f;
};
/** Leaves room for " (99)" and stays under every common file system's limit. */
const MAX_LENGTH = 200;
const FALLBACK = 'download';

function splitExtension(name: string): { readonly stem: string; readonly extension: string } {
  const dot = name.lastIndexOf('.');
  return dot > 0
    ? { stem: name.slice(0, dot), extension: name.slice(dot) }
    : { stem: name, extension: '' };
}

/** Cuts by code points, so an emoji is never split into a broken half. */
const cut = (text: string, length: number): string => Array.from(text).slice(0, length).join('');

const trimEnds = (name: string): string => name.replace(/^[.\s]+/, '').replace(/[.\s]+$/, '');

function shorten(name: string): string {
  if (Array.from(name).length <= MAX_LENGTH) return name;
  const { stem, extension } = splitExtension(name);
  const length = Array.from(extension).length;
  // An extension too long to keep is not one worth keeping intact.
  if (length >= MAX_LENGTH / 2) return trimEnds(cut(name, MAX_LENGTH));
  return trimEnds(cut(stem, MAX_LENGTH - length)) + extension;
}

/**
 * A name that is safe to create inside the downloads folder on any OS: no
 * path parts, no characters or names Windows rejects, no hidden or empty
 * names. The extension and its case are kept, so attachments still open
 * with the right app.
 */
export function safeFileName(suggested: string): string {
  const base = suggested.slice(
    Math.max(suggested.lastIndexOf('/'), suggested.lastIndexOf('\\')) + 1,
  );
  const cleaned = trimEnds(
    base
      .normalize('NFC')
      .replace(/./gsu, (character) => (isForbidden(character) ? '_' : character)),
  );
  const named = cleaned === '' ? FALLBACK : cleaned;
  return shorten(RESERVED.test(named) ? `_${named}` : named);
}

/** The `n`th alternative to `name`, as browsers number them: "photo (1).jpg". */
export function numberedName(name: string, n: number): string {
  const { stem, extension } = splitExtension(name);
  return `${stem} (${String(n)})${extension}`;
}
