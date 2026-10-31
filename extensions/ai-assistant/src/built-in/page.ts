import type { ExtensionHost } from '@yapyap/extension-sdk';
import { CATALOG, testCatalog, type Catalog, type Hardware } from './catalog.ts';
import { wllamaEngine, type EngineSetup } from './engine.ts';
import { localModel, type LocalModel, type LocalModelDependencies } from './local-model.ts';
import { browserStore } from './store.ts';

/**
 * Where an unpackaged YapYap serves its E2E tests' model; a packaged one
 * answers 404, so only the pinned catalog is ever used there.
 */
const TEST_MODEL_PATH = '/__yapyap/test-model.json';

/** The catalog, or the test model YapYap serves in place of it. */
export async function catalogFrom(fetcher: typeof fetch): Promise<Catalog> {
  try {
    const response = await fetcher(TEST_MODEL_PATH);
    return (response.ok ? testCatalog(await response.json()) : undefined) ?? CATALOG;
  } catch {
    return CATALOG;
  }
}

/** The parts of `navigator` the private model reads. */
export interface PageNavigator {
  readonly deviceMemory?: number;
  readonly hardwareConcurrency: number;
  readonly gpu?: { requestAdapter: () => Promise<unknown> };
  readonly storage: Pick<StorageManager, 'getDirectory' | 'estimate'>;
}

/** Whether WebGPU gives this page an adapter; common integrated graphics give none. */
export async function hasGpu(page: PageNavigator): Promise<boolean> {
  try {
    return (await page.gpu?.requestAdapter()) != null;
  } catch {
    return false;
  }
}

export const hardwareOf = (page: PageNavigator): Hardware => ({
  memoryGb: page.deviceMemory,
  cores: page.hardwareConcurrency,
});

/** The engine's `.wasm`, beside this module in the signed extension, and whether there is a GPU. */
export const engineSetup = (page: PageNavigator): EngineSetup => ({
  wasm: new URL('wllama.wasm', import.meta.url).href,
  hasGpu: () => hasGpu(page),
});

/** What the hidden page's private model runs with: the page's own storage, network and engine. */
export function pageDependencies(
  host: Pick<ExtensionHost, 'storage'>,
  page: PageNavigator = navigator,
  fetcher: typeof fetch = (input, init) => fetch(input, init),
): LocalModelDependencies {
  let catalog: Promise<Catalog> | undefined;
  return {
    host,
    store: browserStore({
      getDirectory: () => page.storage.getDirectory(),
      estimate: () => page.storage.estimate(),
    }),
    engine: wllamaEngine(engineSetup(page)),
    fetch: fetcher,
    hardware: () => hardwareOf(page),
    catalog: () => (catalog ??= catalogFrom(fetcher)),
    now: () => Date.now(),
  };
}

/** The private model of the assistant's hidden page. */
export const pageLocalModel = (host: Pick<ExtensionHost, 'storage'>): LocalModel =>
  localModel(pageDependencies(host));
