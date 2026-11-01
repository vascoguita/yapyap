import { globSync } from 'node:fs';
import { basename, dirname } from 'node:path';
import type { TestProjectInlineConfiguration } from 'vitest/config';

/** Every workspace package with tests: its unit tests sit next to the code in `src/`. */
const ROOTS = ['apps/*', 'packages/*', 'extensions/*', 'scripts'];
const TESTS = ['src/**/*.test.ts', 'src/**/*.test.tsx'];

/** Every test file, from the repository root. */
export const TEST_INCLUDE = ROOTS.flatMap((root) => TESTS.map((tests) => `${root}/${tests}`));

function projectName(root: string): string {
  return dirname(root) === 'extensions' ? `extension-${basename(root)}` : basename(root);
}

/**
 * One Vitest project per package, named as before. Renderer tests opt into
 * happy-dom with a comment at their top, which the flat mutation config also
 * honours.
 */
export function testProjects(): TestProjectInlineConfiguration[] {
  return globSync(ROOTS.map((root) => `${root}/src`))
    .map((source) => dirname(source).replaceAll('\\', '/'))
    .sort((left, right) => left.localeCompare(right))
    .map((root) => ({
      test: { root, name: projectName(root), include: TESTS, environment: 'node' },
    }));
}
