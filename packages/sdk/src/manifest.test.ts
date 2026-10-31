import { Value } from 'typebox/value';
import { describe, expect, it } from 'vitest';
import { CAPABILITIES, ManifestSchema, type Manifest } from './manifest.ts';

const VALID: Manifest = {
  id: 'org.example.translate',
  name: 'Translate',
  version: '1.2.0',
  description: 'Translates drafts.',
  author: { name: 'Example', url: 'https://example.org' },
  apiVersion: '^1.0.0',
  entry: 'dist/main.js',
  capabilities: ['chat:read-active', 'composer:insert-draft'],
  network: { hosts: ['api.example.org'] },
  contributes: {
    commands: [{ id: 'translate', title: 'Translate draft' }],
    composerActions: [{ title: 'Translate', command: 'translate' }],
    contextMenu: [{ title: 'Translate message', command: 'translate', on: 'message' }],
    settings: { type: 'object', properties: { language: { type: 'string' } } },
    panel: { title: 'Translations', entry: 'panel.mjs' },
  },
  signature: { publicKey: 'MCowBQYDK2VwAyEA', algorithm: 'ed25519', value: 'c2ln' },
};

const MINIMAL = {
  id: 'org.example.hello',
  name: 'Hello',
  version: '0.1.0',
  author: { name: 'Example' },
  apiVersion: '1.0.0',
  entry: 'main.js',
  capabilities: [],
};

const check = (manifest: unknown): boolean => Value.Check(ManifestSchema, manifest);

describe('ManifestSchema', () => {
  it('accepts a full manifest and a minimal one', () => {
    expect(check(VALID)).toBe(true);
    expect(check(MINIMAL)).toBe(true);
  });

  it('lists the capabilities of ADR 0004, without any way to send messages', () => {
    expect(CAPABILITIES).toEqual([
      'chat:read-active',
      'chat:read-unread-summary',
      'composer:insert-draft',
      'composer:read-draft',
      'notifications:show',
      'storage:local',
      'secrets:own',
      'local-network',
      'assistant:bar',
      'calls:record',
      'local-model',
    ]);
    expect(CAPABILITIES.some((capability) => capability.includes('send'))).toBe(false);
    const listed = JSON.parse(JSON.stringify(ManifestSchema.properties.capabilities.items)) as {
      anyOf: { const: string }[];
    };
    expect(listed.anyOf.map((literal) => literal.const)).toEqual([...CAPABILITIES]);
  });

  it.each([
    ['an id that is not reverse DNS', { id: 'hello' }],
    ['an upper-case id', { id: 'Org.Example.Hello' }],
    ['a version that is not semver', { version: '1.0' }],
    ['an API range it cannot read', { apiVersion: '>=1.0.0' }],
    ['an entry outside the extension', { entry: '../main.js' }],
    ['an absolute entry', { entry: '/main.js' }],
    ['an entry that is not a script', { entry: 'main.html' }],
    ['an unknown capability', { capabilities: ['chat:send'] }],
    ['a repeated capability', { capabilities: ['storage:local', 'storage:local'] }],
    ['an author page over plain HTTP', { author: { name: 'Example', url: 'http://example.org' } }],
    ['a host with a scheme', { network: { hosts: ['https://api.example.org'] } }],
    ['a host with a port', { network: { hosts: ['api.example.org:8443'] } }],
    ['an IP address for a host', { network: { hosts: ['127.0.0.1'] } }],
    [
      'another signature algorithm',
      { signature: { publicKey: 'a', algorithm: 'rsa', value: 'b' } },
    ],
    ['an unknown field', { scripts: { postinstall: 'curl …' } }],
    [
      'a context menu on something else',
      {
        contributes: { contextMenu: [{ title: 'x', command: 'x', on: 'composer' }] },
      },
    ],
  ])('rejects %s', (_, change) => {
    expect(check({ ...MINIMAL, ...change })).toBe(false);
  });

  it.each(['id', 'name', 'version', 'author', 'apiVersion', 'entry', 'capabilities'])(
    'requires %s',
    (field) => {
      const manifest = Object.fromEntries(Object.entries(MINIMAL).filter(([key]) => key !== field));
      expect(check(manifest)).toBe(false);
    },
  );
});
