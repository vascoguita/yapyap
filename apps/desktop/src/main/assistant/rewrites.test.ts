import { describe, expect, it } from 'vitest';
import {
  cleanRewrite,
  isPolishStyle,
  POLISH_STYLES,
  rewriteInstructions,
  rewriteOf,
  rewriteOptions,
  translationLanguages,
} from './rewrites.ts';

describe('rewriteInstructions', () => {
  it('asks for the draft in the chosen style, keeping its meaning', () => {
    const asked = (style: Parameters<typeof rewriteInstructions>[0]['style']): string =>
      rewriteInstructions({ style, language: '' });
    expect(asked('polish')).toContain('spelling, grammar and flow are right');
    expect(asked('shorten')).toContain('more concise and to the point');
    expect(asked('elaborate')).toContain('adding no facts it does not give');
    expect(asked('formalize')).toContain('more professional and formal');
    expect(asked('friendlier')).toContain('warmer and friendlier');
    expect(asked('polish')).toContain('Keep its meaning');
    expect(rewriteInstructions({ style: 'translate', language: 'Portuguese' })).toContain(
      'translated into Portuguese',
    );
  });

  it('keeps the draft’s language, unless it asks for a translation', () => {
    const same = 'Write it in the language the draft is in.';
    expect(rewriteInstructions({ style: 'shorten', language: '' })).toContain(same);
    expect(rewriteInstructions({ style: 'translate', language: 'German' })).not.toContain(same);
  });
});

describe('POLISH_STYLES and isPolishStyle', () => {
  it('names the message box button’s four ways, Polish first, and nothing else', () => {
    expect(POLISH_STYLES).toEqual(['polish', 'shorten', 'elaborate', 'formalize']);
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

describe('translationLanguages', () => {
  it('offers the system’s languages, then English, by base language and once each', () => {
    expect(translationLanguages(['pt-BR', 'pt-PT', 'de', 'EN-us'])).toEqual(['pt', 'de', 'en']);
    expect(translationLanguages(['x-private', 'fr', 'es', 'it', 'nl'])).toEqual([
      'fr',
      'es',
      'it',
      'nl',
    ]);
    expect(translationLanguages([])).toEqual(['en']);
  });
});

describe('rewriteOptions and rewriteOf', () => {
  it('offers the styles and the translations, and takes back only what it offered', () => {
    const options = rewriteOptions(['pt', 'qqq', 'en']);
    expect(options).toEqual([
      { value: 'polish', label: 'Polish' },
      { value: 'shorten', label: 'Shorten' },
      { value: 'elaborate', label: 'Elaborate' },
      { value: 'formalize', label: 'Formalize' },
      { value: 'friendlier', label: 'Friendlier' },
      { value: 'translate:pt', label: 'Translate to Portuguese' },
      { value: 'translate:en', label: 'Translate to English' },
    ]);
    expect(rewriteOf('shorten', ['pt'])).toEqual({ style: 'shorten', language: '' });
    expect(rewriteOf('friendlier', [])).toEqual({ style: 'friendlier', language: '' });
    expect(rewriteOf('translate:pt', ['pt'])).toEqual({
      style: 'translate',
      language: 'Portuguese',
    });
    for (const value of ['translate:de', 'translate:', 'louder', 'translate:qqq', 'shorter']) {
      expect(rewriteOf(value, ['pt', 'qqq'])).toBeUndefined();
    }
  });
});
