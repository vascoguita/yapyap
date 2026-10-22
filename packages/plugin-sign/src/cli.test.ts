import { generateKeyPairSync } from 'node:crypto';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { runCli } from './cli.ts';

// A throwaway key per test run, kept in memory only (ADR 0005): the CLI reads
// it through `readFile`, so it is never written to disk.
const PEM = generateKeyPairSync('ed25519').privateKey.export({ format: 'pem', type: 'pkcs8' });

function plugin(): string {
  const root = mkdtempSync(join(tmpdir(), 'yapyap-plugin-'));
  writeFileSync(join(root, 'manifest.json'), '{"id":"org.example.hello"}');
  writeFileSync(join(root, 'main.js'), 'export {};');
  return root;
}

function run(...args: string[]) {
  const out: string[] = [];
  const err: string[] = [];
  const code = runCli(args, {
    readFile: (path) => {
      if (path !== 'key.pem') {
        throw new Error(`ENOENT: no such file, open '${path}'`);
      }
      return PEM;
    },
    out: (line) => out.push(line),
    err: (line) => err.push(line),
  });
  return { code, out, err };
}

describe('runCli', () => {
  it('signs and verifies a plugin folder, naming the key only by fingerprint', () => {
    const root = plugin();
    const signed = run('sign', '--key', 'key.pem', root);
    expect(signed.code).toBe(0);
    expect(signed.out).toEqual([
      expect.stringMatching(/^Signed .+ with key [0-9a-f]{2}(?::[0-9a-f]{2}){31}$/) as unknown,
    ]);
    const verified = run('verify', root);
    expect(verified).toEqual({
      code: 0,
      out: [expect.stringMatching(/^Valid signature by key [0-9a-f:]{95}$/) as unknown],
      err: [],
    });
    expect([...signed.out, ...signed.err, ...verified.out].join('\n')).not.toContain(
      PEM.split('\n')[1],
    );
  });

  it('exits 1 with the reason for an unsigned plugin', () => {
    expect(run('verify', plugin())).toEqual({
      code: 1,
      out: [],
      err: ['Invalid: The plugin is not signed.'],
    });
  });

  it('exits 1 with the error, never the key, when signing fails', () => {
    expect(run('sign', '--key', 'missing.pem', plugin())).toEqual({
      code: 1,
      out: [],
      err: ["ENOENT: no such file, open 'missing.pem'"],
    });
  });

  it('reports a thrown value that is not an Error', () => {
    const code = runCli(['sign', '--key', 'key.pem', plugin()], {
      readFile: () => {
        throw 'boom' as unknown as Error;
      },
      out: () => undefined,
      err: (line) => {
        expect(line).toBe('Unexpected error.');
      },
    });
    expect(code).toBe(1);
  });

  it('explains both commands', () => {
    expect(run().err).toEqual([
      'Usage:\n  yapyap-plugin-sign sign --key <private-key.pem> <plugin-folder>\n  yapyap-plugin-sign verify <plugin-folder>',
    ]);
  });

  it.each([
    [[]],
    [['help']],
    [['help', 'folder']],
    [['sign']],
    [['sign', '--key']],
    [['sign', '--key', 'key.pem']],
    [['sign', '--keys', 'key.pem', 'dir']],
    [['sign', '--key', 'key.pem', 'dir', 'extra']],
    [['verify']],
    [['verify', 'a', 'b']],
  ])('prints usage and exits 2 for %j', (args) => {
    const result = run(...args);
    expect(result.code).toBe(2);
    expect(result.err[0]).toMatch(/^Usage:\n {2}yapyap-plugin-sign sign --key/);
  });
});
