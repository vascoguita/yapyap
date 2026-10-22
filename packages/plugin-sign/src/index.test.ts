import { describe, expect, it } from 'vitest';
import * as library from './index.ts';

describe('the plugin-sign library', () => {
  it('exports what YapYap needs to verify and trust plugins', () => {
    expect(Object.keys(library).sort()).toEqual([
      'ARCHIVE_LIMITS',
      'FIRST_PARTY_PREFIX',
      'TRUST_ANCHORS',
      'anchorFingerprints',
      'decideTrust',
      'digestFiles',
      'fingerprint',
      'matchesIntegrity',
      'readPins',
      'readPluginArchive',
      'readPublicKey',
      'signingPayload',
      'verifyArchive',
      'verifyManifest',
      'writePins',
    ]);
  });
});
