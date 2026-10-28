import { describe, expect, it } from 'vitest';
import * as library from './index.ts';

describe('the extension-sign library', () => {
  it('exports what YapYap needs to verify and trust extensions', () => {
    expect(Object.keys(library).sort()).toEqual([
      'ARCHIVE_LIMITS',
      'FIRST_PARTY_PREFIX',
      'TRUST_ANCHORS',
      'anchorFingerprints',
      'compareCodeUnits',
      'decideTrust',
      'digestFiles',
      'fingerprint',
      'matchesIntegrity',
      'readExtensionArchive',
      'readPins',
      'readPublicKey',
      'signIndex',
      'signingPayload',
      'verifyArchive',
      'verifyIndex',
      'verifyManifest',
      'writePins',
    ]);
  });
});
