import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadRecords, saveRecords, type ExtensionRecord } from './records.ts';
import { removeExtension } from './removal.ts';

const record = (id: string): ExtensionRecord => ({
  id,
  version: '1.0.0',
  fingerprint: null,
  firstParty: false,
  developer: true,
  capabilities: ['storage:local'],
  hosts: [],
});

let root = '';

async function install(id: string, name?: string): Promise<void> {
  const folder = join(root, id, '1.0.0');
  await mkdir(folder, { recursive: true });
  if (name !== undefined) {
    const manifest = {
      id,
      name,
      version: '1.0.0',
      author: { name: 'Example' },
      apiVersion: '1.0.0',
      entry: 'main.js',
      capabilities: [],
    };
    await writeFile(join(folder, 'manifest.json'), JSON.stringify(manifest));
  }
}

function setup(confirmed = true) {
  const order: string[] = [];
  const deps = {
    root,
    readFile: (path: string) => import('node:fs/promises').then(({ readFile }) => readFile(path)),
    confirmRemove: vi.fn((name: string) => {
      order.push(`confirm ${name}`);
      return Promise.resolve(confirmed);
    }),
    forgetData: vi.fn((id: string) => {
      order.push(`forget data ${id}`);
      return Promise.resolve();
    }),
  };
  const runtime = {
    forget: vi.fn(async (id: string) => {
      order.push(`stop ${id}`);
      // Another extension's grant, changed while the dialog was open, must survive.
      const records = new Map(await loadRecords(root));
      records.set('org.example.other', { ...record('org.example.other'), hosts: ['a.example'] });
      await saveRecords(root, records);
    }),
  };
  return { deps, runtime, order };
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'yapyap-removal-'));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe('removeExtension', () => {
  it('stops the extension, then deletes its record, its files and its data, and nothing else', async () => {
    await install('org.example.hello', 'Hello');
    await install('org.example.other', 'Other');
    await saveRecords(
      root,
      new Map([
        ['org.example.hello', record('org.example.hello')],
        ['org.example.other', record('org.example.other')],
      ]),
    );
    const t = setup();
    await expect(removeExtension(t.deps, t.runtime, 'org.example.hello')).resolves.toBe(true);
    expect(t.order).toEqual([
      'confirm Hello',
      'stop org.example.hello',
      'forget data org.example.hello',
    ]);
    const left = await loadRecords(root);
    expect([...left.keys()]).toEqual(['org.example.other']);
    expect(left.get('org.example.other')?.hosts).toEqual(['a.example']);
    expect((await readdir(root)).toSorted()).toEqual(['.extensions.json', 'org.example.other']);
  });

  it('names an extension without a readable manifest by its ID', async () => {
    await install('org.example.hello');
    await saveRecords(root, new Map([['org.example.hello', record('org.example.hello')]]));
    const t = setup();
    await removeExtension(t.deps, t.runtime, 'org.example.hello');
    expect(t.deps.confirmRemove).toHaveBeenCalledExactlyOnceWith('org.example.hello');
  });

  it('keeps everything when the user cancels, or the extension is not installed', async () => {
    await install('org.example.hello', 'Hello');
    await saveRecords(root, new Map([['org.example.hello', record('org.example.hello')]]));
    const t = setup(false);
    await expect(removeExtension(t.deps, t.runtime, 'org.example.hello')).resolves.toBe(false);
    await expect(removeExtension(t.deps, t.runtime, 'org.example.missing')).resolves.toBe(false);
    expect(t.deps.confirmRemove).toHaveBeenCalledOnce();
    expect(t.runtime.forget).not.toHaveBeenCalled();
    expect(t.deps.forgetData).not.toHaveBeenCalled();
    expect([...(await loadRecords(root)).keys()]).toEqual(['org.example.hello']);
    expect(await readdir(join(root, 'org.example.hello', '1.0.0'))).toEqual(['manifest.json']);
  });
});
