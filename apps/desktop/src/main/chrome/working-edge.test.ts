import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { edgeTurn, WORKING_EDGE } from '../../shared/working-edge.ts';

const squeezed = (css: string): string => css.replaceAll(/\s+/g, ' ').trim();

describe('WORKING_EDGE', () => {
  it('is the same rule in Settings’ stylesheet, which cannot take it injected', () => {
    const stylesheet = readFileSync(join(import.meta.dirname, '../../renderer/styles.css'), 'utf8');
    expect(squeezed(stylesheet)).toContain(squeezed(WORKING_EDGE));
  });

  it('turns the light slowly, and holds it still for people who ask for less motion', () => {
    expect(WORKING_EDGE).toContain(
      'animation: working-edge var(--edge-turn, 1.6s) linear infinite;',
    );
    expect(WORKING_EDGE).toMatch(
      /prefers-reduced-motion: reduce\) \{\s+\.working::before \{\s+animation: none;/,
    );
  });

  it('times a turn from the pill’s size, so the light travels at one pace on every pill (#741)', () => {
    expect(edgeTurn(96, 40)).toBe('1.58s');
    expect(edgeTurn(150, 40)).toBe('2.30s');
    expect(edgeTurn(40, 40)).toBe('0.84s');
    // Narrower than tall still turns by its height alone.
    expect(edgeTurn(20, 40)).toBe('0.84s');
    // Not laid out yet: the rule's own time.
    expect(edgeTurn(0, 0)).toBe('1.6s');
  });
});
