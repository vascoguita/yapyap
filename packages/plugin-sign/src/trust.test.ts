import { createPublicKey, generateKeyPairSync } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { TRUST_ANCHORS } from './anchors.ts';
import { fingerprint } from './keys.ts';
import { anchorFingerprints, decideTrust, FIRST_PARTY_PREFIX } from './trust.ts';

// Throwaway keys per test run, kept in memory only (ADR 0005).
const keyPair = () => generateKeyPairSync('ed25519');
const anchorKey = keyPair();
const ANCHOR_PEM = anchorKey.publicKey.export({ format: 'pem', type: 'spki' });
const ANCHORS = anchorFingerprints([ANCHOR_PEM]);
const ANCHOR = fingerprint(createPublicKey(ANCHOR_PEM));
const AUTHOR = fingerprint(keyPair().publicKey);
const OTHER = fingerprint(keyPair().publicKey);

const valid = (key: string) => ({ valid: true as const, fingerprint: key });

describe('anchorFingerprints', () => {
  it('reads the embedded anchor', () => {
    expect([...anchorFingerprints(TRUST_ANCHORS)]).toEqual([
      expect.stringMatching(/^[0-9a-f]{2}(?::[0-9a-f]{2}){31}$/) as unknown,
    ]);
    expect(ANCHORS.has(ANCHOR)).toBe(true);
  });

  it('refuses an anchor that is not Ed25519', () => {
    const ed448 = generateKeyPairSync('ed448').publicKey.export({ format: 'pem', type: 'spki' });
    expect(() => anchorFingerprints([ed448])).toThrow(
      'A trust anchor is not an Ed25519 public key.',
    );
  });
});

describe('decideTrust', () => {
  const firstParty = `${FIRST_PARTY_PREFIX}assistant`;

  it('rejects a plugin whose signature does not verify', () => {
    expect(
      decideTrust({
        pluginId: 'org.example.hello',
        verification: { valid: false, reason: 'The plugin is not signed.' },
        anchors: ANCHORS,
        pinned: undefined,
      }),
    ).toEqual({ kind: 'rejected', reason: 'The plugin is not signed.' });
  });

  it('trusts a first-party plugin signed by an anchor', () => {
    expect(
      decideTrust({
        pluginId: firstParty,
        verification: valid(ANCHOR),
        anchors: ANCHORS,
        pinned: undefined,
      }),
    ).toEqual({ kind: 'trusted', fingerprint: ANCHOR, firstParty: true });
  });

  it('rejects anyone else publishing under the first-party name, even with a pin', () => {
    expect(
      decideTrust({
        pluginId: firstParty,
        verification: valid(AUTHOR),
        anchors: ANCHORS,
        pinned: AUTHOR,
      }),
    ).toEqual({ kind: 'rejected', reason: 'Only YapYap can publish plugins under its own name.' });
  });

  it('asks before trusting a new third-party key', () => {
    expect(
      decideTrust({
        pluginId: 'org.example.hello',
        verification: valid(AUTHOR),
        anchors: ANCHORS,
        pinned: undefined,
      }),
    ).toEqual({ kind: 'consent', fingerprint: AUTHOR });
  });

  it('trusts an update signed by the pinned key', () => {
    expect(
      decideTrust({
        pluginId: 'org.example.hello',
        verification: valid(AUTHOR),
        anchors: ANCHORS,
        pinned: AUTHOR,
      }),
    ).toEqual({ kind: 'trusted', fingerprint: AUTHOR, firstParty: false });
  });

  it('rejects an update signed by a different key', () => {
    expect(
      decideTrust({
        pluginId: 'org.example.hello',
        verification: valid(OTHER),
        anchors: ANCHORS,
        pinned: AUTHOR,
      }),
    ).toEqual({
      kind: 'rejected',
      reason: 'This update is signed by a different key than the installed plugin.',
    });
  });

  it('treats a third-party plugin signed by an anchor like any other author', () => {
    expect(
      decideTrust({
        pluginId: 'org.example.hello',
        verification: valid(ANCHOR),
        anchors: ANCHORS,
        pinned: undefined,
      }),
    ).toEqual({ kind: 'consent', fingerprint: ANCHOR });
  });
});
