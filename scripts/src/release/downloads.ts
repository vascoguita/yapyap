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
      const shown = value < 10 ? Math.floor(value * 10) / 10 : Math.floor(value);
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
