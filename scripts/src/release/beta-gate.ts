/** How long the newest beta of a version must have been out before the stable release (#184). */
export const MIN_BETA_AGE_DAYS = 3;
const DAY_MS = 86_400_000;

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

/** A security fix may skip the wait, never the beta; the release PR states the reason. */
export function securityReason(pullRequestBody: string): string | undefined {
  return /^Security release: *(\S.*)$/m.exec(pullRequestBody)?.[1]?.trim();
}

export interface GateInput {
  readonly version: string;
  readonly releases: readonly PublishedRelease[];
  readonly now: number;
  readonly securityReason: string | undefined;
}

/**
 * Lets a stable release out only after a published beta of the same version
 * has been in testers' hands for {@link MIN_BETA_AGE_DAYS} days.
 */
export function checkBetaGate(input: GateInput): GateResult {
  const escaped = input.version.replaceAll('.', String.raw`\.`);
  const beta = new RegExp(String.raw`^v${escaped}-beta\.\d+$`);
  const published = input.releases
    .filter((release) => release.prerelease && beta.test(release.tag))
    .flatMap((release) => (release.publishedAt === undefined ? [] : [release.publishedAt]));
  if (published.length === 0) {
    return {
      pass: false,
      message: `No published v${input.version}-beta.N pre-release exists. Cut a beta first (CONTRIBUTING, Releases).`,
    };
  }
  if (input.securityReason !== undefined) {
    return {
      pass: true,
      message: `Security release, skipping the beta wait: ${input.securityReason}`,
    };
  }
  const days = (input.now - Math.max(...published)) / DAY_MS;
  return days >= MIN_BETA_AGE_DAYS
    ? {
        pass: true,
        message: `The newest v${input.version} beta has been out for ${days.toFixed(1)} days.`,
      }
    : {
        pass: false,
        message: `The newest v${input.version} beta has been out for ${days.toFixed(1)} days; a stable release needs ${String(MIN_BETA_AGE_DAYS)}.`,
      };
}
