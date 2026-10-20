import { matchesGlob } from 'node:path';

/**
 * Modules whose tests must kill at least 90% of mutants (ADR 0005): the
 * WhatsApp adapter, plugin host, capability checker, signature verification,
 * settings migrations and AI providers, plus other security-sensitive parsers.
 */
export const MUTATION_SCOPE: readonly string[] = [
  'apps/desktop/src/adapter/**/*.ts',
  'apps/desktop/src/main/plugins/**/*.ts',
  'apps/desktop/src/main/settings/migrations/**/*.ts',
  'apps/desktop/src/main/whatsapp-origin.ts',
  'packages/plugin-sign/src/**/*.ts',
  'plugins/ai-assistant/src/providers/**/*.ts',
  'scripts/src/licenses/**/*.ts',
  'scripts/src/release/**/*.ts',
];

const NEVER_MUTATED = ['**/*.test.ts', '**/*.d.ts', '**/bin/**'];

export function inMutationScope(path: string): boolean {
  const normalized = path.replaceAll('\\', '/');
  return (
    MUTATION_SCOPE.some((glob) => matchesGlob(normalized, glob)) &&
    !NEVER_MUTATED.some((glob) => matchesGlob(normalized, glob))
  );
}

/** Picks the changed files a pull request's mutation run must cover. */
export function mutationTargets(changedFiles: readonly string[]): string[] {
  return [
    ...new Set(
      changedFiles
        .map((file) => file.trim())
        .filter((file) => file !== '' && inMutationScope(file)),
    ),
  ];
}
