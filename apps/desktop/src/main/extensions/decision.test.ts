import type { ExtensionArchive } from '@yapyap/extension-sign';
import { describe, expect, it } from 'vitest';
import {
  signedArchive,
  testKey,
  testManifest,
  unsignedArchive,
  type TestManifest,
} from '../../../test/extensions.ts';
import { decideInstall } from './decision.ts';
import type { ExtensionRecord, ExtensionRecords } from './records.ts';

const AUTHOR = testKey();
const OTHER = testKey();
const YAPYAP = testKey();
const ANCHORS: ReadonlySet<string> = new Set([YAPYAP.fingerprint]);
const FIRST_PARTY_ID = 'org.guita.yapyap.hello';

function installed(overrides: Partial<ExtensionRecord> = {}): ExtensionRecords {
  const record: ExtensionRecord = {
    id: 'org.example.hello',
    version: '1.0.0',
    fingerprint: AUTHOR.fingerprint,
    firstParty: false,
    developer: false,
    capabilities: ['composer:insert-draft'],
    hosts: ['api.example.org'],
    ...overrides,
  };
  return new Map([[record.id, record]]);
}

function decide(
  archive: ExtensionArchive,
  records: ExtensionRecords = new Map(),
  developerMode = false,
) {
  return decideInstall({ archive, records, anchors: ANCHORS, developerMode });
}

function update(overrides: TestManifest): ExtensionArchive {
  return signedArchive(AUTHOR, testManifest({ version: '1.1.0', ...overrides }));
}

describe('decideInstall', () => {
  it('asks for consent to a new third-party extension, showing its key and requests', () => {
    expect(decide(signedArchive(AUTHOR))).toEqual({
      kind: 'consent',
      request: {
        id: 'org.example.hello',
        name: 'Hello',
        version: '1.0.0',
        author: { name: 'Example Author', url: 'https://example.org/' },
        fingerprint: AUTHOR.fingerprint,
        firstParty: false,
        developer: false,
        capabilities: ['composer:insert-draft'],
        hosts: ['api.example.org'],
      },
    });
  });

  it('rejects an invalid manifest before checking anything else', () => {
    const archive = signedArchive(AUTHOR, testManifest({ version: 'latest' }));
    expect(decide(archive)).toEqual({
      kind: 'rejected',
      reason:
        'manifest.json is not valid at /version: must match pattern "^(0|[1-9]\\d*)\\.(0|[1-9]\\d*)\\.(0|[1-9]\\d*)(?:-[0-9A-Za-z.-]+)?$".',
    });
  });

  it('rejects files that do not match the signature', () => {
    const archive = signedArchive(AUTHOR);
    const tampered = { ...archive, files: new Map([['main.js', Buffer.from('changed')]]) };
    expect(decide(tampered)).toMatchObject({ kind: 'rejected' });
  });

  it('lets an update that asks for nothing new through without asking', () => {
    expect(decide(update({}), installed())).toMatchObject({
      kind: 'approved',
      request: { version: '1.1.0', fingerprint: AUTHOR.fingerprint },
    });
  });

  it('lets an update that drops a capability through without asking', () => {
    expect(decide(update({ capabilities: [] }), installed())).toMatchObject({
      kind: 'approved',
    });
  });

  it('asks again about exactly the host an update adds', () => {
    const archive = update({ network: { hosts: ['api.example.org', 'cdn.example.org'] } });
    expect(decide(archive, installed())).toMatchObject({
      kind: 'reapprove',
      added: { capabilities: [], hosts: ['cdn.example.org'] },
      request: { hosts: ['api.example.org', 'cdn.example.org'] },
    });
  });

  it('rejects an update signed by a different key', () => {
    const archive = signedArchive(OTHER, testManifest({ version: '1.1.0' }));
    expect(decide(archive, installed())).toEqual({
      kind: 'rejected',
      reason: 'This update is signed by a different key than the installed extension.',
    });
  });

  it('asks for consent to a first-party extension signed by an embedded key', () => {
    const archive = signedArchive(YAPYAP, testManifest({ id: FIRST_PARTY_ID }));
    expect(decide(archive)).toMatchObject({
      kind: 'consent',
      request: { firstParty: true, fingerprint: YAPYAP.fingerprint },
    });
  });

  it('rejects a first-party name signed by anyone else', () => {
    const archive = signedArchive(AUTHOR, testManifest({ id: FIRST_PARTY_ID }));
    expect(decide(archive)).toEqual({
      kind: 'rejected',
      reason: 'Only YapYap can publish extensions under its own name.',
    });
  });

  it('diffs a first-party update against what the user granted', () => {
    const records = installed({
      id: FIRST_PARTY_ID,
      fingerprint: YAPYAP.fingerprint,
      firstParty: true,
    });
    const archive = signedArchive(YAPYAP, testManifest({ id: FIRST_PARTY_ID, version: '2.0.0' }));
    expect(decide(archive, records)).toMatchObject({
      kind: 'approved',
      request: { firstParty: true },
    });
  });

  describe('unsigned extensions', () => {
    it('are rejected outside Developer Mode', () => {
      expect(decide(unsignedArchive())).toEqual({
        kind: 'rejected',
        reason: 'Unsigned extensions install only in Developer Mode.',
      });
    });

    it('ask for consent in Developer Mode and are marked as developer extensions', () => {
      expect(decide(unsignedArchive(), new Map(), true)).toMatchObject({
        kind: 'consent',
        request: { fingerprint: undefined, developer: true, firstParty: false },
      });
    });

    it('never take a first-party name, even in Developer Mode', () => {
      const archive = unsignedArchive(testManifest({ id: FIRST_PARTY_ID }));
      expect(decide(archive, new Map(), true)).toEqual({
        kind: 'rejected',
        reason: 'Only YapYap can publish extensions under its own name.',
      });
    });

    it('cannot replace a signed extension, which would drop its pinned key', () => {
      expect(decide(unsignedArchive(), installed(), true)).toEqual({
        kind: 'rejected',
        reason: 'This update is not signed, but the installed extension is.',
      });
    });

    it('update an unsigned extension by diffing what the user granted', () => {
      const records = installed({ fingerprint: null, developer: true });
      const archive = unsignedArchive(testManifest({ capabilities: ['secrets:own'] }));
      expect(decide(archive, records, true)).toMatchObject({
        kind: 'reapprove',
        added: { capabilities: ['secrets:own'], hosts: [] },
      });
    });

    it('ask for consent from scratch when a signed version replaces them', () => {
      const records = installed({ fingerprint: null, developer: true });
      expect(decide(signedArchive(AUTHOR), records)).toMatchObject({
        kind: 'consent',
        request: { fingerprint: AUTHOR.fingerprint, developer: false },
      });
    });
  });
});
