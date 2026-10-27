/** A release asset and how often GitHub served it. */
interface CountedAsset {
  readonly name: string;
  readonly downloads: number;
}

/** A GitHub release, as the download counts need it. */
export interface CountedRelease {
  readonly prerelease: boolean;
  readonly assets: readonly CountedAsset[];
}

/**
 * Installers and packages, by the format each file is. Update metadata
 * (`latest*.yml`, `.blockmap`), checksums, signatures, the SBOM and the
 * PKGBUILD are left out: the updater reads some of them on every check, so
 * they count checks, not installs.
 */
const FORMATS: readonly (readonly [string, RegExp])[] = [
  ['deb', /\.deb$/],
  ['rpm', /\.rpm$/],
  ['pacman', /\.pkg\.tar\.zst$/],
  ['AppImage', /\.AppImage$/],
  ['Flatpak', /\.flatpak$/],
  ['Windows', /\.exe$/],
  ['macOS', /\.(dmg|zip)$/],
];

export interface DownloadCounts {
  readonly total: number;
  readonly releases: number;
  readonly betas: number;
  readonly byFormat: Readonly<Record<string, number>>;
}

const formatOf = (name: string): string | undefined =>
  FORMATS.find(([, pattern]) => pattern.test(name))?.[0];

const sum = (assets: readonly CountedAsset[]): number =>
  assets.reduce((total, asset) => total + asset.downloads, 0);

/** How often YapYap's installers and packages were downloaded from GitHub (#347). */
export function countDownloads(releases: readonly CountedRelease[]): DownloadCounts {
  const counted = releases.flatMap(({ prerelease, assets }) =>
    assets.flatMap((asset) => {
      const format = formatOf(asset.name);
      return format === undefined ? [] : [{ ...asset, format, prerelease }];
    }),
  );
  const betas = sum(counted.filter((asset) => asset.prerelease));
  const stable = sum(counted.filter((asset) => !asset.prerelease));
  const byFormat = Object.fromEntries(
    FORMATS.map(([format]) => [format, sum(counted.filter((asset) => asset.format === format))]),
  );
  return { total: stable + betas, releases: stable, betas, byFormat };
}

const UNITS: readonly (readonly [number, string])[] = [
  [1e6, 'M'],
  [1e3, 'k'],
];

/** A count as a badge shows it: 999, 1.2k, 12k, 1.2M. */
export function compact(count: number): string {
  for (const [size, unit] of UNITS) {
    if (count >= size) {
      const value = count / size;
      const whole = Math.floor(value);
      const shown = whole < 10 ? Math.floor(value * 10) / 10 : whole;
      return `${String(shown)}${unit}`;
    }
  }
  return String(count);
}

/** The Shields.io endpoint badge for the README. */
export function badge(counts: DownloadCounts): object {
  return { schemaVersion: 1, label: 'downloads', message: compact(counts.total), color: 'blue' };
}

const isAsset = (value: unknown): boolean => {
  const asset = value as { name?: unknown; download_count?: unknown } | null;
  return typeof asset?.name === 'string' && Number.isInteger(asset.download_count);
};

const isRelease = (value: unknown): boolean => {
  const release = value as { prerelease?: unknown; assets?: unknown } | null;
  return (
    typeof release?.prerelease === 'boolean' &&
    Array.isArray(release.assets) &&
    release.assets.every(isAsset)
  );
};

interface GitHubRelease {
  readonly prerelease: boolean;
  readonly assets: readonly { readonly name: string; readonly download_count: number }[];
}

/** The releases in GitHub's REST answer, which must have the shape the counts rely on. */
export function fromGitHub(answer: unknown): CountedRelease[] {
  if (!Array.isArray(answer) || !answer.every(isRelease)) {
    throw new Error('Not a list of GitHub releases.');
  }
  return (answer as GitHubRelease[]).map((release) => ({
    prerelease: release.prerelease,
    assets: release.assets.map(({ name, download_count: downloads }) => ({ name, downloads })),
  }));
}

/**
 * The installer the website's download button offers for each system: one
 * file per key, matched by name in the latest stable release (#383).
 */
const INSTALLERS: readonly (readonly [string, RegExp])[] = [
  ['windows', /-win-x64-setup\.exe$/],
  ['windowsArm', /-win-arm64-setup\.exe$/],
  ['mac', /-mac-universal\.dmg$/],
  ['deb', /-linux-amd64\.deb$/],
  ['rpm', /-linux-x86_64\.rpm$/],
  ['appImage', /-linux-x86_64\.AppImage$/],
  ['appImageArm', /-linux-arm64\.AppImage$/],
  ['flatpak', /^yapyap-x86_64\.flatpak$/],
];

/** The latest stable version and a direct link to each of its installers. */
export interface LatestDownloads {
  readonly version: string;
  readonly files: Readonly<Record<string, string>>;
}

interface LinkedRelease {
  readonly tag_name: string;
  readonly prerelease: boolean;
  readonly draft: boolean;
  readonly assets: readonly { readonly name: string; readonly browser_download_url: string }[];
}

/** A stable release's tag, the only kind the website offers. */
const STABLE_TAG = /^v\d{1,4}\.\d{1,4}\.\d{1,4}$/;

const isLinkedRelease = (value: unknown): value is LinkedRelease => {
  const release = value as Partial<LinkedRelease> | null;
  return (
    typeof release?.tag_name === 'string' &&
    STABLE_TAG.test(release.tag_name) &&
    release.prerelease === false &&
    release.draft === false &&
    Array.isArray(release.assets)
  );
};

/**
 * Only this repository's own download addresses, for that release's tag and
 * a plain file name, so the site never links anywhere else, whatever the
 * API answers.
 */
const releaseUrl = (tag: string, name: string): string | undefined =>
  /^[\w.-]{1,200}$/.test(name)
    ? `https://github.com/vascoguita/yapyap/releases/download/${tag}/${name}`
    : undefined;

/**
 * The newest stable release in GitHub's answer, which lists the newest
 * first, with a link to each installer it has; undefined before the first.
 */
export function latestDownloads(answer: unknown): LatestDownloads | undefined {
  const release = Array.isArray(answer) ? answer.find(isLinkedRelease) : undefined;
  if (release === undefined) {
    return undefined;
  }
  const files = INSTALLERS.flatMap(([key, pattern]) => {
    const asset = release.assets.find((candidate) => pattern.test(candidate.name));
    if (asset === undefined) {
      return [];
    }
    const url = releaseUrl(release.tag_name, asset.name);
    return url !== undefined && url === asset.browser_download_url ? [[key, url] as const] : [];
  });
  return { version: release.tag_name.replace(/^v/, ''), files: Object.fromEntries(files) };
}
