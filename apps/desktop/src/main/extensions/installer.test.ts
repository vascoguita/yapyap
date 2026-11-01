import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readExtensionArchive, verifyArchive } from '@yapyap/extension-sign';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { en } from '../../shared/messages/en.ts';
import {
  signedArchive,
  testKey,
  testManifest,
  unsignedArchive,
  zipArchive,
  type TestKey,
} from '../../../test/extensions.ts';
import {
  commitInstall,
  prepareInstall,
  type ApprovableInstall,
  type PreparedInstall,
} from './installer.ts';
import { loadRecords, saveRecords, RECORDS_FILE } from './records.ts';

const AUTHOR = testKey();
const ANCHORS: ReadonlySet<string> = new Set();
const ID = 'org.example.hello';

function approvable(prepared: PreparedInstall): ApprovableInstall {
  if (!('archive' in prepared)) {
    throw new Error(`Expected an approvable install, got: ${prepared.decision.reason}`);
  }
  return prepared;
}

describe('prepareInstall and commitInstall', () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'yapyap-installer-'));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  function prepare(bytes: Uint8Array, developerMode = false): Promise<PreparedInstall> {
    return prepareInstall({ root, bytes, anchors: ANCHORS, developerMode });
  }

  async function install(key: TestKey, overrides = {}): Promise<ApprovableInstall> {
    const archive = signedArchive(key, testManifest(overrides));
    const prepared = approvable(await prepare(zipArchive(archive)));
    await commitInstall(root, prepared);
    return prepared;
  }

  it('writes nothing until the user approves', async () => {
    const prepared = await prepare(zipArchive(signedArchive(AUTHOR)));
    expect(prepared.decision.kind).toBe('consent');
    await expect(readdir(root)).resolves.toEqual([]);
  });

  it('rejects an archive it cannot read, without writing anything', async () => {
    await expect(prepare(new Uint8Array([1, 2, 3]))).resolves.toEqual({
      decision: { kind: 'rejected', reason: en.extensions.reason.unreadable },
    });
    await expect(readdir(root)).resolves.toEqual([]);
  });

  it('rejects an unsigned archive outside Developer Mode, without the archive', async () => {
    await expect(prepare(zipArchive(unsignedArchive()))).resolves.toEqual({
      decision: { kind: 'rejected', reason: en.extensions.reason.developerModeOnly },
    });
  });

  it('installs an approved extension with a manifest that still verifies, and records it', async () => {
    const prepared = await install(AUTHOR);
    const folder = join(root, ID, '1.0.0');
    await expect(readdir(folder)).resolves.toEqual(['main.js', 'manifest.json']);
    const reread = readExtensionArchive(
      zipArchive({
        manifest: JSON.parse(await readFile(join(folder, 'manifest.json'), 'utf8')) as Record<
          string,
          unknown
        >,
        files: new Map([['main.js', await readFile(join(folder, 'main.js'))]]),
      }),
    );
    expect(verifyArchive(reread)).toEqual({ valid: true, fingerprint: AUTHOR.fingerprint });
    await expect(loadRecords(root)).resolves.toEqual(
      new Map([
        [
          ID,
          {
            id: ID,
            version: '1.0.0',
            fingerprint: AUTHOR.fingerprint,
            firstParty: false,
            developer: false,
            capabilities: [...prepared.decision.request.capabilities],
            hosts: ['api.example.org'],
          },
        ],
      ]),
    );
  });

  it('uses the pinned key and grants on the next update, and prunes the old version', async () => {
    await install(AUTHOR);
    const update = await prepare(
      zipArchive(signedArchive(AUTHOR, testManifest({ version: '1.1.0', network: { hosts: [] } }))),
    );
    expect(update.decision.kind).toBe('approved');
    await commitInstall(root, approvable(update));
    await expect(readdir(join(root, ID))).resolves.toEqual(['1.1.0']);
    const records = await loadRecords(root);
    expect(records.get(ID)).toMatchObject({ version: '1.1.0', hosts: [] });
    const imposter = await prepare(
      zipArchive(signedArchive(testKey(), testManifest({ version: '1.2.0' }))),
    );
    expect(imposter.decision.kind).toBe('rejected');
  });

  it('keeps the grants the user took back and their settings across an update', async () => {
    await install(AUTHOR);
    const account = '6f1c2a5e-0b1d-4c8e-9a3f-2d4b6c8e0a1b';
    const before = await loadRecords(root);
    const record = before.get(ID);
    if (record === undefined) {
      throw new Error('Not installed.');
    }
    await saveRecords(
      root,
      new Map(before).set(ID, {
        ...record,
        revoked: ['network:api.example.org'],
        revokedIn: { [account]: ['composer:insert-draft'] },
        settings: { model: 'small' },
      }),
    );
    const update = await prepare(
      zipArchive(signedArchive(AUTHOR, testManifest({ version: '1.1.0' }))),
    );
    await commitInstall(root, approvable(update));
    expect((await loadRecords(root)).get(ID)).toMatchObject({
      version: '1.1.0',
      revoked: ['network:api.example.org'],
      revokedIn: { [account]: ['composer:insert-draft'] },
      settings: { model: 'small' },
    });
  });

  it('keeps other extensions’ records when installing another one', async () => {
    await install(AUTHOR);
    await install(testKey(), { id: 'org.example.other' });
    const records = await loadRecords(root);
    expect([...records.keys()]).toEqual([ID, 'org.example.other']);
    expect((await readdir(root)).sort()).toEqual([RECORDS_FILE, ID, 'org.example.other'].sort());
  });

  it('records an unsigned extension installed in Developer Mode as a developer extension', async () => {
    const prepared = approvable(await prepare(zipArchive(unsignedArchive()), true));
    await commitInstall(root, prepared);
    expect((await loadRecords(root)).get(ID)).toMatchObject({
      fingerprint: null,
      developer: true,
    });
  });

  it('leaves the records alone when the files cannot be written', async () => {
    await writeFile(join(root, ID), 'not a folder');
    const prepared = approvable(await prepare(zipArchive(signedArchive(AUTHOR))));
    await expect(commitInstall(root, prepared)).rejects.toThrow();
    await expect(readdir(root)).resolves.toEqual([ID]);
  });
});
