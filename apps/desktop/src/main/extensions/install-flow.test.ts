import { describe, expect, it, vi } from 'vitest';
import type { InstallRequest } from './install-request.ts';
import { installExtension, trustOf } from './install-flow.ts';
import type { PreparedInstall } from './installer.ts';

const REQUEST: InstallRequest = {
  id: 'org.example.hello',
  name: 'Hello',
  version: '1.1.0',
  author: { name: 'Example', url: undefined },
  fingerprint: 'ab:cd',
  firstParty: false,
  developer: false,
  capabilities: ['composer:insert-draft', 'storage:local'],
  hosts: ['api.example.com'],
};

const archive = { manifest: {}, files: new Map() } as never;

function setup(prepared: PreparedInstall, answer = true) {
  const deps = {
    chooseArchive: vi.fn(() => Promise.resolve<string | undefined>('/tmp/hello.yapyap-extension')),
    readFile: vi.fn(() => Promise.resolve(new Uint8Array([1, 2]))),
    prepare: vi.fn(() => Promise.resolve(prepared)),
    commit: vi.fn(() => Promise.resolve('/extensions/org.example.hello/1.1.0')),
    ask: vi.fn(() => Promise.resolve(answer)),
    report: vi.fn(),
  };
  return { deps, run: () => installExtension(deps) };
}

describe('installExtension', () => {
  it('asks about a new extension, then installs it and says so', async () => {
    const prepared = { decision: { kind: 'consent', request: REQUEST }, archive } as const;
    const t = setup(prepared);
    await t.run();
    expect(t.deps.readFile).toHaveBeenCalledWith('/tmp/hello.yapyap-extension');
    expect(t.deps.prepare).toHaveBeenCalledWith(new Uint8Array([1, 2]));
    expect(t.deps.ask).toHaveBeenCalledWith({
      id: 'org.example.hello',
      name: 'Hello',
      version: '1.1.0',
      author: { name: 'Example', url: null },
      fingerprint: 'ab:cd',
      trust: 'third-party',
      source: null,
      update: false,
      capabilities: ['composer:insert-draft', 'storage:local'],
      hosts: ['api.example.com'],
      added: { capabilities: [], hosts: [] },
    });
    expect(t.deps.commit).toHaveBeenCalledWith(prepared);
    expect(t.deps.report).toHaveBeenCalledWith({
      kind: 'installed',
      name: 'Hello',
      version: '1.1.0',
    });
  });

  it('asks about an update only for what it adds, and installs nothing the user declines', async () => {
    const added = { capabilities: ['composer:insert-draft'], hosts: [] };
    const unsigned = {
      ...REQUEST,
      fingerprint: undefined,
      developer: true,
      author: { name: 'Me', url: 'https://me.example' },
    };
    const t = setup({ decision: { kind: 'reapprove', request: unsigned, added }, archive }, false);
    await t.run();
    expect(t.deps.ask).toHaveBeenCalledWith(
      expect.objectContaining({
        update: true,
        added,
        trust: 'developer',
        fingerprint: null,
        author: { name: 'Me', url: 'https://me.example' },
      }),
    );
    expect(t.deps.commit).not.toHaveBeenCalled();
    expect(t.deps.report).not.toHaveBeenCalled();
  });

  it('installs an update that asks for nothing new without asking', async () => {
    const t = setup({ decision: { kind: 'approved', request: REQUEST }, archive });
    await t.run();
    expect(t.deps.ask).not.toHaveBeenCalled();
    expect(t.deps.commit).toHaveBeenCalledOnce();
  });

  it('explains a rejected archive, and stops when the user picks none', async () => {
    const t = setup({ decision: { kind: 'rejected', reason: 'The signature does not match.' } });
    await t.run();
    expect(t.deps.report).toHaveBeenCalledWith({
      kind: 'rejected',
      reason: 'The signature does not match.',
    });
    t.deps.chooseArchive.mockResolvedValueOnce(undefined);
    await t.run();
    expect(t.deps.readFile).toHaveBeenCalledOnce();
  });

  it('reports a failure to read or install, without its details', async () => {
    const t = setup({ decision: { kind: 'approved', request: REQUEST }, archive });
    t.deps.commit.mockRejectedValueOnce(new Error('disk full'));
    await t.run();
    expect(t.deps.report).toHaveBeenCalledWith({ kind: 'failed' });
  });
});

describe('trustOf', () => {
  it('names who vouches for an extension', () => {
    expect(trustOf({ firstParty: true, developer: false })).toBe('first-party');
    expect(trustOf({ firstParty: false, developer: false })).toBe('third-party');
    expect(trustOf({ firstParty: false, developer: true })).toBe('developer');
  });
});
