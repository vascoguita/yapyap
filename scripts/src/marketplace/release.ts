import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { RELEASE_DOWNLOADS } from '../release/releases.ts';
import type { Entry } from './entries.ts';

/** The marketplace's own limits on a version's notes (#434) and an extension's versions. */
const MAX_NOTES = 2000;
const MAX_VERSIONS = 50;

/** One released version of a first-party extension, as its release workflow knows it. */
export interface Release {
  readonly id: string;
  readonly version: string;
  /** The release's tag, such as `ai-assistant-v0.2.0`. */
  readonly tag: string;
  /** The signed archive's file name, attached to that release. */
  readonly file: string;
  readonly archive: Uint8Array;
  /** The oldest YapYap the version runs on, from the extension's `package.json`. */
  readonly minYapYap: string;
  readonly published: string;
  /** The changelog section release-please wrote for this version. */
  readonly notes: string;
}

/** What a first-party entry starts with, the first time one of its versions is released. */
export interface EntryDefaults {
  readonly summary: string;
  readonly homepage: string;
  readonly license: string;
  /** The fingerprint of the key that signs YapYap's own extensions. */
  readonly signer: string;
  readonly repository: string;
}

const sha256Of = (bytes: Uint8Array): string =>
  `sha256-${createHash('sha256').update(bytes).digest('base64')}`;

/** Release notes as plain text for the marketplace: no Markdown link noise, within its limit. */
export function plainNotes(changelog: string): string | undefined {
  const text = changelog
    .split('\n')
    .filter((line) => !line.startsWith('## ') && !line.startsWith('### '))
    .map((line) =>
      line
        // Bounded, so a malformed changelog line cannot make the match backtrack for long.
        .replace(/ \(\[[^\]]{0,200}\]\([^)]{0,500}\)\)/g, '')
        .replace(/\[([^\]]{0,200})\]\([^)]{0,500}\)/g, '$1')
        .replace(/\*\*([^*]*)\*\*/g, '$1')
        .trimEnd(),
    )
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return text === '' ? undefined : text.slice(0, MAX_NOTES);
}

/**
 * The entry with this release listed last, as the newest version (ADR 0014):
 * a version released again replaces its old listing, and an extension
 * released for the first time gets an official entry from the defaults.
 */
export function withRelease(
  entry: Entry | undefined,
  release: Release,
  defaults: EntryDefaults,
): Entry {
  const notes = plainNotes(release.notes);
  const listed: Entry['versions'][number] = {
    version: release.version,
    tag: release.tag,
    source: `${RELEASE_DOWNLOADS}/${release.tag}/${release.file}`,
    sha256: sha256Of(release.archive),
    minYapYap: release.minYapYap,
    published: release.published,
    ...(notes === undefined ? {} : { notes }),
  };
  const base: Entry = entry ?? {
    id: release.id,
    ...defaults,
    review: 'official',
    versions: [],
  };
  const others = base.versions.filter(({ version }) => version !== release.version);
  // The index lists at most fifty versions; the oldest make way.
  return { ...base, versions: [...others, listed].slice(-MAX_VERSIONS) };
}

/**
 * A JSON file's contents, or undefined when there is none yet, as before an
 * extension's first release. It is read once rather than checked first, so
 * nothing can change it between the check and the read.
 */
export function readOptional(path: string): unknown {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as unknown;
  } catch (error) {
    if ((error as { code?: unknown }).code === 'ENOENT') {
      return undefined;
    }
    throw error;
  }
}
