import type { Fetch } from './github.ts';

export interface Config {
  readonly token: string;
  readonly repository: string;
  readonly base: string;
}

/**
 * Prefers a dedicated automation token: pull requests opened with the default
 * workflow token do not trigger CI, so required checks would never report.
 */
export function resolveConfig(env: Readonly<Record<string, string | undefined>>): Config {
  // Actions passes unset secrets as empty strings.
  const token = [env['AUTOMATION_TOKEN'], env['GITHUB_TOKEN']].find(
    (value) => value !== undefined && value !== '',
  );
  const repository = env['GITHUB_REPOSITORY'];
  if (token === undefined || repository === undefined) {
    throw new Error('GITHUB_TOKEN (or AUTOMATION_TOKEN) and GITHUB_REPOSITORY are required');
  }
  return { token, repository, base: env['BASE_BRANCH'] ?? 'master' };
}

export function optionalFileReader(
  read: (path: string) => Promise<string>,
): (path: string) => Promise<string | undefined> {
  return async (path) => {
    try {
      return await read(path);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return undefined;
      }
      throw error;
    }
  };
}

export function jsonFetcher(fetch: Fetch): (url: string) => Promise<unknown> {
  return async (url) => {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`GET ${url} failed with ${String(response.status)}`);
    }
    return response.json();
  };
}
