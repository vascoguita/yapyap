import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { ALLOWED_LICENSES, isAllowed } from './check.ts';

type Expression =
  | { readonly license: string }
  | { readonly operator: 'AND' | 'OR'; readonly left: Expression; readonly right: Expression };

const LICENSES = ['MIT', 'Apache-2.0', 'MPL-2.0', 'GPL-3.0-only', 'AGPL-3.0-or-later', 'SSPL-1.0'];

const { expression } = fc.letrec<{ expression: Expression; leaf: Expression; node: Expression }>(
  (tie) => ({
    expression: fc.oneof({ depthSize: 'small' }, tie('leaf'), tie('node')),
    leaf: fc.record({ license: fc.constantFrom(...LICENSES) }),
    node: fc.record({
      operator: fc.constantFrom('AND' as const, 'OR' as const),
      left: tie('expression'),
      right: tie('expression'),
    }),
  }),
);

function render(tree: Expression): string {
  return 'license' in tree
    ? tree.license
    : `(${render(tree.left)} ${tree.operator} ${render(tree.right)})`;
}

function evaluate(tree: Expression): boolean {
  if ('license' in tree) {
    return ALLOWED_LICENSES.has(tree.license);
  }
  return tree.operator === 'AND'
    ? evaluate(tree.left) && evaluate(tree.right)
    : evaluate(tree.left) || evaluate(tree.right);
}

describe('isAllowed properties', () => {
  it('agrees with a reference evaluator on any parenthesized expression', () => {
    fc.assert(
      fc.property(expression, (tree) => {
        expect(isAllowed(render(tree))).toBe(evaluate(tree));
      }),
    );
  });

  it('never throws and never allows a token soup that is not a valid expression', () => {
    const token = fc.constantFrom(...LICENSES, 'AND', 'OR', 'WITH', '(', ')', 'LLVM-exception');
    fc.assert(
      fc.property(fc.array(token), fc.string(), (tokens, noise) => {
        expect(typeof isAllowed(`${tokens.join(' ')}${noise}`)).toBe('boolean');
        expect(isAllowed(`${tokens.join(' ')} AND`)).toBe(false);
      }),
    );
  });
});
