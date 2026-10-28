import { generateKeyPairSync } from 'node:crypto';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { strFromU8, unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { runCli } from './cli.ts';

// A throwaway key per test run, kept in memory only (ADR 0005): the CLI reads
// it through `readFile`, so it is never written to disk.
const PEM = generateKeyPairSync('ed25519').privateKey.export({ format: 'pem', type: 'pkcs8' });

function extension(): string {
  const root = mkdtempSync(join(tmpdir(), 'yapyap-extension-'));
  writeFileSync(join(root, 'manifest.json'), '{"id":"org.example.hello"}');
  writeFileSync(join(root, 'main.js'), 'export {};');
  return root;
}

function run(...args: string[]) {
  const out: string[] = [];
  const err: string[] = [];
  const written = new Map<string, Uint8Array>();
  const code = runCli(args, {
    writeFile: (path, bytes) => {
      written.set(path, bytes);
    },
    readFile: (path) => {
      if (path !== 'key.pem') {
        throw new Error(`ENOENT: no such file, open '${path}'`);
      }
      return PEM;
    },
    out: (line) => out.push(line),
    err: (line) => err.push(line),
  });
  return { code, out, err, written };
}

describe('runCli', () => {
  it('signs and verifies an extension folder, naming the key only by fingerprint', () => {
    const root = extension();
    const signed = run('sign', '--key', 'key.pem', root);
    expect(signed.code).toBe(0);
    expect(signed.out).toEqual([
      expect.stringMatching(/^Signed .+ with key [0-9a-f]{2}(?::[0-9a-f]{2}){31}$/) as unknown,
    ]);
    const verified = run('verify', root);
    expect(verified).toMatchObject({
      code: 0,
      out: [expect.stringMatching(/^Valid signature by key [0-9a-f:]{95}$/) as unknown],
      err: [],
    });
    expect([...signed.out, ...signed.err, ...verified.out].join('\n')).not.toContain(
      PEM.split('\n')[1],
    );
  });

  it('exits 1 with the reason for an unsigned extension', () => {
    expect(run('verify', extension())).toMatchObject({
      code: 1,
      out: [],
      err: ['Invalid: The extension is not signed.'],
    });
  });

  it('packs a signed extension into an archive that holds its manifest and files', () => {
    const root = extension();
    run('sign', '--key', 'key.pem', root);
    const packed = run('pack', root, 'hello.yapyap-extension');
    expect(packed).toMatchObject({ code: 0, out: [`Packed ${root} into hello.yapyap-extension`] });
    const files = unzipSync(packed.written.get('hello.yapyap-extension') ?? new Uint8Array());
    expect(Object.keys(files).sort()).toEqual(['main.js', 'manifest.json']);
    expect(strFromU8(files['manifest.json'] ?? new Uint8Array())).toContain('"signature"');
  });

  it('refuses to pack an extension whose signature does not verify', () => {
    const packed = run('pack', extension(), 'hello.yapyap-extension');
    expect(packed).toMatchObject({
      code: 1,
      err: ["The extension's signature does not verify: The extension is not signed."],
    });
    expect(packed.written.size).toBe(0);
  });

  it('exits 1 with the error, never the key, when signing fails', () => {
    expect(run('sign', '--key', 'missing.pem', extension())).toMatchObject({
      code: 1,
      out: [],
      err: ["ENOENT: no such file, open 'missing.pem'"],
    });
  });

  it('reports a thrown value that is not an Error', () => {
    const code = runCli(['sign', '--key', 'key.pem', extension()], {
      readFile: () => {
        throw 'boom' as unknown as Error;
      },
      writeFile: () => undefined,
      out: () => undefined,
      err: (line) => {
        expect(line).toBe('Unexpected error.');
      },
    });
    expect(code).toBe(1);
  });

  it('explains every command', () => {
    expect(run().err).toEqual([
      'Usage:\n  yapyap-extension-sign sign --key <private-key.pem> <extension-folder>\n  yapyap-extension-sign verify <extension-folder>\n  yapyap-extension-sign pack <extension-folder> <archive.yapyap-extension>',
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
    [['pack']],
    [['pack', 'dir']],
    [['pack', 'dir', 'out', 'extra']],
  ])('prints usage and exits 2 for %j', (args) => {
    const result = run(...args);
    expect(result.code).toBe(2);
    expect(result.err[0]).toMatch(/^Usage:\n {2}yapyap-extension-sign sign --key/);
  });
});
