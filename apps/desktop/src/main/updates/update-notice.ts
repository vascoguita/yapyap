import type { UpdatePolicy } from './update-policy.ts';
import { en } from '../../shared/messages/en.ts';

/** GitHub's latest stable release; drafts and pre-releases never appear here. */
export const LATEST_RELEASE_API = 'https://api.github.com/repos/vascoguita/yapyap/releases/latest';
/** Once a day is enough to learn about a release without polling GitHub. */
export const NOTICE_INTERVAL_MS = 86_400_000;

const RELEASE_PAGE = 'https://github.com/vascoguita/yapyap/releases/tag/';
/** Parts of up to five digits keep the combined order key an exact integer. */
const VERSION =
  /^v?(?<major>\d{1,5})\.(?<minor>\d{1,5})\.(?<patch>\d{1,5})(?<pre>-[0-9A-Za-z.-]+)?$/;
const PART = 100_000;

interface Version {
  /** Major, minor and patch as one number that sorts like the version. */
  readonly order: number;
  readonly prerelease: boolean;
}

function parseVersion(text: string): Version | undefined {
  const parts = VERSION.exec(text)?.groups;
  if (parts === undefined) {
    return undefined;
  }
  return {
    order: (Number(parts['major']) * PART + Number(parts['minor'])) * PART + Number(parts['patch']),
    prerelease: parts['pre'] !== undefined,
  };
}

/** Whether `candidate` is a later version than `current`; a release beats its own betas. */
export function isNewer(candidate: string, current: string): boolean {
  const next = parseVersion(candidate);
  const now = parseVersion(current);
  if (next === undefined || now === undefined) {
    return false;
  }
  if (next.order === now.order) {
    return now.prerelease && !next.prerelease;
  }
  return next.order > now.order;
}

export interface ReleaseNotice {
  readonly version: string;
  /** The release page on GitHub, built here rather than taken from the response. */
  readonly url: string;
}

/** Reads GitHub's answer, trusting only a plain stable version tag. */
export function parseLatestRelease(value: unknown): ReleaseNotice | undefined {
  const { tag_name: tag, draft, prerelease } = Object(value) as Record<string, unknown>;
  if (typeof tag !== 'string' || draft !== false || prerelease !== false) {
    return undefined;
  }
  const version = tag.replace(/^v/, '');
  const parsed = parseVersion(version);
  return parsed === undefined || parsed.prerelease
    ? undefined
    : { version, url: `${RELEASE_PAGE}v${version}` };
}

/** Fetches JSON, treating any status but success as a failure. */
export function releaseFetcher(
  fetch: (url: string, init: { headers: Record<string, string> }) => Promise<Response>,
): (url: string) => Promise<unknown> {
  return async (url) => {
    const response = await fetch(url, { headers: { accept: 'application/vnd.github+json' } });
    if (!response.ok) {
      throw new Error(`GitHub answered ${String(response.status)}.`);
    }
    return response.json();
  };
}

export interface UpdateNoticeDependencies {
  readonly policy: UpdatePolicy;
  readonly currentVersion: string;
  readonly fetchJson: (url: string) => Promise<unknown>;
  readonly every: (callback: () => void, ms: number) => unknown;
  /** Tells the user, offering the release page; never downloads anything. */
  readonly showNotice: (message: string, url: string) => void;
  readonly warn: (message: string) => void;
}

/**
 * For builds that cannot update themselves but may tell the user about a
 * release (the portable build, unsigned macOS), checks GitHub's latest
 * release now and once a day. Every other policy makes no request at all.
 */
export function watchForReleases(deps: UpdateNoticeDependencies): void {
  if (deps.policy !== 'notify') {
    return;
  }
  let announced: string | undefined;
  const check = async (): Promise<void> => {
    const release = parseLatestRelease(await deps.fetchJson(LATEST_RELEASE_API));
    if (
      release !== undefined &&
      release.version !== announced &&
      isNewer(release.version, deps.currentVersion)
    ) {
      announced = release.version;
      deps.showNotice(en.notices.newRelease(release.version), release.url);
    }
  };
  const run = (): void => {
    check().catch(() => {
      deps.warn('Could not check for a new YapYap version.');
    });
  };
  run();
  deps.every(run, NOTICE_INTERVAL_MS);
}
