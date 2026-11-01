import type { MarketplaceIndex } from '@yapyap/extension-sdk';
import { describe, expect, it } from 'vitest';
import { FAKE_FINGERPRINT } from '../../../test/extensions.ts';
import type { ExtensionRecord } from '../extensions/records.ts';
import { pulledExtensions } from './revocations.ts';

const OTHER = Array.from({ length: 32 }, () => 'cd').join(':');

const record = (id: string, extra: Partial<ExtensionRecord> = {}): ExtensionRecord => ({
  id,
  version: '1.0.0',
  fingerprint: FAKE_FINGERPRINT,
  firstParty: false,
  developer: false,
  capabilities: [],
  hosts: [],
  ...extra,
});

const index = (revoked: MarketplaceIndex['revoked']): MarketplaceIndex => ({
  format: 1,
  serial: 1,
  generated: '2026-10-27T08:00:00.000Z',
  expires: '2026-11-20T08:00:00.000Z',
  extensions: [],
  revoked,
});

describe('pulledExtensions', () => {
  it('finds installed copies of pulled versions signed by the same key', () => {
    const records = new Map([
      ['org.example.all', record('org.example.all')],
      ['org.example.some', record('org.example.some', { version: '1.1.0' })],
      ['org.example.kept', record('org.example.kept')],
      ['org.example.borrowed', record('org.example.borrowed', { fingerprint: OTHER })],
      [
        'org.example.unsigned',
        record('org.example.unsigned', { fingerprint: null, developer: true }),
      ],
      ['org.example.marked', record('org.example.marked', { pulled: 'Old news.' })],
    ]);
    const pulled = pulledExtensions(
      index([
        {
          id: 'org.example.all',
          versions: '*',
          signer: FAKE_FINGERPRINT,
          reason: 'Sent chats away.',
        },
        {
          id: 'org.example.some',
          versions: ['1.1.0'],
          signer: FAKE_FINGERPRINT,
          reason: 'Crashes.',
        },
        { id: 'org.example.kept', versions: ['2.0.0'], signer: FAKE_FINGERPRINT, reason: 'Later.' },
        {
          id: 'org.example.borrowed',
          versions: '*',
          signer: FAKE_FINGERPRINT,
          reason: 'Not theirs.',
        },
        { id: 'org.example.unsigned', versions: '*', signer: FAKE_FINGERPRINT, reason: 'No key.' },
        { id: 'org.example.marked', versions: '*', signer: FAKE_FINGERPRINT, reason: 'Again.' },
      ]),
      records,
    );
    expect(pulled).toEqual([
      { id: 'org.example.all', reason: 'Sent chats away.' },
      { id: 'org.example.some', reason: 'Crashes.' },
    ]);
  });
});
