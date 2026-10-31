/**
 * A model the assistant can run on this computer (#457): a GGUF file pinned
 * by its exact address, size and SHA-256, so a changed or tampered file is
 * refused. The address names a commit, never a branch, so it cannot move.
 */
export interface BuiltInModel {
  readonly id: string;
  /** How the bar's model list names it, inside "Private model (…)". */
  readonly name: string;
  readonly url: string;
  readonly size: number;
  readonly sha256: string;
}

/**
 * Qwen2.5 1.5B Instruct, Apache-2.0, in Q4_K_M: good enough at short
 * replies and rewording, and small enough for a typical laptop's processor.
 */
const STANDARD: BuiltInModel = {
  id: 'qwen2.5-1.5b-instruct-q4_k_m',
  name: 'Qwen2.5 1.5B',
  url: 'https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct-GGUF/resolve/91cad51170dc346986eccefdc2dd33a9da36ead9/qwen2.5-1.5b-instruct-q4_k_m.gguf',
  size: 1_117_320_736,
  sha256: '6a1a2eb6d15622bf3c96857206351ba97e1af16c30d7a74ee38970e434e9407e',
};

/** Qwen2.5 0.5B Instruct, Apache-2.0, in Q4_K_M: for computers short of memory or cores. */
const SMALL: BuiltInModel = {
  id: 'qwen2.5-0.5b-instruct-q4_k_m',
  name: 'Qwen2.5 0.5B',
  url: 'https://huggingface.co/Qwen/Qwen2.5-0.5B-Instruct-GGUF/resolve/9217f5db79a29953eb74d5343926648285ec7e67/qwen2.5-0.5b-instruct-q4_k_m.gguf',
  size: 491_400_032,
  sha256: '74a4da8c9fdbcd15bd1f6d01d621410d31c6fc00986f5eb687824e7b93d7a9db',
};

/** The models to choose from: the usual one, and the one for weaker computers. */
export interface Catalog {
  readonly standard: BuiltInModel;
  readonly small: BuiltInModel;
}

export const CATALOG: Catalog = { standard: STANDARD, small: SMALL };

/** What the page can tell of the computer: memory in GB, which browsers cap at 8 or more, and cores. */
export interface Hardware {
  readonly memoryGb: number | undefined;
  readonly cores: number;
}

const ENOUGH_MEMORY_GB = 8;
const ENOUGH_CORES = 4;

/**
 * The model that suits the computer: the smaller one under 8 GB of memory
 * or 4 cores, where the usual one would be slow or not fit beside
 * everything else. Unknown memory counts as enough.
 */
export function modelFor(hardware: Hardware, catalog: Catalog = CATALOG): BuiltInModel {
  const weak = (hardware.memoryGb ?? ENOUGH_MEMORY_GB) < ENOUGH_MEMORY_GB;
  return weak || hardware.cores < ENOUGH_CORES ? catalog.small : catalog.standard;
}

/** The catalog's model with `id`, if it still lists one. */
export const modelById = (id: unknown, catalog: Catalog = CATALOG): BuiltInModel | undefined =>
  [catalog.standard, catalog.small].find((model) => model.id === id);

const SHA256 = /^[0-9a-f]{64}$/;

/**
 * The test model YapYap serves an unpackaged build in E2E tests, in place
 * of both of the catalog's, or undefined for anything else. A packaged
 * YapYap never serves one, so nobody can point an installed assistant at
 * another file.
 */
export function testCatalog(body: unknown): Catalog | undefined {
  const { url, size, sha256 } = Object(body) as Record<string, unknown>;
  const valid =
    typeof url === 'string' &&
    URL.canParse(url) &&
    Number.isSafeInteger(size) &&
    (size as number) > 0 &&
    typeof sha256 === 'string' &&
    SHA256.test(sha256);
  if (!valid) {
    return undefined;
  }
  const model = { id: 'test', name: 'Test', url, size: size as number, sha256 };
  return { standard: model, small: model };
}

const MB = 1_000_000;
const GB = 1_000_000_000;

/** A size as people read it: "about 1.1 GB", "about 490 MB". */
export function aboutSize(bytes: number): string {
  if (bytes >= GB) {
    return `about ${(bytes / GB).toFixed(1)} GB`;
  }
  return `about ${String(Math.max(1, Math.round(bytes / (10 * MB)) * 10))} MB`;
}

const megabytes = new Intl.NumberFormat('en-US');

/** Bytes in whole megabytes, grouped: "1,117". */
export const inMegabytes = (bytes: number): string => megabytes.format(Math.round(bytes / MB));
