import type { Manifest } from '@yapyap/extension-sdk';
import { describe, expect, it } from 'vitest';
import { FAKE_FINGERPRINT } from '../../../test/extensions.ts';
import { testManifest } from '../../../test/extensions.ts';
import { installRequest } from './install-request.ts';

function manifest(overrides: Record<string, unknown> = {}): Manifest {
  return testManifest(overrides) as Manifest;
}

describe('installRequest', () => {
  it('shows the author, key, capabilities and hosts, sorted', () => {
    const request = installRequest(
      manifest({
        capabilities: ['storage:local', 'composer:insert-draft'],
        network: { hosts: ['b.example.org', 'a.example.org'] },
      }),
      { kind: 'signed', fingerprint: FAKE_FINGERPRINT, firstParty: false },
    );
    expect(request).toEqual({
      id: 'org.example.hello',
      name: 'Hello',
      version: '1.0.0',
      author: { name: 'Example Author', url: 'https://example.org/' },
      fingerprint: FAKE_FINGERPRINT,
      firstParty: false,
      developer: false,
      capabilities: ['composer:insert-draft', 'storage:local'],
      hosts: ['a.example.org', 'b.example.org'],
    });
  });

  it('marks an extension signed by YapYap as first-party', () => {
    const request = installRequest(manifest(), {
      kind: 'signed',
      fingerprint: FAKE_FINGERPRINT,
      firstParty: true,
    });
    expect(request).toMatchObject({ firstParty: true, developer: false });
  });

  it('marks an unsigned extension as a developer extension with no key', () => {
    const request = installRequest(manifest({ author: { name: 'Me' }, network: undefined }), {
      kind: 'unsigned',
    });
    expect(request).toMatchObject({
      author: { name: 'Me', url: undefined },
      fingerprint: undefined,
      firstParty: false,
      developer: true,
      hosts: [],
    });
  });
});
