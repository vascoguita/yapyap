import { describe, expect, it } from 'vitest';
import * as library from './index.ts';

describe('the plugin-sign library', () => {
  it('exports what YapYap needs to verify and trust plugins', () => {
    expect(Object.keys(library).sort()).toEqual([
      'FIRST_PARTY_PREFIX',
      'TRUST_ANCHORS',
      'anchorFingerprints',
      'decideTrust',
      'digestFiles',
      'fingerprint',
      'matchesIntegrity',
      'readPins',
      'readPublicKey',
      'signingPayload',
      'verifyManifest',
      'writePins',
    ]);
  });
});
