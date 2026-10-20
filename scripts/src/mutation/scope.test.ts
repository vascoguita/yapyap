import { describe, expect, it } from 'vitest';
import { inMutationScope, MUTATION_SCOPE, mutationTargets } from './scope.ts';

describe('inMutationScope', () => {
  it.each([
    'apps/desktop/src/adapter/selectors/v1.ts',
    'apps/desktop/src/main/plugins/capabilities.ts',
    'apps/desktop/src/main/settings/migrations.ts',
    'apps/desktop/src/main/settings/store.ts',
    'apps/desktop/src/main/whatsapp-origin.ts',
    'packages/plugin-sign/src/sign.ts',
    'plugins/ai-assistant/src/providers/anthropic.ts',
    'apps\\desktop\\src\\adapter\\unread.ts',
  ])('includes %s', (path) => {
    expect(inMutationScope(path)).toBe(true);
  });

  it.each([
    'apps/desktop/src/adapter/unread.test.ts',
    'apps/desktop/src/main/start.ts',
    'packages/plugin-sign/src/bin/cli.ts',
    'packages/sdk/src/index.d.ts',
    'README.md',
  ])('excludes %s', (path) => {
    expect(inMutationScope(path)).toBe(false);
  });

  it('covers every module family named in the test-strategy ADR', () => {
    expect(MUTATION_SCOPE).toEqual(
      expect.arrayContaining([
        expect.stringContaining('adapter'),
        expect.stringContaining('plugins'),
        expect.stringContaining('settings'),
        expect.stringContaining('plugin-sign'),
        expect.stringContaining('providers'),
      ]),
    );
  });
});

describe('mutationTargets', () => {
  it('keeps unique, trimmed, in-scope files in order', () => {
    expect(
      mutationTargets([
        'scripts/src/licenses/check.ts',
        ' apps/desktop/src/main/whatsapp-origin.ts ',
        '',
        'docs/index.md',
        'scripts/src/licenses/check.ts',
      ]),
    ).toEqual(['scripts/src/licenses/check.ts', 'apps/desktop/src/main/whatsapp-origin.ts']);
  });
});
