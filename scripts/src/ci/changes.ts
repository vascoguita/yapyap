import { matchesGlob } from 'node:path';

/** How much packaging a pull request runs (ADR 0007). */
type PackagingScope = 'none' | 'representative' | 'full';

export interface ChangeScope {
  /** Whether anything but documentation changed, so tests and builds must run. */
  readonly code: boolean;
  readonly packaging: PackagingScope;
  /** Whether macOS, the scarcest runner, tests, packages and smoke-tests the change. */
  readonly macos: boolean;
  /** Whether the Renovate config must be validated. */
  readonly renovate: boolean;
}

export interface ChangeContext {
  /** A release-please pull request, which must check everything before it ships. */
  readonly release?: boolean;
  /** Changed files that hold macOS-specific code, before or after the change. */
  readonly macOSFiles?: ReadonlySet<string>;
}

/** Files that change no code, build or test: lint and the docs build still check them. */
const DOCUMENTATION = [
  '**/*.md',
  'docs/**',
  // The docs site's own config; the docs workflow builds it.
  'docs/.vitepress/**',
  '.github/ISSUE_TEMPLATE/**',
  'LICENSE',
];

/**
 * Files that configure how YapYap is packaged, on any format or
 * architecture: these run the full packaging and smoke matrix.
 */
const PACKAGING = [
  'apps/desktop/electron-builder.yml',
  'apps/desktop/build/**',
  'packaging/**',
  'scripts/src/packaging/**',
  'scripts/src/release/**',
  'scripts/src/bin/aur.ts',
  'scripts/src/bin/distribution.ts',
  'scripts/src/bin/package.ts',
  'scripts/src/bin/stamp-metainfo.ts',
  'scripts/src/bin/verify-fuses.ts',
  '.github/workflows/package.yml',
  '.github/workflows/smoke.yml',
  '.github/workflows/release.yml',
  '.github/workflows/beta.yml',
  '.github/workflows/distribute.yml',
  // The setup every packaging and smoke job runs.
  '.github/actions/**',
];

/**
 * Dependencies and the runtime: they reach every system, so macOS runs too,
 * but one package per system shows they still build and start. The full
 * matrix follows on `master`.
 */
const DEPENDENCIES = ['**/package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml', '.nvmrc'];

/** Files besides packaging and dependencies that macOS checks on every change. */
const MACOS = ['**/*.plist', '.github/workflows/ci.yml'];

/** Renovate's config and the pinned Renovate that validates it. */
const RENOVATE = ['.github/renovate.json', '.github/workflows/ci.yml'];

function matchesAny(file: string, globs: readonly string[]): boolean {
  return globs.some((glob) => matchesGlob(file, glob));
}

const EVERYTHING: ChangeScope = { code: true, packaging: 'full', macos: true, renovate: true };

/** What a pull request that changes `changedFiles` must check. */
export function changeScope(
  changedFiles: readonly string[],
  context: ChangeContext = {},
): ChangeScope {
  const files = changedFiles
    .map((file) => file.trim().replaceAll('\\', '/'))
    .filter((file) => file !== '');
  // Nothing to compare against means nothing can be skipped safely.
  if (files.length === 0 || context.release === true) {
    return EVERYTHING;
  }
  return scopeOf(files, context.macOSFiles ?? new Set());
}

function scopeOf(files: string[], macOSFiles: ReadonlySet<string>): ChangeScope {
  const changes = (globs: readonly string[]) => files.some((file) => matchesAny(file, globs));
  const code = files.some((file) => !matchesAny(file, DOCUMENTATION));
  const renovate = changes(RENOVATE);
  if (changes(PACKAGING)) {
    return { code, packaging: 'full', macos: true, renovate };
  }
  const macos =
    code && (changes(DEPENDENCIES) || changes(MACOS) || files.some((file) => macOSFiles.has(file)));
  return { code, packaging: code ? 'representative' : 'none', macos, renovate };
}
