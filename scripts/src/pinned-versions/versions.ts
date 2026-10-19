export interface NodeRelease {
  readonly version: string;
  readonly lts: string | false;
}

function parts(version: string): readonly number[] {
  return version.replace(/^v/, '').split('.').map(Number);
}

/** Orders dotted numeric versions such as `v24.1.0` or `26.08`. */
export function compareVersions(a: string, b: string): number {
  const [left, right] = [parts(a), parts(b)];
  for (let i = 0; i < Math.max(left.length, right.length); i++) {
    const delta = (left[i] ?? 0) - (right[i] ?? 0);
    if (delta !== 0) return delta;
  }
  return 0;
}

function latest(versions: readonly string[]): string | undefined {
  return [...versions].sort(compareVersions).at(-1);
}

/** The newest release of the newest LTS line is the current Active LTS. */
export function latestNodeLts(index: readonly NodeRelease[]): string | undefined {
  const lts = index.filter((release) => release.lts !== false).map((release) => release.version);
  return latest(lts)?.replace(/^v/, '');
}

export function latestBaseAppBranch(branches: readonly string[]): string | undefined {
  const stable = branches.flatMap((name) => /^branch\/(\d{2}\.\d{2})$/.exec(name)?.slice(1) ?? []);
  return latest(stable);
}
