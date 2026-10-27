const SEMVER = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/;

/** A semantic version's release numbers and prerelease identifiers; anything else counts as 0.0.0. */
function parts(version: string): { release: [number, number, number]; pre: string[] } {
  const match = SEMVER.exec(version) ?? ['', '0', '0', '0'];
  return {
    release: [Number(match[1]), Number(match[2]), Number(match[3])],
    pre: match[4]?.split('.') ?? [],
  };
}

/**
 * Semantic-version order of two prerelease identifiers: numbers below
 * words, numerically; a list that runs out first is older.
 */
function compareIdentifiers(a: string | undefined, b: string | undefined): number {
  if (a === undefined || b === undefined) {
    return a === undefined ? -1 : 1;
  }
  const numeric = /^\d+$/;
  if (numeric.test(a) && numeric.test(b)) {
    return Number(a) - Number(b);
  }
  if (numeric.test(a) !== numeric.test(b)) {
    return numeric.test(a) ? -1 : 1;
  }
  return a.localeCompare(b);
}

function comparePre(a: readonly string[], b: readonly string[]): number {
  // A release outranks its prereleases: 1.0.0 is newer than 1.0.0-beta.1.
  if (a.length === 0 || b.length === 0) {
    return b.length - a.length;
  }
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    const order = compareIdentifiers(a[index], b[index]);
    if (order !== 0) {
      return order;
    }
  }
  return 0;
}

/**
 * Orders two semantic versions, as the marketplace compares a listed
 * version with the installed one and with the YapYap that runs it:
 * negative when `a` is older, positive when newer, zero when equal.
 */
export function compareVersions(a: string, b: string): number {
  const left = parts(a);
  const right = parts(b);
  for (const index of [0, 1, 2] as const) {
    const order = left.release[index] - right.release[index];
    if (order !== 0) {
      return order;
    }
  }
  return comparePre(left.pre, right.pre);
}
