import { describe, expect, it, vi } from 'vitest';
import { buildCatalog, placeholders, pluralKey, type CatalogJson } from './catalog.ts';

const ENGLISH: CatalogJson = {
  title: 'Accounts',
  remove: 'Remove {{name}}?',
  unread_one: '1 unread chat',
  unread_other: '{{count}} unread chats',
  group: { label: 'Label', of: '{{received}} of {{total}}' },
};

interface Built {
  readonly title: string;
  readonly remove: (params: { readonly name: string }) => string;
  readonly unread: (params: { readonly count: number }) => string;
  readonly group: {
    readonly label: string;
    readonly of: (params: { readonly received: string; readonly total: string }) => string;
  };
}

const build = (translation: CatalogJson, locale: string): Built =>
  buildCatalog(ENGLISH, translation, locale) as Built;

describe('placeholders', () => {
  it('names each placeholder once, sorted', () => {
    expect(placeholders('{{b}} and {{a}}, then {{b}}')).toEqual(['a', 'b']);
    expect(placeholders('no values')).toEqual([]);
  });
});

describe('pluralKey', () => {
  it('splits a CLDR suffix off a key', () => {
    expect(pluralKey('unread_few')).toEqual({ base: 'unread', form: 'few' });
    expect(pluralKey('unread')).toEqual({ base: 'unread', form: undefined });
    expect(pluralKey('read_more')).toEqual({ base: 'read_more', form: undefined });
  });
});

describe('buildCatalog', () => {
  it('shapes English as the app reads it', () => {
    const en = build(ENGLISH, 'en');
    expect(en.title).toBe('Accounts');
    expect(en.remove({ name: 'Work' })).toBe('Remove Work?');
    expect(en.unread({ count: 1 })).toBe('1 unread chat');
    expect(en.unread({ count: 1500 })).toBe('1,500 unread chats');
    expect(en.group.label).toBe('Label');
    expect(en.group.of({ received: '1 MB', total: '2 MB' })).toBe('1 MB of 2 MB');
  });

  it('inserts values as text, never reading them for placeholders', () => {
    const en = build(ENGLISH, 'en');
    expect(en.remove({ name: '{{name}} <b>' })).toBe('Remove {{name}} <b>?');
    expect((en.remove as (params: object) => string)({})).toBe('Remove {{name}}?');
  });

  it('uses a translation, and English for every key it lacks or gets wrong', () => {
    const pt = build(
      {
        title: 'Contas',
        remove: 'Remover {{nome}}?',
        group: { label: 'Rótulo' },
        extra: 'not in English',
      },
      'pt',
    );
    expect(pt.title).toBe('Contas');
    expect(pt.remove({ name: 'Work' })).toBe('Remove Work?');
    expect(pt.group.label).toBe('Rótulo');
    expect(pt.group.of({ received: '1', total: '2' })).toBe('1 of 2');
    expect(pt).not.toHaveProperty('extra');
  });

  it('falls back to English for a group the translation made a string, or the reverse', () => {
    const odd = build({ group: 'flat', title: { nested: 'x' } }, 'pt');
    expect(odd.group.label).toBe('Label');
    expect(odd.title).toBe('Accounts');
  });

  it('chooses plural forms by the language’s own rules and numbers', () => {
    const pl = build(
      {
        unread_one: '1 nieprzeczytany czat',
        unread_few: '{{count}} nieprzeczytane czaty',
        unread_many: '{{count}} nieprzeczytanych czatów',
        unread_other: '{{count}} czatu',
      },
      'pl',
    );
    expect(pl.unread({ count: 1 })).toBe('1 nieprzeczytany czat');
    expect(pl.unread({ count: 3 })).toBe('3 nieprzeczytane czaty');
    expect(pl.unread({ count: 5 })).toBe('5 nieprzeczytanych czatów');
    expect(pl.unread({ count: 1.5 })).toBe('1,5 czatu');
    expect(pl.unread({ count: 1500 })).toBe('1500 nieprzeczytanych czatów');
  });

  it('keeps English plurals when a translation misses a form its language needs', () => {
    const pl = build({ unread_one: 'jeden', unread_other: '{{count}} czatów' }, 'pl');
    expect(pl.unread({ count: 5 })).toBe('5 unread chats');
  });

  it('keeps English plurals when a form changes the placeholders', () => {
    const pt = build({ unread_one: '1 de {{who}}', unread_other: '{{count}} conversas' }, 'pt');
    expect(pt.unread({ count: 1 })).toBe('1 unread chat');
  });

  it('falls back to the other form, and to nothing, when a count has no form', () => {
    const only = buildCatalog({ n_other: '{{count}} items' }, {}, 'en') as {
      n: (params: { count: number }) => string;
    };
    expect(only.n({ count: 1 })).toBe('1 items');
    const none = buildCatalog({ n_one: 'one item' }, {}, 'en') as {
      n: (params: object) => string;
    };
    expect(none.n({})).toBe('');
  });

  it('makes number and plural rules only when a message first needs them', () => {
    const plurals = vi.spyOn(Intl, 'PluralRules');
    const numbers = vi.spyOn(Intl, 'NumberFormat');
    // As YapYap builds English: the catalog is its own translation.
    const built = build(ENGLISH, 'en');
    expect(plurals).not.toHaveBeenCalled();
    expect(numbers).not.toHaveBeenCalled();
    expect(built.unread({ count: 2 })).toBe('2 unread chats');
    expect(built.unread({ count: 1 })).toBe('1 unread chat');
    // One set of rules for the language, however often its messages are used.
    expect(plurals).toHaveBeenCalledOnce();
    expect(numbers).toHaveBeenCalledOnce();
    plurals.mockRestore();
    numbers.mockRestore();
  });
});
