import { describe, expect, it } from 'vitest';
import {
  cleanRewrite,
  rewriteInstructions,
  rewriteOf,
  rewriteOptions,
  translationLanguages,
} from './rewrites.ts';

describe('rewriteInstructions', () => {
  it('asks for the draft in the chosen style, keeping its meaning', () => {
    expect(rewriteInstructions({ style: 'friendlier', language: '' })).toContain(
      'warmer and friendlier',
    );
    expect(rewriteInstructions({ style: 'formal', language: '' })).toContain('more formal');
    expect(rewriteInstructions({ style: 'shorter', language: '' })).toContain('shorter');
    expect(rewriteInstructions({ style: 'translate', language: 'Portuguese' })).toContain(
      'translated into Portuguese',
    );
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
      { value: 'friendlier', label: 'Friendlier' },
      { value: 'formal', label: 'More formal' },
      { value: 'shorter', label: 'Shorter' },
      { value: 'translate:pt', label: 'Translate to Portuguese' },
      { value: 'translate:en', label: 'Translate to English' },
    ]);
    expect(rewriteOf('shorter', ['pt'])).toEqual({ style: 'shorter', language: '' });
    expect(rewriteOf('translate:pt', ['pt'])).toEqual({
      style: 'translate',
      language: 'Portuguese',
    });
    for (const value of ['translate:de', 'translate:', 'louder', 'translate:qqq']) {
      expect(rewriteOf(value, ['pt', 'qqq'])).toBeUndefined();
    }
  });
});
