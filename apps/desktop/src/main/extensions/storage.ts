import { randomUUID } from 'node:crypto';
import { lstat, mkdir, mkdtemp, readdir, realpath, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';

/** The files to install, by `/`-separated path relative to the extension's folder. */
export type ExtensionFiles = ReadonlyMap<string, Uint8Array>;

/**
 * Compares resolved paths rather than using `relative`, which on Windows
 * returns an absolute path for another drive instead of one with `..`.
 */
function checkInside(folder: string, path: string): void {
  const base = resolve(folder);
  const full = resolve(path);
  if (full !== base && !full.startsWith(`${base}${sep}`)) {
    throw new Error('An extension file would land outside its folder.');
  }
}

/**
 * The archive reader already refuses unsafe names; this checks again where
 * the bytes actually land, after resolving links, in case a folder on the way
 * was swapped for a link to somewhere else.
 */
async function writeInside(folder: string, path: string, bytes: Uint8Array): Promise<void> {
  const target = resolve(folder, path);
  checkInside(folder, target);
  await mkdir(dirname(target), { recursive: true });
  checkInside(await realpath(folder), await realpath(dirname(target)));
  // `wx` refuses an existing name, links included, so nothing is written through one.
  await writeFile(target, bytes, { flag: 'wx' });
}

/** The ID and version become folder names, so each must stay one plain name. */
function child(parent: string, name: string): string {
  const path = resolve(parent, name);
  if (dirname(path) !== resolve(parent)) {
    throw new Error('An extension ID or version is not a plain folder name.');
  }
  return path;
}

/** A real folder, never a link a hostile process put in its place. */
async function ensureFolder(path: string): Promise<void> {
  await mkdir(path, { recursive: true });
  const stats = await lstat(path);
  if (!stats.isDirectory()) {
    throw new Error('The extension folder is not a folder.');
  }
}

async function stage(root: string, files: ExtensionFiles): Promise<string> {
  const staging = await mkdtemp(join(root, '.staging-'));
  // Every write settles before the cleanup, so none can recreate a folder
  // inside the staging folder after it is removed.
  const results = await Promise.allSettled(
    [...files].map(([path, bytes]) => writeInside(staging, path, bytes)),
  );
  const failure = results.find((result) => result.status === 'rejected');
  if (failure !== undefined) {
    await rm(staging, { recursive: true, force: true });
    throw failure.reason;
  }
  return staging;
}

function isMissing(error: unknown): boolean {
  return (error as NodeJS.ErrnoException).code === 'ENOENT';
}

/** Moves `target` aside; true when there was something to move. */
async function moveAside(target: string, aside: string): Promise<boolean> {
  try {
    await rename(target, aside);
    return true;
  } catch (error) {
    if (isMissing(error)) {
      return false;
    }
    throw error;
  }
}

/**
 * Swaps the staged folder in with renames, which are atomic on one file
 * system. A copy already installed under the same version stays until the new
 * one is in place, and comes back if that fails.
 */
async function swapIn(root: string, staging: string, target: string): Promise<void> {
  const aside = join(root, `.old-${randomUUID()}`);
  const moved = await moveAside(target, aside);
  try {
    await rename(staging, target);
  } catch (error) {
    if (moved) {
      await rename(aside, target);
    }
    throw error;
  }
  await rm(aside, { recursive: true, force: true });
}

/**
 * Installs a verified, approved extension's files into `<root>/<id>/<version>/`
 * (ADR 0004). Files are staged in a fresh folder under `root`, so the final
 * rename stays on one file system, and the staging folder never outlives a
 * failure.
 */
export async function installFiles(
  root: string,
  id: string,
  version: string,
  files: ExtensionFiles,
): Promise<string> {
  const folder = child(root, id);
  const target = child(folder, version);
  await ensureFolder(folder);
  const staging = await stage(root, files);
  try {
    await swapIn(root, staging, target);
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
  return target;
}

/** Removes every other version once the records point at the one to keep. */
export async function pruneVersions(root: string, id: string, keep: string): Promise<void> {
  const folder = join(root, id);
  const names = await readdir(folder);
  await Promise.all(
    names
      .filter((name) => name !== keep)
      .map((name) => rm(join(folder, name), { recursive: true, force: true })),
  );
}
