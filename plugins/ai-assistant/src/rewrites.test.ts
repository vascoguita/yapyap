import { describe, expect, it } from 'vitest';
import { cleanRewrite, languageName, rewriteInstructions, rewriteStyle } from './rewrites.ts';

describe('rewriteStyle', () => {
  it('takes the four styles the panel offers, and nothing else', () => {
    for (const style of ['friendlier', 'formal', 'shorter', 'translate']) {
      expect(rewriteStyle(style)).toBe(style);
    }
    for (const value of ['toString', 'louder', 7, undefined]) {
      expect(rewriteStyle(value)).toBeUndefined();
    }
  });
});

describe('languageName', () => {
  it('takes a short language name, trimmed', () => {
    expect(languageName(' Portuguese ')).toBe('Portuguese');
    expect(languageName('x'.repeat(40))).toHaveLength(40);
    expect(languageName('x'.repeat(41))).toBeUndefined();
    expect(languageName('  ')).toBeUndefined();
    expect(languageName(3)).toBeUndefined();
  });
});

describe('rewriteInstructions', () => {
  it('asks for the style, keeping the meaning, with the rewrite alone in the answer', () => {
    expect(rewriteInstructions('friendlier', '')).toContain('so it sounds warmer and friendlier');
    expect(rewriteInstructions('formal', '')).toContain('more formal and polite');
    expect(rewriteInstructions('shorter', '')).toContain('shorter and to the point');
    expect(rewriteInstructions('translate', 'Japanese')).toContain('translated into Japanese');
    expect(rewriteInstructions('shorter', '')).toContain('Keep its meaning');
    expect(rewriteInstructions('shorter', '')).toContain('with no quotes or other text');
  });
});

describe('cleanRewrite', () => {
  it('drops the quotes and space a model may put around the rewrite', () => {
    expect(cleanRewrite('  “See you at 8!”\n')).toBe('See you at 8!');
    expect(cleanRewrite("'Fine'")).toBe('Fine');
    expect(cleanRewrite('Say "hi" to them')).toBe('Say "hi" to them');
  });
});
