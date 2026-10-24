import { readPluginArchive, type PluginArchive } from '@yapyap/plugin-sign';
import { decideInstall, type InstallDecision } from './decision.ts';
import type { InstallRequest } from './install-request.ts';
import { loadRecords, saveRecords, type PluginRecord } from './records.ts';
import { installFiles, pruneVersions } from './storage.ts';

const MANIFEST = 'manifest.json';

type Rejection = Extract<InstallDecision, { kind: 'rejected' }>;

/** A plugin the user may approve, held in memory until they do. */
export interface ApprovableInstall {
  readonly decision: Exclude<InstallDecision, Rejection>;
  readonly archive: PluginArchive;
}

/** A decision, with the archive only when there is something to approve. */
export type PreparedInstall = { readonly decision: Rejection } | ApprovableInstall;

export interface PrepareOptions {
  /** Where plugins are installed, such as `<userData>/plugins`. */
  readonly root: string;
  readonly bytes: Uint8Array;
  readonly anchors: ReadonlySet<string>;
  readonly developerMode: boolean;
}

/**
 * Reads and decides on an archive without writing anything, so a plugin the
 * user turns down, or one that fails a check, never reaches the disk.
 */
export async function prepareInstall(options: PrepareOptions): Promise<PreparedInstall> {
  let archive: PluginArchive;
  try {
    archive = readPluginArchive(options.bytes);
  } catch (error) {
    return { decision: { kind: 'rejected', reason: (error as Error).message } };
  }
  const decision = decideInstall({
    archive,
    records: await loadRecords(options.root),
    anchors: options.anchors,
    developerMode: options.developerMode,
  });
  return decision.kind === 'rejected' ? { decision } : { decision, archive };
}

/** Approving an install grants everything it asked for, and nothing it did not. */
/**
 * The record of an install. An update keeps the grants the user took back
 * (#94); hosts are the new version's own, so one it dropped is gone, and
 * one allowed only at run time is asked about again (#95).
 */
function recordOf(request: InstallRequest, previous: PluginRecord | undefined): PluginRecord {
  return {
    id: request.id,
    version: request.version,
    fingerprint: request.fingerprint ?? null,
    firstParty: request.firstParty,
    developer: request.developer,
    capabilities: [...request.capabilities],
    hosts: [...request.hosts],
    ...(previous?.revoked === undefined ? {} : { revoked: previous.revoked }),
    ...(previous?.revokedIn === undefined ? {} : { revokedIn: previous.revokedIn }),
  };
}

/**
 * Installs a plugin the user approved, or an update that needed no approval.
 * The files land before the record points at them, and older versions go
 * only after it does, so a failure at any step leaves a working install.
 */
export async function commitInstall(root: string, install: ApprovableInstall): Promise<string> {
  const { request } = install.decision;
  const manifest = new TextEncoder().encode(
    `${JSON.stringify(install.archive.manifest, null, 2)}\n`,
  );
  const files = new Map(install.archive.files).set(MANIFEST, manifest);
  const folder = await installFiles(root, request.id, request.version, files);
  const installed = await loadRecords(root);
  const records = new Map(installed).set(request.id, recordOf(request, installed.get(request.id)));
  await saveRecords(root, records);
  await pruneVersions(root, request.id, request.version);
  return folder;
}
