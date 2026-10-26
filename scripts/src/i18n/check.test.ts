import { describe, expect, it } from 'vitest';
import { checkCatalogFiles, checkEnglish, checkTranslation } from './check.ts';

const ENGLISH = {
  title: 'Accounts',
  remove: 'Remove {{name}}?',
  unread_one: '1 unread chat',
  unread_other: '{{count}} unread chats',
  group: { label: 'Label' },
};

describe('checkEnglish', () => {
  it('passes a catalog of plain text', () => {
    expect(checkEnglish(ENGLISH)).toEqual([]);
  });

  it('finds empty text, markup, and plurals without both English forms', () => {
    expect(
      checkEnglish({
        blank: ' ',
        bold: 'a <b>b</b>',
        entity: 'a &amp; b',
        group: { only_other: '{{count}} things' },
        lonely_one: 'one thing',
      }),
    ).toEqual([
      'blank is empty.',
      'bold contains markup.',
      'entity contains markup.',
      'group.only has no "one" form, which its language needs.',
      'lonely has no "other" form, which its language needs.',
    ]);
  });

  it('allows the ampersand that marks a menu’s access key', () => {
    expect(checkEnglish({ file: '&File' })).toEqual([]);
  });
});

describe('checkTranslation', () => {
  it('passes a partial translation, which falls back to English', () => {
    expect(checkTranslation(ENGLISH, { title: 'Contas' }, 'pt')).toEqual([]);
  });

  it('finds keys English lacks, other placeholders, and markup', () => {
    expect(
      checkTranslation(
        ENGLISH,
        { extra: 'x', remove: 'Remover {{nome}}?', title: '<i>Contas</i>', group: { other: 'y' } },
        'pt',
      ),
    ).toEqual([
      'extra is not in English.',
      "remove has placeholders English's does not.",
      'title contains markup.',
      'group.other is not in English.',
    ]);
  });

  it('finds text, plurals and groups that change kind', () => {
    expect(
      checkTranslation(
        ENGLISH,
        { title: { a: 'b' }, unread: 'x', group: 'flat', remove_one: 'um' },
        'pt',
      ),
    ).toEqual([
      'title is a group here but a text in English.',
      'unread is a text here but a plural in English.',
      'group is a text here but a group in English.',
      'remove is a plural here but a text in English.',
    ]);
  });

  it('asks for every plural form the language needs, with English’s placeholders', () => {
    expect(
      checkTranslation(ENGLISH, { unread_one: '1 czat {{who}}', unread_other: '{{count}}' }, 'pl'),
    ).toEqual([
      'unread has no "few" form, which its language needs.',
      'unread has no "many" form, which its language needs.',
      "unread_one has placeholders English's does not.",
    ]);
  });
});

describe('checkCatalogFiles', () => {
  const files = (catalogs: Record<string, string>, committedType = 'type') => ({
    catalogs: new Map(Object.entries(catalogs)),
    committedType,
    expectedType: 'type',
  });

  it('passes valid catalogs with an up-to-date type', () => {
    const en = JSON.stringify(ENGLISH);
    expect(checkCatalogFiles(files({ 'en.json': en, 'pt.json': '{"title":"Contas"}' }))).toEqual(
      [],
    );
  });

  it('reports English that is missing, broken or not a catalog, and nothing else', () => {
    expect(checkCatalogFiles(files({}))).toEqual(['en.json is not valid JSON.']);
    expect(checkCatalogFiles(files({ 'en.json': '[1]' }))).toEqual([
      'en.json is not a catalog of nested strings.',
    ]);
    expect(checkCatalogFiles(files({ 'en.json': '{"a":{"b":2}}' }))).toEqual([
      'en.json is not a catalog of nested strings.',
    ]);
    expect(checkCatalogFiles(files({ 'en.json': 'null' }))).toEqual([
      'en.json is not a catalog of nested strings.',
    ]);
  });

  it('names each file with a problem, and a stale type', () => {
    const en = JSON.stringify({ ...ENGLISH, empty: '' });
    expect(
      checkCatalogFiles(
        files(
          {
            'en.json': en,
            'pt.json': '{"extra":"x"}',
            'de.json': '{',
            'not a tag.json': '{}',
          },
          'old type',
        ),
      ),
    ).toEqual([
      'en.json: empty is empty.',
      'The generated Messages type is out of date: run scripts/src/bin/i18n-types.ts.',
      'pt.json: extra is not in English.',
      'de.json is not valid JSON.',
      'not a tag.json is not named after a language tag.',
    ]);
  });
});
