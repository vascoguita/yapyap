import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { WORKING_EDGE } from '../../shared/working-edge.ts';

const squeezed = (css: string): string => css.replaceAll(/\s+/g, ' ').trim();

describe('WORKING_EDGE', () => {
  it('is the same rule in Settings’ stylesheet, which cannot take it injected', () => {
    const stylesheet = readFileSync(join(import.meta.dirname, '../../renderer/styles.css'), 'utf8');
    expect(squeezed(stylesheet)).toContain(squeezed(WORKING_EDGE));
  });

  it('turns the light slowly, and holds it still for people who ask for less motion', () => {
    expect(WORKING_EDGE).toContain('animation: working-edge 1.6s linear infinite;');
    expect(WORKING_EDGE).toMatch(
      /prefers-reduced-motion: reduce\) \{\s+\.working::before \{\s+animation: none;/,
    );
  });
});
