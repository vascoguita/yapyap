import { describe, expect, it } from 'vitest';
import { physicalDeclarations } from './logical-css.ts';

describe('physicalDeclarations', () => {
  it('passes logical properties, and words that only contain left or right', () => {
    expect(
      physicalDeclarations(
        [
          'main { margin-inline-start: 4px; text-align: start; inset-inline-end: 0; }',
          '.copyright { border-inline-end: 1px solid; }',
          '/* margin-left: 4px in a comment */',
          '/* a comment',
          '   that says right: 2px */',
          '.leftover { color: red; }',
        ].join('\n'),
      ),
    ).toEqual([]);
  });

  it.each([
    'margin-left: 4px;',
    '  padding-right: 2px;',
    'a { border-left: 1px solid; }',
    'b{inset-right:0}',
    'right: 2px;',
    '  left : 0;',
    'border-top-left-radius: 4px;',
    'border-bottom-right-radius: 4px;',
    'text-align: left;',
    'text-align:right;',
    'float: left;',
    'clear: right;',
  ])('flags %s', (declaration) => {
    expect(physicalDeclarations(`p {\n${declaration}\n}`)).toEqual([
      `line 2: ${declaration.trim()}`,
    ]);
  });
});
