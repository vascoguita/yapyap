import type { Manifest } from '@yapyap/plugin-sdk';
import { describe, expect, it } from 'vitest';
import { testManifest } from '../../../test/plugins.ts';
import { installRequest } from './install-request.ts';

const FINGERPRINT = Array.from({ length: 32 }, () => 'ab').join(':');

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
      { kind: 'signed', fingerprint: FINGERPRINT, firstParty: false },
    );
    expect(request).toEqual({
      id: 'org.example.hello',
      name: 'Hello',
      version: '1.0.0',
      author: { name: 'Example Author', url: 'https://example.org/' },
      fingerprint: FINGERPRINT,
      firstParty: false,
      developer: false,
      capabilities: ['composer:insert-draft', 'storage:local'],
      hosts: ['a.example.org', 'b.example.org'],
    });
  });

  it('marks a plugin signed by YapYap as first-party', () => {
    const request = installRequest(manifest(), {
      kind: 'signed',
      fingerprint: FINGERPRINT,
      firstParty: true,
    });
    expect(request).toMatchObject({ firstParty: true, developer: false });
  });

  it('marks an unsigned plugin as a developer plugin with no key', () => {
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
