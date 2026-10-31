import { describe, expect, it, vi } from 'vitest';
import { fakeHost } from '../testing/fake-host.ts';
import { memoryFileSystem } from '../testing/opfs.ts';
import { CATALOG } from './catalog.ts';
import {
  catalogFrom,
  engineSetup,
  hardwareOf,
  hasGpu,
  pageDependencies,
  pageLocalModel,
  type PageNavigator,
} from './page.ts';

const TEST_MODEL = { url: 'http://127.0.0.1:9/tiny.gguf', size: 9, sha256: 'a'.repeat(64) };

describe('catalogFrom', () => {
  it('takes the test model YapYap serves, and the pinned catalog otherwise', async () => {
    const served = vi.fn<typeof fetch>().mockResolvedValue(Response.json(TEST_MODEL));
    await expect(catalogFrom(served)).resolves.toMatchObject({ standard: TEST_MODEL });
    expect(served).toHaveBeenCalledWith('/__yapyap/test-model.json');
    const packaged = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 404 }));
    await expect(catalogFrom(packaged)).resolves.toBe(CATALOG);
    const odd = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ url: 1 }));
    await expect(catalogFrom(odd)).resolves.toBe(CATALOG);
    const refused = vi.fn<typeof fetch>().mockRejectedValue(new TypeError('blocked'));
    await expect(catalogFrom(refused)).resolves.toBe(CATALOG);
  });
});

const page = (extra: Partial<PageNavigator> = {}): PageNavigator => ({
  hardwareConcurrency: 8,
  storage: memoryFileSystem(),
  ...extra,
});

describe('the page', () => {
  it('uses the GPU only when WebGPU gives an adapter', async () => {
    await expect(hasGpu(page())).resolves.toBe(false);
    const none = { requestAdapter: () => Promise.resolve(null) };
    await expect(hasGpu(page({ gpu: none }))).resolves.toBe(false);
    const adapter = { requestAdapter: () => Promise.resolve({}) };
    await expect(hasGpu(page({ gpu: adapter }))).resolves.toBe(true);
    const broken = { requestAdapter: () => Promise.reject(new Error('lost')) };
    await expect(hasGpu(page({ gpu: broken }))).resolves.toBe(false);
  });

  it('reads the computer’s memory and cores', () => {
    expect(hardwareOf(page({ deviceMemory: 4 }))).toEqual({ memoryGb: 4, cores: 8 });
  });

  it('runs the private model with the page’s storage, catalog, engine and clock', async () => {
    const { host } = fakeHost();
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json(TEST_MODEL));
    const storage = memoryFileSystem(5);
    const deps = pageDependencies(host, page({ deviceMemory: 2, storage }), fetcher);
    await expect(deps.catalog()).resolves.toMatchObject({ standard: { id: 'test' } });
    await deps.catalog();
    // The catalog is asked for once per page.
    expect(fetcher).toHaveBeenCalledOnce();
    await expect(deps.store.free()).resolves.toBe(5);
    await expect(deps.store.used()).resolves.toBe(0);
    expect(deps.hardware()).toEqual({ memoryGb: 2, cores: 8 });
    expect(deps.now()).toBeGreaterThan(0);
    const setup = engineSetup(page());
    expect(setup.wasm).toMatch(/\/wllama\.wasm$/);
    await expect(setup.hasGpu()).resolves.toBe(false);
    // Without a test's, the page's own fetch, which reads a data address here.
    const own = pageDependencies(host);
    await expect((await own.fetch('data:,hi')).text()).resolves.toBe('hi');
    expect(pageLocalModel(host).onChange).toBeTypeOf('function');
  });
});
