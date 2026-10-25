export interface PublishedRelease {
  readonly tag: string;
  readonly prerelease: boolean;
  /** Milliseconds since the epoch; drafts have none. */
  readonly publishedAt: number | undefined;
}

export interface GateResult {
  readonly pass: boolean;
  readonly message: string;
}

/** Reads GitHub's release list, keeping only what the gate needs. */
export function parseReleases(value: unknown): PublishedRelease[] {
  return (Array.isArray(value) ? value : []).flatMap((item: unknown) => {
    const {
      tag_name: tag,
      prerelease,
      published_at: published,
    } = Object(item) as Record<string, unknown>;
    if (typeof tag !== 'string' || typeof prerelease !== 'boolean') {
      return [];
    }
    const publishedAt = typeof published === 'string' ? Date.parse(published) : Number.NaN;
    return [{ tag, prerelease, publishedAt: Number.isNaN(publishedAt) ? undefined : publishedAt }];
  });
}

export interface GateInput {
  readonly version: string;
  readonly releases: readonly PublishedRelease[];
}

/**
 * Lets a stable release out only once a beta of the same version has been
 * published (#184). How long it stays out first is the maintainer's call.
 */
export function checkBetaGate(input: GateInput): GateResult {
  const escaped = input.version.replaceAll('.', String.raw`\.`);
  const beta = new RegExp(String.raw`^v${escaped}-beta\.\d+$`);
  const published = input.releases.filter(
    (release) => release.prerelease && beta.test(release.tag) && release.publishedAt !== undefined,
  );
  return published.length === 0
    ? {
        pass: false,
        message: `No published v${input.version}-beta.N pre-release exists. Cut a beta first (CONTRIBUTING, Releases).`,
      }
    : {
        pass: true,
        message: `v${input.version} has a published beta: ${published.map(({ tag }) => tag).join(', ')}.`,
      };
}
