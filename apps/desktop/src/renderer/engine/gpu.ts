/** The part of `navigator` that tells whether there is a GPU. */
export interface GpuNavigator {
  readonly gpu?: { requestAdapter: () => Promise<unknown> };
}

/** Whether WebGPU gives this page an adapter; common integrated graphics give none. */
export async function hasGpu(page: GpuNavigator): Promise<boolean> {
  try {
    return (await page.gpu?.requestAdapter()) != null;
  } catch {
    return false;
  }
}
