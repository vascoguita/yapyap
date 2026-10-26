import { describe, expect, it } from 'vitest';
import { catalogType } from './types.ts';

describe('catalogType', () => {
  it('types text as strings, and placeholders and plurals as functions of named values', () => {
    const type = catalogType({
      title: 'Accounts',
      remove: 'Remove {{name}} from {{place}}?',
      unread_one: '1 unread chat in {{account}}',
      unread_other: '{{count}} unread chats in {{account}}',
      'load-failed': { label: 'Label' },
    });
    expect(type).toContain('// Generated from locales/en.json by scripts/src/bin/i18n-types.ts;');
    expect(type).toContain(
      'export interface Messages { readonly title: string; ' +
        'readonly remove: (params: { readonly name: string | number; readonly place: string | number; }) => string; ' +
        'readonly unread: (params: { readonly account: string | number; readonly count: number; }) => string; ' +
        'readonly "load-failed": { readonly label: string; }; }',
    );
  });
});
