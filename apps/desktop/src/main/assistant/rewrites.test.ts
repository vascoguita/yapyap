import { describe, expect, it } from 'vitest';
import { cleanRewrite, isPolishStyle, POLISH_STYLES, rewriteInstructions } from './rewrites.ts';

describe('rewriteInstructions', () => {
  it('asks for the draft in the chosen style, keeping its meaning and its language', () => {
    expect(rewriteInstructions('polish')).toContain('spelling, grammar and flow are right');
    expect(rewriteInstructions('shorten')).toContain('more concise and to the point');
    expect(rewriteInstructions('elaborate')).toContain('adding no facts it does not give');
    expect(rewriteInstructions('formalize')).toContain('more professional and formal');
    for (const style of POLISH_STYLES) {
      expect(rewriteInstructions(style)).toContain('Keep its meaning');
      expect(rewriteInstructions(style)).toContain('Write it in the language the draft is in.');
    }
  });

  it('softens a draft without making it longer or adding emoji', () => {
    const soften = rewriteInstructions('soften');
    expect(soften).toContain('gentler and friendlier');
    expect(soften).toContain('about as long as it is');
    expect(soften).toContain('no emoji it does not already have');
  });
});

describe('POLISH_STYLES and isPolishStyle', () => {
  it('names the rewrite button’s five ways, Polish first, and nothing else', () => {
    expect(POLISH_STYLES).toEqual(['polish', 'shorten', 'elaborate', 'soften', 'formalize']);
    expect(POLISH_STYLES.every(isPolishStyle)).toBe(true);
    for (const value of ['friendlier', 'translate:pt', '', 'Polish']) {
      expect(isPolishStyle(value)).toBe(false);
    }
  });
});

describe('cleanRewrite', () => {
  it('takes the quotes off a rewrite', () => {
    expect(cleanRewrite('  “See you at 8!” ')).toBe('See you at 8!');
    expect(cleanRewrite("'ok'")).toBe('ok');
  });
});
