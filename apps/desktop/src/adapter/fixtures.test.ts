import { readdirSync, readFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The fake WhatsApp page is built from anonymized fixtures (ADR 0005). This
 * linter keeps anything that could identify a real person out of them.
 */
const FIXTURES = join(import.meta.dirname, '..', '..', 'test', 'fake-whatsapp');
const TEXT_FILES = new Set(['.html', '.js', '.css']);

/** Nine or more digits, optionally separated, as phone numbers are written. */
const PHONE_LIKE = /\+?\d(?:[\s-]?\d){8,14}/g;
/** Ofcom reserves +44 7700 900000 to 900999 for fiction; nobody can own them. */
const FICTIONAL_PHONE = /^447700900\d{3}$/;
/** Remote images, and WhatsApp's profile picture host in particular. */
const REMOTE_IMAGE = /https?:\/\/[^\s"'()]+\.(?:png|jpe?g|gif|webp|avif)\b|pps\.whatsapp\.net/gi;

function fixtureProblems(text: string): string[] {
  const phones = [...text.matchAll(PHONE_LIKE)]
    .map(([match]) => match.replaceAll(/\D/g, ''))
    .filter((digits) => !FICTIONAL_PHONE.test(digits))
    .map((digits) => `phone-like number ${digits}`);
  const images = [...text.matchAll(REMOTE_IMAGE)].map(([match]) => `remote image ${match}`);
  return [...phones, ...images];
}

describe('fixtureProblems', () => {
  it.each([
    ['tel:+351 912 345 678', ['phone-like number 351912345678']],
    ['phone=5511987654321', ['phone-like number 5511987654321']],
    ['<img src="https://example.com/a.jpg">', ['remote image https://example.com/a.jpg']],
    ['https://pps.whatsapp.net/v/t61', ['remote image pps.whatsapp.net']],
  ])('flags %j', (text, problems) => {
    expect(fixtureProblems(text)).toEqual(problems);
  });

  it.each(['tel:+44 7700 900123', 'phone=447700900999', 'width="264"', '<img src="/avatar.svg">'])(
    'allows %j',
    (text) => {
      expect(fixtureProblems(text)).toEqual([]);
    },
  );
});

describe('the fake WhatsApp fixtures', () => {
  const files = readdirSync(FIXTURES).filter((name) => TEXT_FILES.has(extname(name)));

  it('include the pages the adapter tests rely on', () => {
    expect(files).toEqual(expect.arrayContaining(['index.html', 'logged-out.html']));
  });

  it.each(files)('%s holds no real phone numbers or profile images', (name) => {
    expect(fixtureProblems(readFileSync(join(FIXTURES, name), 'utf8'))).toEqual([]);
  });
});
